use std::sync::Arc;

use axum::{
    body::Body,
    extract::{OriginalUri, State},
    http::{
        HeaderMap, Method, StatusCode, Uri,
        header::{AUTHORIZATION, CONNECTION, HOST, TRANSFER_ENCODING},
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

/// Kubernetes liveness/readiness endpoint for the gateway process itself.
/// Downstream availability is handled independently by the circuit breaker.
pub async fn health() -> &'static str {
    "OK"
}

#[tracing::instrument(skip_all, fields(otel.name = "search.SearchService/Search", otel.kind = "client"))]
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

    let mut request = tonic::Request::new(SearchRequest { query, city });
    bookit_telemetry::inject_grpc(&mut request);

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

/// Admin and user endpoints require a Bearer token. Check for it before the
/// downstream circuit breaker so an unauthenticated caller always receives an
/// authentication failure, even when http-server is temporarily unavailable.
pub async fn proxy_to_authenticated_http_server(
    State(state): State<Arc<AppState>>,
    OriginalUri(original_uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !has_bearer_token(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({ "error": "Missing Authorization header" })),
        )
            .into_response();
    }

    let target = ProxyTarget {
        service_name: "http-server",
        base_url: &state.http_server_url,
        client: &state.http_client,
        circuit_breaker: &state.circuit_breaker,
    };
    proxy_request(target, method, original_uri, headers, body).await
}

fn has_bearer_token(headers: &HeaderMap) -> bool {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|token| !token.trim().is_empty())
}

/// Only network reachability failures may change the transport circuit state.
///
/// `reqwest::Client::execute` returns an `Ok(Response)` for all HTTP statuses,
/// including JSON parsing, validation, authorization, and database errors
/// produced by http-server.  Those responses are application failures and
/// must be passed through unchanged.  If reqwest itself fails for a reason
/// other than connecting to the service or waiting for it to respond, report a
/// gateway error without poisoning the circuit for every later request.
fn is_downstream_unreachable(error: &reqwest::Error) -> bool {
    error.is_connect() || error.is_timeout()
}

fn upstream_proxy_error_response() -> Response {
    (
        StatusCode::BAD_GATEWAY,
        axum::Json(serde_json::json!({
            "message": "The upstream response could not be processed.",
            "code": "UPSTREAM_ERROR"
        })),
    )
        .into_response()
}

#[tracing::instrument(skip_all, fields(otel.name = "HTTP http-server", otel.kind = "client"))]
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

    let mut req = match req_builder.body(body).build() {
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

    bookit_telemetry::inject_headers(req.headers_mut());
    match target.client.execute(req).await {
        Ok(res) => {
            let status = res.status();
            // An HTTP response, even a 5xx from an application endpoint, proves
            // the upstream is reachable. Propagate it unchanged instead of
            // opening the transport circuit and turning all later admin/API
            // requests into gateway-generated 503s.
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

            let stream = res.bytes_stream();
            response_builder
                .body(Body::from_stream(stream))
                .unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to construct response",
                    )
                        .into_response()
                })
        }
        Err(err) => {
            if is_downstream_unreachable(&err) {
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
            } else {
                error!(
                    service = %target.service_name,
                    error = %err,
                    "Proxy request failed without a downstream reachability failure; returning 502 without opening the circuit"
                );
                upstream_proxy_error_response()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bearer_token_check_rejects_missing_or_empty_tokens() {
        assert!(!has_bearer_token(&HeaderMap::new()));

        let mut empty = HeaderMap::new();
        empty.insert(AUTHORIZATION, "Bearer ".parse().unwrap());
        assert!(!has_bearer_token(&empty));

        let mut valid = HeaderMap::new();
        valid.insert(AUTHORIZATION, "Bearer token-value".parse().unwrap());
        assert!(has_bearer_token(&valid));
    }

    #[test]
    fn non_reachability_proxy_errors_are_not_reported_as_circuit_open() {
        let response = upstream_proxy_error_response();

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    }
}
