use crate::api::state::AppState;
use anyhow::Result;
use std::sync::Arc;

/// Try to get a JSON-encoded value from Redis. Returns None on miss or error.
pub fn get_cached<T: serde::de::DeserializeOwned>(state: &Arc<AppState>, key: &str) -> Option<T> {
    let mut conn = state.redis_client.get_connection().ok()?;
    let raw: String = redis::cmd("GET").arg(key).query(&mut conn).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Store a JSON-encoded value in Redis with a TTL (seconds).
pub fn set_cached<T: serde::Serialize>(
    state: &Arc<AppState>,
    key: &str,
    value: &T,
    ttl_secs: u64,
) -> Result<()> {
    let raw = serde_json::to_string(value)?;
    let mut conn = state.redis_client.get_connection()?;
    redis::cmd("SETEX")
        .arg(key)
        .arg(ttl_secs)
        .arg(raw)
        .query::<()>(&mut conn)?;
    Ok(())
}

/// Invalidate (delete) a cache key.
pub fn invalidate(state: &Arc<AppState>, key: &str) {
    if let Ok(mut conn) = state.redis_client.get_connection() {
        let _: Result<(), _> = redis::cmd("DEL").arg(key).query(&mut conn);
    }
}

use redis::AsyncCommands;
use tokio::time::{Duration, sleep};

/// Async: Try to get a JSON-encoded value from Redis with retry logic. Returns None on miss or error.
pub async fn get_async_cached<T: serde::de::DeserializeOwned>(
    state: &Arc<AppState>,
    key: &str,
) -> Option<T> {
    let mut retries = 3;
    let mut delay = Duration::from_millis(50);

    loop {
        let mut conn = state.redis_manager.clone();
        let cached_res: Result<Option<String>, redis::RedisError> = conn.get(key).await;
        match cached_res {
            Ok(Some(raw)) => return serde_json::from_str(&raw).ok(),
            Ok(None) => return None,
            Err(e) => {
                eprintln!("Redis GET failed for key {}: {}", key, e);
            }
        }

        if retries == 0 {
            eprintln!("Redis GET exhausted retries for key {}, falling back.", key);
            return None;
        }
        retries -= 1;
        sleep(delay).await;
        delay *= 2;
    }
}

/// Async: Store a JSON-encoded value in Redis with a TTL (seconds) and retry logic.
pub async fn set_async_cached<T: serde::Serialize>(
    state: &Arc<AppState>,
    key: &str,
    value: &T,
    ttl_secs: u64,
) {
    let mut retries = 3;
    let mut delay = Duration::from_millis(50);

    let raw = match serde_json::to_string(value) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Failed to serialize value for Redis key {}: {}", key, e);
            return;
        }
    };

    loop {
        let mut conn = state.redis_manager.clone();
        let res: Result<(), redis::RedisError> = conn.set_ex(key, &raw, ttl_secs).await;
        if let Err(e) = res {
            eprintln!("Redis SET failed for key {}: {}", key, e);
        } else {
            return;
        }

        if retries == 0 {
            eprintln!("Redis SET exhausted retries for key {}, skipping.", key);
            return;
        }
        retries -= 1;
        sleep(delay).await;
        delay *= 2;
    }
}

/// Async: Invalidate (delete) a cache key with retry logic.
pub async fn invalidate_async(state: &Arc<AppState>, key: &str) {
    let mut retries = 3;
    let mut delay = Duration::from_millis(50);

    loop {
        let mut conn = state.redis_manager.clone();
        let res: Result<(), redis::RedisError> = conn.del(key).await;
        if let Err(e) = res {
            eprintln!("Redis DEL failed for key {}: {}", key, e);
        } else {
            return;
        }

        if retries == 0 {
            eprintln!("Redis DEL exhausted retries for key {}, skipping.", key);
            return;
        }
        retries -= 1;
        sleep(delay).await;
        delay *= 2;
    }
}
