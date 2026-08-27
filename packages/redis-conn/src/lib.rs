pub mod adapter;
pub mod cluster_lock;
pub mod keys;
pub mod seat_lock;
pub mod single_node_lock;

pub use cluster_lock::ClusterLock;
pub use seat_lock::SeatLock;
pub use single_node_lock::SingleNodeLock;

use bb8_redis::{RedisConnectionManager, bb8};
use redis::IntoConnectionInfo;
use socket2::TcpKeepalive;
use std::time::Duration;

pub type RedisPool = bb8::Pool<RedisConnectionManager>;

pub async fn establish_pool() -> Result<RedisPool, redis::RedisError> {
    dotenvy::dotenv().ok();
    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL must be set in .env");
    let connection_info = redis_url.into_connection_info()?.set_tcp_settings(
        redis::io::tcp::TcpSettings::default().set_keepalive(
            TcpKeepalive::new()
                .with_time(Duration::from_secs(60))
                .with_interval(Duration::from_secs(30)),
        ),
    );
    let manager = RedisConnectionManager::new(connection_info)
        .expect("Failed to create Redis connection manager");

    bb8::Pool::builder()
        .max_size(30)
        .connection_timeout(Duration::from_secs(
            std::env::var("REDIS_CONNECTION_TIMEOUT_SECS")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(60),
        ))
        .idle_timeout(None)
        .max_lifetime(None)
        .test_on_check_out(true)
        .build(manager)
        .await
}

pub async fn establish_seat_lock() -> Result<std::sync::Arc<dyn SeatLock>, redis::RedisError> {
    dotenvy::dotenv().ok();
    let redis_mode = std::env::var("REDIS_MODE").unwrap_or_else(|_| "single".to_string());

    if redis_mode.eq_ignore_ascii_case("cluster") {
        let cluster_url = std::env::var("REDIS_CLUSTER_URL")
            .expect("REDIS_CLUSTER_URL must be set in production");
        let urls = vec![cluster_url];
        let lock = ClusterLock::establish(urls).await?;
        Ok(std::sync::Arc::new(lock))
    } else {
        let lock = SingleNodeLock::establish().await?;
        Ok(std::sync::Arc::new(lock))
    }
}
