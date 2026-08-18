use serde::{Deserialize, Serialize};

pub const LOCK_TTL_SECS: i64 = 300;
pub const LOCK_TTL_MS: u64 = 300_000;
pub const PROCESSING_GRACE_SECS: i64 = 20;

pub fn default_action() -> String {
    "lock".to_string()
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SeatLockMessage {
    #[serde(default = "default_action")]
    pub action: String,
    pub user_id: i32,
    pub showtime_id: i32,
    pub seat_ids: Vec<i32>,
    pub timestamp: i64,
}

#[derive(Deserialize)]
pub struct QueueEntry {
    pub seat_id: i32,
    pub schedule_id: i32,
    pub user_id: i32,
}
