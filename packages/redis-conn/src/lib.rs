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

    let attempts = env_u32("CONNECTION_RETRY_ATTEMPTS", 30);
    let mut delay = Duration::from_millis(env_u64("CONNECTION_RETRY_INITIAL_MS", 500));
    let max_delay = Duration::from_millis(env_u64("CONNECTION_RETRY_MAX_MS", 30_000));
    let connection_timeout = Duration::from_secs(env_u64("REDIS_CONNECTION_TIMEOUT_SECS", 60));

    for attempt in 1..=attempts {
        match bb8::Pool::builder()
            .max_size(30)
            .idle_timeout(None)
            .max_lifetime(None)
            .connection_timeout(connection_timeout)
            .test_on_check_out(true)
            .build(manager.clone())
            .await
        {
            Ok(pool) => return Ok(pool),
            Err(error) if attempt < attempts => {
                tracing::warn!(attempt, attempts, ?delay, %error, "Redis is unavailable; retrying");
                tokio::time::sleep(delay).await;
                delay = delay.saturating_mul(2).min(max_delay);
            }
            Err(error) => return Err(error),
        }
    }

    unreachable!("connection retry attempts must be at least one")
}

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_u32(name: &str, default: u32) -> u32 {
    env_u64(name, u64::from(default)).clamp(1, u64::from(u32::MAX)) as u32
}

pub async fn establish_seat_lock() -> Result<std::sync::Arc<dyn SeatLock>, redis::RedisError> {
    dotenvy::dotenv().ok();
    let app_mode = std::env::var("APP_MODE").unwrap_or_else(|_| "dev".to_string());

    if app_mode == "production" {
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
