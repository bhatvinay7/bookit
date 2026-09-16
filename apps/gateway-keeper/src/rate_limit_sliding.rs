use redis::Script;
use std::time::{SystemTime, UNIX_EPOCH};

/// Sliding window rate limiter using Redis sorted sets.
/// Returns (allowed, current_count, reset_at_ms)
pub async fn check_sliding_window<C: redis::aio::ConnectionLike + Send>(
    conn: &mut C,
    key: &str,
    limit: i64,
    window_ms: i64,
) -> (bool, i64, i64) {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let window_start = now_ms - window_ms;

    // Atomic: ZREMRANGEBYSCORE old entries, count, conditionally ZADD
    let script = Script::new(
        r#"
        local key          = KEYS[1]
        local now          = tonumber(ARGV[1])
        local window_start = tonumber(ARGV[2])
        local limit        = tonumber(ARGV[3])
        local ttl_ms       = tonumber(ARGV[4])
        local member       = ARGV[5]

        redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
        local count = redis.call('ZCARD', key)

        if count < limit then
            redis.call('ZADD', key, now, member)
            redis.call('PEXPIRE', key, ttl_ms)
            return {1, count + 1}
        end
        return {0, count}
    "#,
    );

    let member = format!("{}:{}", now_ms, fastrand::u32(..));

    let result: Vec<i64> = script
        .key(key)
        .arg(now_ms)
        .arg(window_start)
        .arg(limit)
        .arg(window_ms * 2) // TTL = 2x window
        .arg(&member)
        .invoke_async(conn)
        .await
        .unwrap_or(vec![0, 0]);

    (result[0] == 1, result[1], now_ms + window_ms)
}
