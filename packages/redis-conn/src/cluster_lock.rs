use crate::seat_lock::SeatLock;
use async_trait::async_trait;
use redis::AsyncCommands;
use redis::cluster_async::ClusterConnection;
use tracing::{error, info};

#[derive(Clone)]
pub struct ClusterLock {
    pub connection: ClusterConnection,
}

impl ClusterLock {
    pub async fn establish(urls: Vec<String>) -> Result<Self, redis::RedisError> {
        info!("Connecting to Redis Cluster with {} URLs...", urls.len());
        let client = redis::cluster::ClusterClientBuilder::new(urls).build()?;
        let connection = client.get_async_connection().await?;
        Ok(Self { connection })
    }
}

#[async_trait]
impl SeatLock for ClusterLock {
    async fn acquire_seat_lock_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool {
        let ttl_ms = (expires_in_sec * 1000) as u64;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let expiry = now + ttl_ms as i64;
        let processing_expiry = now + (expires_in_sec as i64 * 1000) + 15000;

        let script = redis::Script::new(
            r#"
            local lock_key = KEYS[1]
            local room_zset = KEYS[2]
            local user_zset = KEYS[3]
            local queue_zset = KEYS[4]
            local bitmap_key = KEYS[5]

            local user_id = ARGV[1]
            local ttl_ms = ARGV[2]
            local expiry = ARGV[3]
            local seat_id_str = ARGV[4]
            local queue_member = ARGV[5]
            local processing_expiry = ARGV[6]
            local bit_offset = ARGV[7]

            local current_owner = redis.call("GET", lock_key)
            if current_owner == false or current_owner == user_id then
                redis.call("SET", lock_key, user_id, "PX", ttl_ms)
                redis.call("ZADD", room_zset, expiry, queue_member)
                redis.call("ZADD", user_zset, expiry, seat_id_str)
                redis.call("ZADD", queue_zset, processing_expiry, queue_member)
                redis.call("BITFIELD", bitmap_key, "SET", "u2", bit_offset, 1)
                return 1
            else
                return 0
            end
            "#,
        );

        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
        let queue_member = format!("{}:{}", seat_id, user_id);

        let bit_offset = match usize::try_from(seat_id)
            .ok()
            .and_then(|id| id.checked_mul(2))
        {
            Some(v) => v,
            None => return false,
        };

        let mut cli = self.connection.clone();
        let result: redis::RedisResult<i32> = script
            .key(&lock_key)
            .key(&room_zset_key)
            .key(&user_zset_key)
            .key(&queue_key)
            .key(&bitmap_key)
            .arg(user_id)
            .arg(ttl_ms)
            .arg(expiry)
            .arg(seat_id.to_string())
            .arg(&queue_member)
            .arg(processing_expiry)
            .arg(bit_offset)
            .invoke_async(&mut cli)
            .await;

        matches!(result, Ok(1))
    }

    async fn acquire_distributed_lock(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool {
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let ttl_ms = (expires_in_sec * 1000) as u64;

        let mut cli = self.connection.clone();
        let result: redis::RedisResult<String> = redis::cmd("SET")
            .arg(&lock_key)
            .arg(user_id)
            .arg("NX")
            .arg("PX")
            .arg(ttl_ms)
            .query_async(&mut cli)
            .await;

        matches!(result, Ok(val) if val == "OK")
    }

    async fn update_seat_metadata_lua(
        &self,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool {
        let ttl_ms = (expires_in_sec * 1000) as u64;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let expiry = now + ttl_ms as i64;

        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);

        let script = redis::Script::new(
            r#"
            local room_zset = KEYS[1]
            local user_zset = KEYS[2]
            local bitmap_key = KEYS[3]

            local expiry = ARGV[1]
            
            -- We receive seat_ids as subsequent ARGV arguments
            -- and corresponding bit offsets after them
            local arg_count = #ARGV
            local num_seats = (arg_count - 1) / 3
            
            for i = 0, num_seats - 1 do
                local seat_id_str = ARGV[2 + i*3]
                local queue_member = ARGV[2 + i*3 + 1]
                local bit_offset = ARGV[2 + i*3 + 2]
                
                redis.call("ZADD", room_zset, expiry, queue_member)
                redis.call("ZADD", user_zset, expiry, seat_id_str)
                redis.call("BITFIELD", bitmap_key, "SET", "u2", bit_offset, 1)
            end
            
            return 1
            "#,
        );

        let mut invoker = script.key(&room_zset_key);
        invoker.key(&user_zset_key).key(&bitmap_key).arg(expiry);

        for seat_id in &seat_ids {
            let queue_member = serde_json::json!({
                "seat_id": seat_id,
                "schedule_id": showtime_id,
                "user_id": user_id,
            })
            .to_string();
            let bit_offset = match usize::try_from(*seat_id)
                .ok()
                .and_then(|id| id.checked_mul(2))
            {
                Some(v) => v,
                None => continue,
            };
            invoker
                .arg(seat_id.to_string())
                .arg(&queue_member)
                .arg(bit_offset);
        }

        let mut cli = self.connection.clone();
        let result: redis::RedisResult<i32> = invoker.invoke_async(&mut cli).await;

        if result.is_ok() {
            // Update global queue separately to avoid cross-slot errors
            let queue_key = crate::keys::seat_processing_queue_key();
            let processing_expiry = now + (expires_in_sec as i64 * 1000) + 15000;
            let mut zadd_cmd = redis::cmd("ZADD");
            zadd_cmd.arg(&queue_key);
            for seat_id in &seat_ids {
                let queue_member = serde_json::json!({
                    "seat_id": seat_id,
                    "schedule_id": showtime_id,
                    "user_id": user_id,
                })
                .to_string();
                zadd_cmd.arg(processing_expiry).arg(&queue_member);
            }
            let _: redis::RedisResult<()> = zadd_cmd.query_async(&mut cli).await;
        }

        matches!(result, Ok(1))
    }

    async fn release_lock(&self, showtime_id: i32, seat_id: i32, user_id: i32) -> bool {
        let script = redis::Script::new(
            r#"
            local lock_key = KEYS[1]
            local user_id = ARGV[1]
            local current_owner = redis.call("GET", lock_key)
            if current_owner == false or current_owner == user_id then
                if current_owner ~= false then
                    redis.call("DEL", lock_key)
                end
                return 1
            else
                return 0
            end
            "#,
        );

        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let mut cli = self.connection.clone();
        let result: redis::RedisResult<i32> = script
            .key(&lock_key)
            .arg(user_id)
            .invoke_async(&mut cli)
            .await;

        match result {
            Ok(1) => {
                let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
                let room_zset_key = format!("{{{}}}:locks", showtime_id);
                let queue_key = crate::keys::seat_processing_queue_key();
                let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
                let queue_member = format!("{}:{}", seat_id, user_id);

                self.zrem_cluster(&user_zset_key, &seat_id.to_string())
                    .await;
                self.zrem_cluster(&room_zset_key, &queue_member).await;
                self.zrem_cluster(&queue_key, &queue_member).await;
                self.set_schedule_seat_bitmap_state_cluster(&bitmap_key, seat_id, 0)
                    .await;
                true
            }
            _ => false,
        }
    }

    async fn release_expired_lock_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        queue_member: &str,
    ) -> bool {
        let script = redis::Script::new(
            r#"
            local lock_key = KEYS[1]
            local room_zset = KEYS[2]
            local user_zset = KEYS[3]
            local queue_zset = KEYS[4]
            local bitmap_key = KEYS[5]

            local user_id = ARGV[1]
            local seat_id_str = ARGV[2]
            local queue_member = ARGV[3]
            local bit_offset = ARGV[4]

            local current_owner = redis.call("GET", lock_key)
            if current_owner == user_id or current_owner == false then
                redis.call("DEL", lock_key)
                redis.call("ZREM", room_zset, queue_member)
                redis.call("ZREM", user_zset, seat_id_str)
                redis.call("ZREM", queue_zset, queue_member)
                redis.call("BITFIELD", bitmap_key, "SET", "u2", bit_offset, 0)
                return 1
            else
                return 0
            end
            "#,
        );

        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);

        let bit_offset = match usize::try_from(seat_id)
            .ok()
            .and_then(|id| id.checked_mul(2))
        {
            Some(v) => v,
            None => return false,
        };

        let mut cli = self.connection.clone();
        let result: redis::RedisResult<i32> = script
            .key(&lock_key)
            .key(&room_zset_key)
            .key(&user_zset_key)
            .key(&queue_key)
            .key(&bitmap_key)
            .arg(user_id)
            .arg(seat_id.to_string())
            .arg(queue_member)
            .arg(bit_offset)
            .invoke_async(&mut cli)
            .await;

        matches!(result, Ok(1))
    }

    async fn get_lock_owner(&self, showtime_id: i32, seat_id: i32) -> Option<i32> {
        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let mut cli = self.connection.clone();
        let result: redis::RedisResult<Option<i32>> = cli.get(&lock_key).await;
        result.unwrap_or(None)
    }

    async fn get_schedule_seat_bitmap_state_cluster(&self, bitmap_key: &str) -> Vec<u8> {
        let mut cli = self.connection.clone();
        let result: redis::RedisResult<Vec<u8>> = cli.get(bitmap_key).await;
        result.unwrap_or_default()
    }

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

        let mut cli = self.connection.clone();
        let _: redis::RedisResult<Vec<i64>> = redis::cmd("BITFIELD")
            .arg(bitmap_key)
            .arg("SET")
            .arg("u2")
            .arg(bit_offset)
            .arg(state)
            .query_async(&mut cli)
            .await;
    }

    async fn zrem_cluster(&self, key: &str, member: &str) {
        let mut cli = self.connection.clone();
        let _: () = cli.zrem(key, member).await.unwrap_or(());
    }

    async fn zadd_cluster(&self, zset_key: &str, member: &str, score: i64) {
        let mut cli = self.connection.clone();
        let _: () = cli.zadd(zset_key, member, score).await.unwrap_or(());
    }

    async fn zrembyscore_cluster(&self, zset_key: &str, min: &str, max: &str) {
        let mut cli = self.connection.clone();
        let _: () = cli.zrembyscore(zset_key, min, max).await.unwrap_or(());
    }

    async fn publish_event(&self, channel: &str, payload: &str) {
        let mut cli = self.connection.clone();
        let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
            .arg(channel)
            .arg(payload)
            .query_async(&mut cli)
            .await;
    }

    async fn book_seat_lua(&self, showtime_id: i32, seat_id: i32, user_id: i32) -> bool {
        let script = redis::Script::new(
            r#"
            local lock_key = KEYS[1]
            local room_zset = KEYS[2]
            local user_zset = KEYS[3]
            local queue_zset = KEYS[4]
            local bitmap_key = KEYS[5]

            local user_id = ARGV[1]
            local seat_id_str = ARGV[2]
            local queue_member = ARGV[3]
            local bit_offset = ARGV[4]

            local current_owner = redis.call("GET", lock_key)
            if current_owner == user_id then
                redis.call("DEL", lock_key)
                redis.call("ZREM", room_zset, queue_member)
                redis.call("ZREM", user_zset, seat_id_str)
                redis.call("ZREM", queue_zset, queue_member)
                redis.call("BITFIELD", bitmap_key, "SET", "u2", bit_offset, 2)
                return 1
            else
                return 0
            end
            "#,
        );

        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);
        let queue_member = format!("{}:{}", seat_id, user_id);

        let bit_offset = match usize::try_from(seat_id)
            .ok()
            .and_then(|id| id.checked_mul(2))
        {
            Some(v) => v,
            None => return false,
        };

        let mut cli = self.connection.clone();
        let result: redis::RedisResult<i32> = script
            .key(&lock_key)
            .key(&room_zset_key)
            .key(&user_zset_key)
            .key(&queue_key)
            .key(&bitmap_key)
            .arg(user_id)
            .arg(seat_id.to_string())
            .arg(&queue_member)
            .arg(bit_offset)
            .invoke_async(&mut cli)
            .await;

        matches!(result, Ok(1))
    }

    async fn force_book_seat_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        queue_member: &str,
    ) {
        let script = redis::Script::new(
            r#"
            local lock_key = KEYS[1]
            local room_zset = KEYS[2]
            local user_zset = KEYS[3]
            local queue_zset = KEYS[4]
            local bitmap_key = KEYS[5]

            local user_id = ARGV[1]
            local seat_id_str = ARGV[2]
            local queue_member = ARGV[3]
            local bit_offset = ARGV[4]

            redis.call("DEL", lock_key)
            redis.call("ZREM", room_zset, queue_member)
            redis.call("ZREM", user_zset, seat_id_str)
            redis.call("ZREM", queue_zset, queue_member)
            redis.call("BITFIELD", bitmap_key, "SET", "u2", bit_offset, 2)
            return 1
            "#,
        );

        let lock_key = crate::keys::seat_lock_key(showtime_id, seat_id);
        let room_zset_key = format!("{{{}}}:locks", showtime_id);
        let user_zset_key = format!("{{{}}}:user:{}", showtime_id, user_id);
        let queue_key = crate::keys::seat_processing_queue_key();
        let bitmap_key = crate::keys::schedule_seat_bitmap(showtime_id);

        let bit_offset = match usize::try_from(seat_id)
            .ok()
            .and_then(|id| id.checked_mul(2))
        {
            Some(v) => v,
            None => return,
        };

        let mut cli = self.connection.clone();
        let _: redis::RedisResult<i32> = script
            .key(&lock_key)
            .key(&room_zset_key)
            .key(&user_zset_key)
            .key(&queue_key)
            .key(&bitmap_key)
            .arg(user_id)
            .arg(seat_id.to_string())
            .arg(queue_member)
            .arg(bit_offset)
            .invoke_async(&mut cli)
            .await;
    }
}
