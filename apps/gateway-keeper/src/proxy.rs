use std::sync::Arc;

use axum::{
    body::Body,
    extract::{OriginalUri, State},
    http::{
        HeaderMap, Method, StatusCode, Uri,
        header::{CONNECTION, HOST, TRANSFER_ENCODING},
    },
    response::{IntoResponse, Response},
};
use bytes::Bytes;
use tracing::{error, warn};

use crate::{AppState, circuit_breaker::RedisCircuitBreaker};

use axum::extract::Query;
use bookit_proto::search::SearchRequest;
use bookit_proto::search::search_service_client::SearchServiceClient;
use std::collections::HashMap;

struct ProxyTarget<'a> {
    service_name: &'a str,
    base_url: &'a str,
    client: &'a reqwest::Client,
    circuit_breaker: &'a RedisCircuitBreaker,
}

pub async fn proxy_to_search_server(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if !state.circuit_breaker.allow_request("search-server").await {
        return RedisCircuitBreaker::service_busy_response();
    }

    let query = params.get("q").cloned().unwrap_or_default();
    let city = params.get("city").cloned().unwrap_or_default();

    let mut client =
        match SearchServiceClient::connect(state.search_server_grpc_url.as_ref().clone()).await {
            Ok(c) => c,
            Err(err) => {
                error!(error = %err, "Failed to connect to SearchService gRPC");
                state.circuit_breaker.record_failure("search-server").await;
                return RedisCircuitBreaker::service_busy_response();
            }
        };

    let request = tonic::Request::new(SearchRequest { query, city });

    match client.search(request).await {
        Ok(response) => {
            state.circuit_breaker.record_success("search-server").await;
            let results = response.into_inner().results_json;
            (
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, "application/json")],
                results,
            )
                .into_response()
        }
        Err(err) => {
            error!(error = %err, "SearchService gRPC call failed");
            state.circuit_breaker.record_failure("search-server").await;
            RedisCircuitBreaker::service_busy_response()
        }
    }
}

pub async fn proxy_to_http_server(
    State(state): State<Arc<AppState>>,
    OriginalUri(original_uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let target = ProxyTarget {
        service_name: "http-server",
        base_url: &state.http_server_url,
        client: &state.http_client,
        circuit_breaker: &state.circuit_breaker,
    };
    proxy_request(target, method, original_uri, headers, body).await
}

async fn proxy_request(
    target: ProxyTarget<'_>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !target
        .circuit_breaker
        .allow_request(target.service_name)
        .await
    {
        warn!(
            service = %target.service_name,
            uri = %uri,
            "Circuit breaker OPEN: returning 503 Service Unavailable without calling downstream server"
        );
        return RedisCircuitBreaker::service_busy_response();
    }

    let base = target.base_url.trim_end_matches('/');
    let path_and_query = uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or_else(|| uri.path());
    let target_url = format!("{}{}", base, path_and_query);

    let mut req_builder = target.client.request(method.clone(), &target_url);
    for (key, value) in headers.iter() {
        if key != HOST && key != CONNECTION {
            req_builder = req_builder.header(key, value);
        }
    }

    let req = match req_builder.body(body).build() {
        Ok(r) => r,
        Err(err) => {
            error!(
                service = %target.service_name,
                error = %err,
                "Failed to build proxy request for {}",
                target_url
            );
            return (StatusCode::INTERNAL_SERVER_ERROR, "Internal Gateway Error").into_response();
        }
    };

    match target.client.execute(req).await {
        Ok(res) => {
            let status = res.status();
            if status.is_server_error() {
                target
                    .circuit_breaker
                    .record_failure(target.service_name)
                    .await;
                warn!(
                    service = %target.service_name,
                    status = %status,
                    "Downstream service returned 5xx error; recording failure"
                );
                return RedisCircuitBreaker::service_busy_response();
            }

            target
                .circuit_breaker
                .record_success(target.service_name)
                .await;

            let mut response_builder = Response::builder().status(status);
            for (key, value) in res.headers().iter() {
                if key != TRANSFER_ENCODING
                    && key != CONNECTION
                    && !key.as_str().to_lowercase().starts_with("access-control-")
                {
                    response_builder = response_builder.header(key, value);
                }
            }

            let response_bytes = res.bytes().await.unwrap_or_default();
            response_builder
                .body(Body::from(response_bytes))
                .unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to construct response",
                    )
                        .into_response()
                })
        }
        Err(err) => {
            target
                .circuit_breaker
                .record_failure(target.service_name)
                .await;
            error!(
                service = %target.service_name,
                error = %err,
                "Downstream service unreachable; recording failure and returning 503"
            );
            RedisCircuitBreaker::service_busy_response()
        }
    }
}
