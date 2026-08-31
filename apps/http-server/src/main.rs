use axum::{
    Router,
    http::{HeaderValue, Method, header},
    routing::get,
};
use dotenvy::dotenv;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use http_server::api;
use http_server::api::state::AppState;

#[tokio::main]
async fn main() {
    dotenv().ok();
    bookit_telemetry::init_telemetry("bookit-http-server");
    let _ = rustls::crypto::ring::default_provider().install_default();

    let allowed_origins = env::var("CORS_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:3000".into())
        .split(',')
        .filter_map(|origin| origin.trim().parse::<HeaderValue>().ok())
        .collect::<Vec<_>>();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    // ── PostgreSQL ────────────────────────────────────────────────────────────
    let db_pool = bookit_db::db::create_db_pool();

    // ── Redis ─────────────────────────────────────────────────────────────────
    let redis_url = env::var("REDIS_URL").expect("REDIS_URL must be set");
    let redis_client = redis::Client::open(redis_url).expect("Invalid Redis URL");
    let redis_manager = redis::aio::ConnectionManager::new(redis_client.clone())
        .await
        .expect("Failed to initialize Redis ConnectionManager");
    let single_node_lock = Arc::new(
        bookit_redis::SingleNodeLock::establish()
            .await
            .expect("Failed to establish SingleNodeLock cluster"),
    );

    // ── JWT ───────────────────────────────────────────────────────────────────
    let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "supersecretjwtkey".into());

    // ── MongoDB ───────────────────────────────────────────────────────────────
    let mongo_client = bookit_mongo::create_mongo_client()
        .await
        .expect("Failed to connect to MongoDB");
    let mongo_db_name = env::var("MONGODB_DB").unwrap_or_else(|_| "bookit".into());

    let app_state = Arc::new(AppState {
        db_pool,
        redis_client,
        redis_manager,
        single_node_lock,
        jwt_secret,
        mongo_client: Arc::new(mongo_client),
        mongo_db_name,
    });

    let app = Router::new()
        .route("/health", get(|| async { "OK" }))
        .nest(
            "/api/internal",
            api::internal::internal_routes(app_state.clone()),
        )
        .nest("/api/auth", api::auth::auth_routes(app_state.clone()))
        .nest("/api/admin", api::admin::admin_routes(app_state.clone()))
        .nest("/api/user", api::user::user_routes(app_state.clone()))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let http_port = env::var("HTTP_PORT")
        .unwrap_or_else(|_| "8082".into())
        .parse::<u16>()
        .expect("HTTP_PORT must be a valid TCP port");
    let addr = SocketAddr::from(([0, 0, 0, 0], http_port));
    tracing::info!(%addr, "BookIt API listening");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
