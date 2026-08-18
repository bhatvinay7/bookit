//! Central registry for Redis cache keys.
//! This ensures consistency across services when reading/writing to the cache.

/// Get the Redis key for caching a MongoDB show document.
pub fn cache_show_key(mongo_show_id: &str) -> String {
    format!("cache:show:{}", mongo_show_id)
}

/// Get the Redis key for caching a Schedule (including its layout details).
pub fn cache_schedule_key(schedule_id: i32) -> String {
    format!("cache:schedule:{}", schedule_id)
}

/// Get the Redis key for the list of active/upcoming schedules.
pub fn cache_schedules_active_key() -> String {
    "cache:schedules:active".to_string()
}

/// Get the Redis key for live seat availability for a specific schedule.
/// Note: This is usually highly dynamic and might be better handled via a bitmap or direct DB query,
/// but providing a key for fast-path lookups.
pub fn cache_schedule_seats_key(schedule_id: i32) -> String {
    format!("cache:schedule:{}:seats", schedule_id)
}

pub const MOVIES_ALL: &str = "cache:movies:all";
pub const TTL_MOVIES_ALL: u64 = 3600;

pub fn movie_detail(id: i32) -> String {
    format!("cache:movie:{}:detail", id)
}
pub const TTL_MOVIE_DETAIL: u64 = 600;

pub fn movie_showtimes(movie_id: i32) -> String {
    format!("cache:movie:{}:showtimes", movie_id)
}
pub const TTL_MOVIE_SHOWTIMES: u64 = 300;

pub fn showtime_seats(showtime_id: i32) -> String {
    format!("cache:showtime:{}:seats", showtime_id)
}
pub const TTL_SHOWTIME_SEATS: u64 = 60;

pub const ADMIN_STATS: &str = "cache:admin:stats";
pub const TTL_ADMIN_STATS: u64 = 60;

pub const CACHE_DASHBOARD_GRID: &str = "cache:dashboard:grid";
pub const TTL_DASHBOARD_GRID: u64 = 600; // 10 minutes

/// Get the Redis bitmap that stores live seat state for a schedule.
///
/// Each seat uses two bits at offset `seat_id * 2`:
/// `00` available, `01` locked, and `10` booked.
pub fn schedule_seat_bitmap(schedule_id: i32) -> String {
    format!("{{{}}}:seats_bitmap", schedule_id)
}

/// Get the Redis key for the single-node seat lock.
pub fn seat_lock_key(schedule_id: i32, seat_id: i32) -> String {
    format!("{}:{}", schedule_id, seat_id)
}

/// Get the Redis zset used for delayed seat-processing entries.
pub fn seat_processing_queue_key() -> String {
    "cache:seat_processing:queue".to_string()
}

/// Get the Redis stream used for delayed seat-processing entries.
pub fn seat_processing_stream_key() -> String {
    "cache:seat_processing:stream".to_string()
}

/// Get the consumer group name for the processing stream.
pub fn seat_processing_stream_group() -> String {
    "seat-processing-group".to_string()
}

/// Get the Redis lock key used to serialize scans of the delayed queue.
pub fn seat_processing_queue_lock_key() -> String {
    "lock:seat_processing:queue".to_string()
}

/// Get the Redis Pub/Sub channel for a specific showtime/room.
pub fn room_channel(schedule_id: i32) -> String {
    format!("room:{}", schedule_id)
}

/// Get the Redis Pub/Sub channel for global WS events (e.g., connect/disconnect).
pub fn global_events_channel() -> String {
    "ws:global:events".to_string()
}
