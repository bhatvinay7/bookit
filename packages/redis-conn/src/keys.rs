//! Central registry for Redis cache keys.
//! This ensures consistency across services when reading/writing to the cache.

/// Get the Redis key for caching a MongoDB show document.
pub fn cache_show_key(mongo_show_id: &str) -> String {
    format!("cache:show:{}", mongo_show_id)
}

/// Get the Redis key for caching schedule metadata.
/// Seat state is stored separately in [`schedule_seat_bitmap`].
pub fn cache_schedule_key(schedule_id: i32) -> String {
    format!("cache:schedule:{}", schedule_id)
}

/// Get the Redis key for a show's schedule metadata, optionally scoped to a city.
/// This cache never contains seat-layout or live seat-state data.
pub fn cache_show_schedules_key(mongo_show_id: &str, city: Option<&str>) -> String {
    let city = city
        .map(str::trim)
        .filter(|city| !city.is_empty() && !city.eq_ignore_ascii_case("All"))
        .map(str::to_owned)
        .unwrap_or_else(|| "all".to_string());
    format!("cache:show:{}:schedules:city:{}", mongo_show_id, city)
}

/// Get the Redis key for the list of active/upcoming schedules.
pub fn cache_schedules_active_key() -> String {
    "cache:schedules:active".to_string()
}

pub const CACHE_SHOWS: &str = "cache:shows:all";
pub const CACHE_DASHBOARD_GRID: &str = "cache:dashboard:grid";
pub const MOVIES_ALL: &str = "cache:movies:all";

/// Get the Redis key for shows that have active schedules, optionally scoped
/// by show type and schedule city.
pub fn cache_movies_key(show_type: Option<&str>, city: Option<&str>) -> String {
    let mut key = MOVIES_ALL.to_string();
    if let Some(show_type) = show_type.filter(|show_type| !show_type.eq_ignore_ascii_case("All")) {
        key.push(':');
        key.push_str(show_type);
    }
    if let Some(city) = city
        .map(str::trim)
        .filter(|city| !city.is_empty() && !city.eq_ignore_ascii_case("All"))
    {
        key.push_str(":city:");
        key.push_str(city);
    }
    key
}

pub const TTL_24_HOURS: u64 = 24 * 60 * 60;
pub const TTL_SHOWS: u64 = TTL_24_HOURS;
pub const TTL_DASHBOARD_GRID: u64 = TTL_24_HOURS;
pub const TTL_MOVIES_ALL: u64 = TTL_24_HOURS;
pub const TTL_SHOW_SCHEDULES: u64 = TTL_24_HOURS;

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

/// Fan-out channel used to notify every gateway replica of schedule lifecycle
/// transitions.
pub fn schedule_lifecycle_channel() -> &'static str {
    "schedule:lifecycle"
}

/// Durable marker checked when a gateway has no local actor for a schedule.
pub fn schedule_closed_key(schedule_id: i32) -> String {
    format!("schedule:closed:{schedule_id}")
}
