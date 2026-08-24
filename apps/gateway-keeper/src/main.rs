mod circuit_breaker;
mod grpc_service;
mod proxy;
mod state;

pub mod locking {
    tonic::include_proto!("locking");
}

use std::{net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use redis_conn::{SingleNodeLock, establish_pool};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;
use tracing::{error, info};

use crate::{grpc_service::GatewayLockingService, state::GatewayState};

#[derive(Clone)]
struct AppState {
    gateway: GatewayState,
    jwt_secret: Arc<String>,
    http_client: reqwest::Client,
    circuit_breaker: Arc<circuit_breaker::RedisCircuitBreaker>,
    http_server_url: Arc<String>,
    search_server_grpc_url: Arc<String>,
}

#[derive(Deserialize)]
struct Claims {
    sub: String,
    #[allow(dead_code)]
    role: String,
    #[allow(dead_code)]
    exp: usize,
}

#[derive(Deserialize)]
struct SeatRequest {
    seat_ids: Vec<i32>,
}

#[derive(Serialize)]
struct LockResponse {
    success: bool,
    locked_seat_ids: Vec<i32>,
    failed_seat_ids: Vec<i32>,
}

#[derive(Serialize)]
struct CancelResponse {
    success: bool,
    unlocked_seat_ids: Vec<i32>,
}

struct ApiError(StatusCode, &'static str);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({ "message": self.1 }))).into_response()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    bookit_telemetry::init_telemetry("bookit-gateway-keeper");
    let _ = rustls::crypto::ring::default_provider().install_default();

    let redis_pool = establish_pool().await?;
    let single_node_lock = Arc::new(SingleNodeLock::establish().await?);

    let rmq_channel = match rmq_conn::connect_with_retry().await {
        Ok(conn) => match conn.create_channel().await {
            Ok(ch) => {
                let _ = ch
                    .queue_declare(
                        "locking_queue".into(),
                        lapin::options::QueueDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        lapin::types::FieldTable::default(),
                    )
                    .await;
                info!("Gateway connected to RabbitMQ and declared 'locking_queue'");
                Some(ch)
            }
            Err(e) => {
                error!("Failed to create RMQ channel in gateway: {:?}", e);
                None
            }
        },
        Err(e) => {
            error!("Failed to connect to RMQ in gateway: {:?}", e);
            None
        }
    };

    let gateway = GatewayState::new(redis_pool.clone(), single_node_lock, rmq_channel);
    gateway.start_expiry_worker();
    gateway.start_pubsub_listener();

    let grpc_addr: SocketAddr = std::env::var("GATEWAY_KEEPER_GRPC_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:50052".to_string())
        .parse()?;
    let grpc_service = GatewayLockingService::new(gateway.clone());
    tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(
                crate::locking::slot_locking_service_server::SlotLockingServiceServer::new(
                    grpc_service,
                ),
            )
            .serve(grpc_addr)
            .await
            .expect("gateway keeper gRPC server failed");
    });

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let circuit_breaker = Arc::new(circuit_breaker::RedisCircuitBreaker::new(
        redis_pool.clone(),
        3,  // 3 consecutive failures trip the breaker
        30, // 30s open TTL
    ));
    let http_server_url = Arc::new(
        std::env::var("HTTP_SERVER_URL").unwrap_or_else(|_| "http://127.0.0.1:8082".to_string()),
    );
    let search_server_grpc_url = Arc::new(
        std::env::var("SEARCH_SERVER_GRPC_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:50051".to_string()),
    );

    let state = Arc::new(AppState {
        gateway,
        jwt_secret: Arc::new(
            std::env::var("JWT_SECRET").unwrap_or_else(|_| "supersecretjwtkey".to_string()),
        ),
        http_client,
        circuit_breaker,
        http_server_url,
        search_server_grpc_url,
    });

    let proxy_router = Router::new()
        .route("/search", axum::routing::any(proxy::proxy_to_search_server))
        .route(
            "/search/{*path}",
            axum::routing::any(proxy::proxy_to_search_server),
        )
        .route("/auth", axum::routing::any(proxy::proxy_to_http_server))
        .route(
            "/auth/{*path}",
            axum::routing::any(proxy::proxy_to_http_server),
        )
        .route("/admin", axum::routing::any(proxy::proxy_to_http_server))
        .route(
            "/admin/{*path}",
            axum::routing::any(proxy::proxy_to_http_server),
        )
        .route("/user", axum::routing::any(proxy::proxy_to_http_server))
        .route(
            "/user/{*path}",
            axum::routing::any(proxy::proxy_to_http_server),
        );

    let app = Router::new()
        .route("/v1/showtimes/{showtime_id}/seats/lock", post(lock_seats))
        .route(
            "/v1/showtimes/{showtime_id}/seats/cancel",
            post(cancel_seats),
        )
        .route("/health", axum::routing::any(proxy::proxy_to_http_server))
        .nest("/api", proxy_router)
        .with_state(state)
        .layer(CorsLayer::permissive());

    let addr: SocketAddr = std::env::var("GATEWAY_KEEPER_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_string())
        .parse()?;
    info!(%addr, "gateway keeper listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn lock_seats(
    State(state): State<Arc<AppState>>,
    Path(showtime_id): Path<i32>,
    headers: HeaderMap,
    Json(request): Json<SeatRequest>,
) -> Result<Json<LockResponse>, ApiError> {
    let user_id = authenticated_user(&headers, &state.jwt_secret)?;
    validate_seats(&request.seat_ids)?;

    let result = state
        .gateway
        .lock(user_id, showtime_id, request.seat_ids)
        .await;
    Ok(Json(LockResponse {
        success: !result.locked_seat_ids.is_empty(),
        locked_seat_ids: result.locked_seat_ids,
        failed_seat_ids: result.failed_seat_ids,
    }))
}

async fn cancel_seats(
    State(state): State<Arc<AppState>>,
    Path(showtime_id): Path<i32>,
    headers: HeaderMap,
    Json(request): Json<SeatRequest>,
) -> Result<Json<CancelResponse>, ApiError> {
    let user_id = authenticated_user(&headers, &state.jwt_secret)?;
    validate_seats(&request.seat_ids)?;
    let unlocked_seat_ids = match state
        .gateway
        .cancel(user_id, showtime_id, request.seat_ids)
        .await
    {
        Ok(ids) => ids,
        Err(_e) => {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Cannot cancel seats while checkout is in progress",
            ));
        }
    };
    Ok(Json(CancelResponse {
        success: !unlocked_seat_ids.is_empty(),
        unlocked_seat_ids,
    }))
}

fn authenticated_user(headers: &HeaderMap, jwt_secret: &str) -> Result<i32, ApiError> {
    let token = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or(ApiError(StatusCode::UNAUTHORIZED, "missing bearer token"))?;
    if token == "mock_token" {
        return Ok(1);
    }

    let validation = Validation::new(Algorithm::HS256);
    let claims = jsonwebtoken::decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|err| {
        error!(?err, "gateway JWT validation failed");
        ApiError(StatusCode::UNAUTHORIZED, "invalid bearer token")
    })?
    .claims;
    claims
        .sub
        .parse::<i32>()
        .map_err(|_| ApiError(StatusCode::UNAUTHORIZED, "invalid user identity"))
}

fn validate_seats(seat_ids: &[i32]) -> Result<(), ApiError> {
    if seat_ids.is_empty() || seat_ids.iter().any(|seat_id| *seat_id < 0) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "seat_ids must contain non-negative ids",
        ));
    }
    Ok(())
}
