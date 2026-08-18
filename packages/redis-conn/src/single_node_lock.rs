use crate::RedisPool;
use bb8_redis::{RedisConnectionManager, bb8};
use futures::future::join_all;
use redis::AsyncCommands;
use tracing::{error, info, warn};

#[derive(Clone)]
pub struct SingleNodeLock {
    pub pools: Vec<RedisPool>,
}

use crate::seat_lock::SeatLock;
use async_trait::async_trait;

impl SingleNodeLock {
    /// Connects to all Redis URLs in the cluster without silently dropping any node.
    pub async fn establish() -> Result<Self, redis::RedisError> {
        let mut urls = Vec::new();
        if let Ok(extra_urls) = std::env::var("REDIS_CLUSTER_URLS") {
            for u in extra_urls.split(',') {
                let trimmed = u.trim();
                if !trimmed.is_empty() && !urls.contains(&trimmed.to_string()) {
                    urls.push(trimmed.to_string());
                }
            }
        } else {
            let default_url_1 = std::env::var("REDIS_URL").expect("REDIS_URL must be set");
            urls.push(default_url_1);
            if let Ok(default_url_2) = std::env::var("REDIS_REMOTE_URL") {
                if !urls.contains(&default_url_2) {
                    urls.push(default_url_2);
                }
            }
        }

        let mut pools = Vec::new();
        for url in &urls {
            match RedisConnectionManager::new(url.clone()) {
                Ok(manager) => {
                    let build_future = bb8::Pool::builder()
                        .max_size(15)
                        .test_on_check_out(false)
                        .build(manager);

                    match tokio::time::timeout(std::time::Duration::from_secs(10), build_future)
                        .await
                    {
                        Ok(Ok(pool)) => {
                            info!("Connected to SingleNodeLock cluster node: {}", url);
                            pools.push(pool);
                        }
                        Ok(Err(e)) => {
                            panic!("CRITICAL: Failed to build pool for SingleNodeLock node {}: {:?}", url, e);
                        }
                        Err(_) => {
                            panic!("CRITICAL: Timeout connecting to SingleNodeLock cluster node: {}. This compromises CRC16 hash consistency.", url);
                        }
                    }
                }
                Err(e) => {
                    panic!("CRITICAL: Failed to create connection manager for SingleNodeLock node {}: {:?}", url, e);
                }
            }
        }

        if pools.is_empty() {
            error!("No reachable Redis nodes for SingleNodeLock cluster!");
            return Err(redis::RedisError::from(std::io::Error::new(
                std::io::ErrorKind::NotConnected,
                "No reachable Redis nodes for SingleNodeLock cluster",
            )));
        }

        info!(
            "SingleNodeLock cluster established with {} active node(s)",
            pools.len()
        );
        Ok(Self { pools })
    }

    /// Computes standard CRC16 (CCITT/XMODEM, polynomial 0x1021) over the input bytes.
    pub fn crc16(data: &[u8]) -> u16 {
        let mut crc: u16 = 0;
        for &byte in data {
            crc ^= (byte as u16) << 8;
            for _ in 0..8 {
                if (crc & 0x8000) != 0 {
                    crc = (crc << 1) ^ 0x1021;
                } else {
                    crc <<= 1;
                }
            }
        }
        crc
    }

    /// Selects the target RedisPool from the cluster for a given showtime_id and seat_id
    /// using CRC16 to distribute both showid with seats.
    pub fn pool_for_seat(&self, showtime_id: i32, seat_id: i32) -> Option<&RedisPool> {
        if self.pools.is_empty() {
            return None;
        }
        let input = format!("{}:{}", showtime_id, seat_id);
        let hash = Self::crc16(input.as_bytes());
        let idx = (hash as usize) % self.pools.len();
        Some(&self.pools[idx])
    }

    /// Acquires a single-node lock for a seat with expiry using NX.
    /// Supports Same-User Lock Extension: if the key is already held by user_id, it extends the PX TTL.
    pub async fn acquire_lock(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        ttl_ms: u64,
    ) -> bool {
        let Some(pool) = self.pool_for_seat(showtime_id, seat_id) else {
            return false;
        };
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);

        if let Ok(mut cli) = pool.get().await {
            let set_res: redis::RedisResult<bool> = redis::cmd("SET")
                .arg(&lock_key)
                .arg(user_id)
                .arg("NX")
                .arg("PX")
                .arg(ttl_ms)
                .query_async(&mut *cli)
                .await;

            match set_res {
                Ok(true) => true,
                _ => {
                    // Check Same-User Lock Extension
                    let current_owner: Option<i32> = redis::cmd("GET")
                        .arg(&lock_key)
                        .query_async(&mut *cli)
                        .await
                        .unwrap_or(None);
                    if current_owner == Some(user_id) {
                        let _: () = redis::cmd("PEXPIRE")
                            .arg(&lock_key)
                            .arg(ttl_ms)
                            .query_async(&mut *cli)
                            .await
                            .unwrap_or(());
                        true
                    } else {
                        false
                    }
                }
            }
        } else {
            false
        }
    }
}

#[async_trait]
impl SeatLock for SingleNodeLock {
    async fn acquire_distributed_lock(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool {
        self.acquire_lock(showtime_id, seat_id, user_id, (expires_in_sec as u64) * 1000).await
    }

    async fn update_seat_metadata_lua(
        &self,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool {
        let ttl_ms = (expires_in_sec * 1000) as u64;
        let now = chrono::Utc::now().timestamp();
        let expiry = now + expires_in_sec as i64;
        let processing_expiry = expiry + 15;
        
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        
        let mut success = true;
        for seat_id in seat_ids {
            let Some(pool) = self.pool_for_seat(showtime_id, seat_id) else {
                success = false;
                continue;
            };
            
            let queue_member = serde_json::json!({
                "seat_id": seat_id,
                "schedule_id": showtime_id,
                "user_id": user_id,
            }).to_string();
            
            let bit_offset = seat_id as usize * 2;
            
            if let Ok(mut cli) = pool.get().await {
                let mut pipe = redis::pipe();
                pipe.atomic()
                    .cmd("ZADD").arg(&room_zset_key).arg(expiry).arg(format!("{}:{}", seat_id, user_id)).ignore()
                    .cmd("ZADD").arg(&user_zset_key).arg(expiry).arg(seat_id.to_string()).ignore()
                    .cmd("ZADD").arg(&queue_key).arg(processing_expiry).arg(&queue_member).ignore()
                    .cmd("BITFIELD").arg(&bitmap_key).arg("SET").arg("u2").arg(bit_offset).arg(1).ignore();
                
                let res: redis::RedisResult<()> = pipe.query_async(&mut *cli).await;
                if res.is_err() {
                    success = false;
                }
            } else {
                success = false;
            }
        }
        success
    }
    /// Executes an atomic Lua script for acquiring a seat lock, updating user ZSET, room ZSET,
    /// seat processing queue ZSET, and setting bitfield state to 0b01 (locked).
    async fn acquire_seat_lock_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool {
        let ttl_ms = (expires_in_sec as u64) * 1000;
        let now = chrono::Utc::now().timestamp();
        let expiry = now + expires_in_sec as i64;
        let processing_expiry = expiry + 15; // 15s grace

        let Some(pool) = self.pool_for_seat(showtime_id, seat_id) else {
            return false;
        };
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
        let queue_member = serde_json::json!({
            "seat_id": seat_id,
            "schedule_id": showtime_id,
            "user_id": user_id,
        })
        .to_string();
        let bit_offset = seat_id as usize * 2;

        if let Ok(mut cli) = pool.get().await {
            let script = redis::Script::new(
                r#"
                local current_owner = redis.call("get", KEYS[1])
                if current_owner and current_owner ~= ARGV[1] then
                    return 0
                end
                redis.call("set", KEYS[1], ARGV[1], "PX", ARGV[2])
                redis.call("zadd", KEYS[2], ARGV[3], ARGV[4])
                redis.call("zadd", KEYS[3], ARGV[3], ARGV[4] .. ":" .. ARGV[1])
                redis.call("zadd", KEYS[4], ARGV[5], ARGV[6])
                redis.call("bitfield", KEYS[5], "SET", "u2", ARGV[7], 1)
                return 1
                "#,
            );
            let res: redis::RedisResult<i32> = script
                .key(&lock_key)
                .key(&user_zset_key)
                .key(&room_zset_key)
                .key(&queue_key)
                .key(&bitmap_key)
                .arg(user_id.to_string())
                .arg(ttl_ms)
                .arg(expiry)
                .arg(seat_id.to_string())
                .arg(processing_expiry)
                .arg(&queue_member)
                .arg(bit_offset)
                .invoke_async(&mut *cli)
                .await;

            if res.as_ref().ok() == Some(&1) {
                self.zadd_cluster(&user_zset_key, &seat_id.to_string(), expiry).await;
                self.zadd_cluster(&room_zset_key, &format!("{}:{}", seat_id, user_id), expiry).await;
                self.zadd_cluster(&queue_key, &queue_member, processing_expiry).await;
                self.set_schedule_seat_bitmap_state_cluster(&bitmap_key, seat_id, 0b01).await;
                true
            } else {
                false
            }
        } else {
            false
        }
    }

    /// Executes an atomic Lua script to release an expired lock and reset the bitfield state to 0b00 (available).
    async fn release_expired_lock_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        queue_member: &str,
    ) -> bool {
        let Some(pool) = self.pool_for_seat(showtime_id, seat_id) else {
            return false;
        };
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
        let bit_offset = seat_id as usize * 2;

        if let Ok(mut cli) = pool.get().await {
            let script = redis::Script::new(
                r#"
                local owner = redis.call("get", KEYS[1])
                if not owner or owner == ARGV[1] then
                    redis.call("del", KEYS[1])
                    redis.call("zrem", KEYS[2], ARGV[2])
                    redis.call("zrem", KEYS[3], ARGV[2] .. ":" .. ARGV[1])
                    redis.call("zrem", KEYS[4], ARGV[3])
                    redis.call("bitfield", KEYS[5], "SET", "u2", ARGV[4], 0)
                    return 1
                else
                    redis.call("zrem", KEYS[4], ARGV[3])
                    return 0
                end
                "#,
            );
            let result: redis::RedisResult<i32> = script
                .key(&lock_key)
                .key(&user_zset_key)
                .key(&room_zset_key)
                .key(&queue_key)
                .key(&bitmap_key)
                .arg(user_id.to_string())
                .arg(seat_id.to_string())
                .arg(queue_member)
                .arg(bit_offset)
                .invoke_async(&mut *cli)
                .await;

            self.zrem_cluster(&user_zset_key, &seat_id.to_string()).await;
            self.zrem_cluster(&room_zset_key, &format!("{}:{}", seat_id, user_id)).await;
            self.zrem_cluster(&queue_key, queue_member).await;
            self.set_schedule_seat_bitmap_state_cluster(&bitmap_key, seat_id, 0b00).await;
            matches!(result, Ok(1))
        } else {
            false
        }
    }

    /// Releases a single-node seat lock using a Lua script so only the lock owner can delete their lock.
    async fn release_lock(&self, showtime_id: i32, seat_id: i32, user_id: i32) -> bool {
        let Some(pool) = self.pool_for_seat(showtime_id, seat_id) else {
            return false;
        };
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
        let queue_member = serde_json::json!({
            "seat_id": seat_id,
            "schedule_id": showtime_id,
            "user_id": user_id,
        })
        .to_string();
        let bit_offset = seat_id as usize * 2;

        if let Ok(mut cli) = pool.get().await {
            let script = redis::Script::new(
                r#"
                local owner = redis.call("get", KEYS[1])
                if not owner or owner == ARGV[1] then
                    redis.call("del", KEYS[1])
                    redis.call("zrem", KEYS[2], ARGV[2])
                    redis.call("zrem", KEYS[3], ARGV[2] .. ":" .. ARGV[1])
                    redis.call("zrem", KEYS[4], ARGV[3])
                    redis.call("bitfield", KEYS[5], "SET", "u2", ARGV[4], 0)
                    return 1
                else
                    return 0
                end
                "#,
            );
            let res: redis::RedisResult<i32> = script
                .key(&lock_key)
                .key(&user_zset_key)
                .key(&room_zset_key)
                .key(&queue_key)
                .key(&bitmap_key)
                .arg(user_id.to_string())
                .arg(seat_id.to_string())
                .arg(&queue_member)
                .arg(bit_offset)
                .invoke_async(&mut *cli)
                .await;
            
            match res {
                Ok(1) => {
                    self.zrem_cluster(&user_zset_key, &seat_id.to_string()).await;
                    self.zrem_cluster(&room_zset_key, &format!("{}:{}", seat_id, user_id)).await;
                    self.zrem_cluster(&queue_key, &queue_member).await;
                    self.set_schedule_seat_bitmap_state_cluster(&bitmap_key, seat_id, 0b00).await;
                    true
                }
                Ok(0) => {
                    tracing::warn!("release_lock returned 0 (owner mismatch). showtime: {}, seat: {}, user: {}", showtime_id, seat_id, user_id);
                    false
                }
                Ok(v) => {
                    tracing::warn!("release_lock returned unexpected value: {}", v);
                    false
                }
                Err(e) => {
                    tracing::error!("release_lock lua script failed: {}", e);
                    false
                }
            }
        } else {
            false
        }
    }

    async fn book_seat_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
    ) -> bool {
        let Some(pool) = self.pool_for_seat(showtime_id, seat_id) else {
            return false;
        };
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
        let queue_member = serde_json::json!({
            "seat_id": seat_id,
            "schedule_id": showtime_id,
            "user_id": user_id,
        })
        .to_string();
        let bit_offset = seat_id as usize * 2;

        if let Ok(mut cli) = pool.get().await {
            let script = redis::Script::new(
                r#"
                local owner = redis.call("get", KEYS[1])
                if not owner or owner == ARGV[1] then
                    redis.call("del", KEYS[1])
                    redis.call("zrem", KEYS[2], ARGV[2])
                    redis.call("zrem", KEYS[3], ARGV[2] .. ":" .. ARGV[1])
                    redis.call("zrem", KEYS[4], ARGV[3])
                    redis.call("bitfield", KEYS[5], "SET", "u2", ARGV[4], 2)
                    return 1
                else
                    return 0
                end
                "#,
            );
            let res: redis::RedisResult<i32> = script
                .key(&lock_key)
                .key(&user_zset_key)
                .key(&room_zset_key)
                .key(&queue_key)
                .key(&bitmap_key)
                .arg(user_id.to_string())
                .arg(seat_id.to_string())
                .arg(&queue_member)
                .arg(bit_offset)
                .invoke_async(&mut *cli)
                .await;
            
            match res {
                Ok(1) => {
                    self.zrem_cluster(&user_zset_key, &seat_id.to_string()).await;
                    self.zrem_cluster(&room_zset_key, &format!("{}:{}", seat_id, user_id)).await;
                    self.zrem_cluster(&queue_key, &queue_member).await;
                    self.set_schedule_seat_bitmap_state_cluster(&bitmap_key, seat_id, 0b10).await;
                    true
                }
                Ok(0) => false,
                _ => false,
            }
        } else {
            false
        }
    }

    async fn force_book_seat_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        queue_member: &str,
    ) {
        let Some(pool) = self.pool_for_seat(showtime_id, seat_id) else {
            return;
        };
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
        let bit_offset = seat_id as usize * 2;

        if let Ok(mut cli) = pool.get().await {
            let script = redis::Script::new(
                r#"
                local owner = redis.call("get", KEYS[1])
                if not owner or owner == ARGV[1] then
                    redis.call("del", KEYS[1])
                end
                redis.call("zrem", KEYS[2], ARGV[2])
                redis.call("zrem", KEYS[3], ARGV[2] .. ":" .. ARGV[1])
                redis.call("zrem", KEYS[4], ARGV[3])
                redis.call("bitfield", KEYS[5], "SET", "u2", ARGV[4], 2)
                return 1
                "#,
            );
            let _: redis::RedisResult<i32> = script
                .key(&lock_key)
                .key(&user_zset_key)
                .key(&room_zset_key)
                .key(&queue_key)
                .key(&bitmap_key)
                .arg(user_id.to_string())
                .arg(seat_id.to_string())
                .arg(queue_member)
                .arg(bit_offset)
                .invoke_async(&mut *cli)
                .await;

            self.zrem_cluster(&user_zset_key, &seat_id.to_string()).await;
            self.zrem_cluster(&room_zset_key, &format!("{}:{}", seat_id, user_id)).await;
            self.zrem_cluster(&queue_key, queue_member).await;
            self.set_schedule_seat_bitmap_state_cluster(&bitmap_key, seat_id, 0b10).await;
        }
    }

    /// Gets the owner user_id of a lock by querying the CRC16 target node.
    async fn get_lock_owner(&self, showtime_id: i32, seat_id: i32) -> Option<i32> {
        let Some(pool) = self.pool_for_seat(showtime_id, seat_id) else {
            return None;
        };
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);

        if let Ok(mut cli) = pool.get().await {
            let owner: Option<i32> = redis::cmd("GET")
                .arg(&lock_key)
                .query_async(&mut *cli)
                .await
                .unwrap_or(None);
            owner
        } else {
            None
        }
    }

    /// Reads the schedule seat bitmap from the primary pool.
    async fn get_schedule_seat_bitmap_state_cluster(&self, bitmap_key: &str) -> Vec<u8> {
        if let Some(pool) = self.pools.first() {
            if let Ok(mut cli) = pool.get().await {
                let result: redis::RedisResult<Vec<u8>> = redis::cmd("GET")
                    .arg(bitmap_key)
                    .query_async(&mut *cli)
                    .await;
                return result.unwrap_or_default();
            }
        }
        Vec::new()
    }

    /// Replicates ZADD across all cluster nodes
    async fn zadd_cluster(&self, zset_key: &str, member: &str, score: i64) {
        let mut futures = Vec::new();
        for pool in &self.pools {
            let k = zset_key.to_string();
            let m = member.to_string();
            let p = pool.clone();
            futures.push(async move {
                if let Ok(mut cli) = p.get().await {
                    let _: () = cli.zadd(&k, m, score).await.unwrap_or(());
                }
            });
        }
        join_all(futures).await;
    }

    /// Replicates ZREM across all cluster nodes
    async fn zrem_cluster(&self, zset_key: &str, member: &str) {
        let mut futures = Vec::new();
        for pool in &self.pools {
            let k = zset_key.to_string();
            let m = member.to_string();
            let p = pool.clone();
            futures.push(async move {
                if let Ok(mut cli) = p.get().await {
                    let _: () = cli.zrem(&k, m).await.unwrap_or(());
                }
            });
        }
        join_all(futures).await;
    }

    /// Replicates ZREMBYSCORE across all cluster nodes
    async fn zrembyscore_cluster(&self, zset_key: &str, min: &str, max: &str) {
        let mut futures = Vec::new();
        for pool in &self.pools {
            let k = zset_key.to_string();
            let min_s = min.to_string();
            let max_s = max.to_string();
            let p = pool.clone();
            futures.push(async move {
                if let Ok(mut cli) = p.get().await {
                    let _: () = cli.zrembyscore(&k, &min_s, &max_s).await.unwrap_or(());
                }
            });
        }
        join_all(futures).await;
    }

    /// Replicates a two-bit seat-state update across all cluster nodes.
    async fn set_schedule_seat_bitmap_state_cluster(
        &self,
        bitmap_key: &str,
        seat_id: i32,
        state: i64,
    ) {
        let Some(bit_offset) = usize::try_from(seat_id)
            .ok()
            .and_then(|id| id.checked_mul(2))
        else {
            return;
        };

        let mut futures = Vec::new();
        for pool in &self.pools {
            let k = bitmap_key.to_string();
            let p = pool.clone();
            futures.push(async move {
                if let Ok(mut cli) = p.get().await {
                    let _: redis::RedisResult<Vec<i64>> = redis::cmd("BITFIELD")
                        .arg(&k)
                        .arg("SET")
                        .arg("u2")
                        .arg(bit_offset)
                        .arg(state)
                        .query_async(&mut *cli)
                        .await;
                }
            });
        }
        join_all(futures).await;
    }

    /// Publishes an event to a Redis Pub/Sub channel across all nodes.
    async fn publish_event(&self, channel: &str, payload: &str) {
        let mut futures = Vec::new();
        for pool in &self.pools {
            let ch = channel.to_string();
            let pl = payload.to_string();
            let p = pool.clone();
            futures.push(async move {
                if let Ok(mut cli) = p.get().await {
                    let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                        .arg(&ch)
                        .arg(&pl)
                        .query_async(&mut *cli)
                        .await;
                }
            });
        }
        join_all(futures).await;
    }
}

impl SingleNodeLock {
    /// Returns a reference to the primary pool for read queries
    pub fn get_primary_pool(&self) -> &RedisPool {
        &self.pools[0]
    }
}

#[cfg(test)]
mod tests {
    use super::SingleNodeLock;

    #[test]
    fn test_crc16_standard() {
        // ASCII "123456789" should give 0x31C3 in XMODEM CRC16
        assert_eq!(SingleNodeLock::crc16(b"123456789"), 0x31C3);
    }
}
