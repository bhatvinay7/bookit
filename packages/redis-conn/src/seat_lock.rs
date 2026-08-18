use async_trait::async_trait;

#[async_trait]
pub trait SeatLock: Send + Sync {
    async fn acquire_seat_lock_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool;

    async fn acquire_distributed_lock(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool;

    async fn update_seat_metadata_lua(
        &self,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        user_id: i32,
        expires_in_sec: i32,
    ) -> bool;

    async fn release_lock(&self, showtime_id: i32, seat_id: i32, user_id: i32) -> bool;

    async fn release_expired_lock_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        queue_member: &str,
    ) -> bool;

    async fn get_lock_owner(&self, showtime_id: i32, seat_id: i32) -> Option<i32>;

    async fn get_schedule_seat_bitmap_state_cluster(&self, bitmap_key: &str) -> Vec<u8>;

    async fn set_schedule_seat_bitmap_state_cluster(
        &self,
        bitmap_key: &str,
        seat_id: i32,
        state: i64,
    );

    async fn zrem_cluster(&self, key: &str, member: &str);

    async fn zadd_cluster(&self, zset_key: &str, member: &str, score: i64);

    async fn zrembyscore_cluster(&self, zset_key: &str, min: &str, max: &str);

    async fn publish_event(&self, channel: &str, payload: &str);

    async fn book_seat_lua(&self, showtime_id: i32, seat_id: i32, user_id: i32) -> bool;

    async fn force_book_seat_lua(
        &self,
        showtime_id: i32,
        seat_id: i32,
        user_id: i32,
        queue_member: &str,
    );
}
