use axum::{Router, routing::get};
use dotenvy::dotenv;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use http_server::api;
use http_server::api::state::AppState;

#[tokio::main]
async fn main() {
    dotenv().ok();
    bookit_telemetry::init_telemetry("bookit-http-server");
    let _ = rustls::crypto::ring::default_provider().install_default();

    let cors = CorsLayer::permissive();

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

    let rmq_channel = match rmq_conn::connect_with_retry().await {
        Ok(conn) => match conn.create_channel().await {
            Ok(ch) => {
                let mut q_args = std::collections::BTreeMap::new();
                q_args.insert(
                    "x-dead-letter-exchange".into(),
                    lapin::types::AMQPValue::LongString("payment_dlx".into()),
                );
                q_args.insert(
                    "x-dead-letter-routing-key".into(),
                    lapin::types::AMQPValue::LongString("failed".into()),
                );
                let _ = ch
                    .queue_declare(
                        "payment_processing".into(),
                        lapin::options::QueueDeclareOptions::default(),
                        lapin::types::FieldTable::from(q_args),
                    )
                    .await;
                Some(ch)
            }
            Err(_) => None,
        },
        Err(_) => None,
    };

    let app_state = Arc::new(AppState {
        db_pool,
        redis_client,
        redis_manager,
        single_node_lock,
        jwt_secret,
        mongo_client: Arc::new(mongo_client),
        mongo_db_name,
        rmq_channel,
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

    let addr = SocketAddr::from(([0, 0, 0, 0], 8082));
    tracing::info!(%addr, "BookIt API listening");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
