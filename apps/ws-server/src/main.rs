mod grpc_client;
mod handlers;
mod hooks;
mod locking;

use axum::{
    Router,
    extract::{Query, State, ws::WebSocketUpgrade},
    routing::get,
};
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::trace::TraceLayer;

use grpc_client::GrpcLockClient;
use handlers::handle_socket;
use hooks::WsHooks;
use redis_conn::adapter::RedisSocketAdapter;
use redis_conn::{establish_pool, establish_seat_lock};

#[derive(Clone)]
pub struct AppState {
    pub hooks: Arc<WsHooks>,
}

#[derive(Deserialize)]
struct WsQuery {
    pub token: String,
}

#[derive(Deserialize)]
#[allow(dead_code)] // `role` and `exp` are validated JWT claims retained for schema compatibility.
struct Claims {
    pub sub: String,
    pub role: String,
    pub exp: usize,
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    bookit_telemetry::init_telemetry("bookit-ws-server");
    let _ = rustls::crypto::ring::default_provider().install_default();
    tracing::info!("Starting WebSocket server with gRPC integration");

    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL must be set");
    let gateway_grpc_url =
        std::env::var("GATEWAY_KEEPER_GRPC_URL").unwrap_or_else(|_| "http://[::1]:50052".into());
    let grpc_client = GrpcLockClient::connect(gateway_grpc_url)
        .await
        .expect("Failed to connect to gateway keeper gRPC server");
    let redis_pool = establish_pool().await.expect("Failed to create Redis pool");
    let single_node_lock = establish_seat_lock()
        .await
        .expect("Failed to create SeatLock");

    let adapter = RedisSocketAdapter::new(redis_url.clone());
    let hooks = Arc::new(WsHooks::new(
        adapter.clone(),
        redis_pool.clone(),
        grpc_client,
        single_node_lock,
    ));

    let state = Arc::new(AppState { hooks });

    // Start background Redis PubSub listener for the adapter
    let adapter_clone = adapter.clone();
    tokio::spawn(async move {
        adapter_clone.run_subscriber().await;
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let ws_port = std::env::var("WS_PORT")
        .unwrap_or_else(|_| "8081".into())
        .parse::<u16>()
        .expect("WS_PORT must be a valid TCP port");
    let addr = SocketAddr::from(([0, 0, 0, 0], ws_port));
    tracing::info!(%addr, "WebSocket server listening");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<Arc<AppState>>,
) -> impl axum::response::IntoResponse {
    let user_id = if query.token == "mock_token" {
        "1".to_string() // Mock user ID for dev
    } else {
        let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "supersecretjwtkey".into());

        let validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);

        let token_data = match jsonwebtoken::decode::<Claims>(
            &query.token,
            &jsonwebtoken::DecodingKey::from_secret(jwt_secret.as_bytes()),
            &validation,
        ) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("JWT validation failed: {:?}", e);
                return Err(axum::http::StatusCode::UNAUTHORIZED);
            }
        };
        token_data.claims.sub.to_string()
    };
    let socket_id = uuid::Uuid::new_v4().to_string();

    Ok(ws.on_upgrade(move |socket| {
        handle_socket(
            socket,
            state,
            user_id.parse::<i32>().unwrap_or(0),
            socket_id,
        )
    }))
}
