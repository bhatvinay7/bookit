pub mod adapter;
pub mod keys;
pub mod single_node_lock;
pub mod cluster_lock;
pub mod seat_lock;

pub use single_node_lock::SingleNodeLock;
pub use cluster_lock::ClusterLock;
pub use seat_lock::SeatLock;

use bb8_redis::{RedisConnectionManager, bb8};

pub type RedisPool = bb8::Pool<RedisConnectionManager>;

pub async fn establish_pool() -> Result<RedisPool, redis::RedisError> {
    dotenvy::dotenv().ok();
    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL must be set in .env");
    let manager = RedisConnectionManager::new(redis_url.clone())
        .expect("Failed to create Redis connection manager");

    bb8::Pool::builder()
        .max_size(15)
        .test_on_check_out(true)
        .build(manager)
        .await
}

pub async fn establish_seat_lock() -> Result<std::sync::Arc<dyn SeatLock>, redis::RedisError> {
    dotenvy::dotenv().ok();
    let app_mode = std::env::var("APP_MODE").unwrap_or_else(|_| "dev".to_string());
    
    if app_mode == "production" {
        let cluster_url = std::env::var("REDIS_CLUSTER_URL").expect("REDIS_CLUSTER_URL must be set in production");
        let urls = vec![cluster_url];
        let lock = ClusterLock::establish(urls).await?;
        Ok(std::sync::Arc::new(lock))
    } else {
        let lock = SingleNodeLock::establish().await?;
        Ok(std::sync::Arc::new(lock))
    }
}
