use bookit_db::db::DbPool;
use redis::Client as RedisClient;
use std::sync::Arc;

/// Shared application state injected into all handlers via Axum `State`.
#[derive(Clone)]
pub struct AppState {
    pub db_pool: DbPool,
    pub redis_client: RedisClient,
    pub redis_manager: redis::aio::ConnectionManager,
    pub single_node_lock: Arc<bookit_redis::SingleNodeLock>,
    pub jwt_secret: String,
    pub mongo_client: Arc<mongodb::Client>,
    pub mongo_db_name: String,
    pub rmq_channel: Option<lapin::Channel>,
}
