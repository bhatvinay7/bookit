use axum::{routing::get, Router};
use dotenvy::dotenv;
use http_server::api;
use http_server::api::state::AppState;
use std::sync::Arc;

/// Test database URL — use a dedicated test DB or the main DB with cleanup.
/// Set TEST_DATABASE_URL env var to override.
pub fn test_db_url() -> String {
    dotenv().ok();
    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .unwrap_or_else(|_| "postgresql://neondb_owner:npg_cCStswDNj87q@ep-quiet-base-aukgk05o-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require".into())
}

pub async fn create_test_app() -> Router {
    let _ = rustls::crypto::ring::default_provider().install_default();
    dotenv().ok();

    let db_pool = bookit_db::db::create_db_pool();
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "supersecretjwtkey".into());
    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL must be set");
    let redis_client = redis::Client::open(redis_url).expect("Invalid Redis URL");

    let mongo_url = std::env::var("MONGODB_URL").expect("MONGODB_URL must be set");
    let mongo_db_name = std::env::var("MONGODB_DB").unwrap_or_else(|_| "bookit_test".into());

    let mongo_opts = mongodb::options::ClientOptions::parse(&mongo_url)
        .await
        .unwrap();
    let mongo_client = Arc::new(mongodb::Client::with_options(mongo_opts).unwrap());

    let state = Arc::new(AppState {
        db_pool,
        jwt_secret,
        redis_client,
        mongo_client,
        mongo_db_name,
    });

    Router::new()
        .route("/health", get(|| async { "OK" }))
        .nest("/api/auth", api::auth::auth_routes(state.clone()))
        .nest("/api/admin", api::admin::admin_routes(state.clone()))
        .nest("/api/user", api::user::user_routes(state.clone()))
}

/// Return a valid admin JWT for test requests.
/// Uses the test JWT_SECRET.
pub fn admin_jwt() -> String {
    use jsonwebtoken::{encode, EncodingKey, Header};
    use serde::{Deserialize, Serialize};
    #[derive(Serialize, Deserialize)]
    struct C {
        sub: String,
        email: String,
        role: String,
        exp: usize,
    }
    let exp = (chrono::Utc::now() + chrono::Duration::hours(1)).timestamp() as usize;
    encode(
        &Header::default(),
        &C {
            sub: "1".into(),
            email: "admin@test.com".into(),
            role: "Admin".into(),
            exp,
        },
        &EncodingKey::from_secret(b"supersecretjwtkey"),
    )
    .unwrap()
}
