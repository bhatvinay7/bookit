use redis::{AsyncCommands, aio::ConnectionLike};
use redis_conn::{RedisPool, SeatLock, keys};
use serde::Serialize;
use serde_json::{Value, json};
use tracing::error;

#[derive(Debug, Serialize)]
pub struct RoomSeatSnapshot {
    pub seat_id: i32,
    pub status: String,
    pub user_id: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct SeatStatusPayload {
    #[serde(rename = "seatId")]
    pub seat_id: i32,
    #[serde(rename = "showId")]
    pub show_id: i32,
    pub state: String,
}

/// Two bits are reserved for each seat in the per-schedule Redis bitmap.
/// Keeping this compact state separate from ownership lets the existing lock
/// keys and per-user ZSETs continue to enforce ownership and expiry.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(i64)]
enum SeatState {
    Available = 0b00,
    Locked = 0b01,
    Booked = 0b10,
}

impl SeatState {
    fn from_bitmap(value: u8) -> Self {
        match value {
            0b01 => Self::Locked,
            0b10 => Self::Booked,
            _ => Self::Available,
        }
    }

    fn status(self) -> &'static str {
        match self {
            Self::Available => "AVAILABLE",
            Self::Locked => "LOCKED",
            Self::Booked => "BOOKED",
        }
    }
}

fn seat_bit_offset(seat_id: i32) -> Option<usize> {
    usize::try_from(seat_id).ok()?.checked_mul(2)
}

async fn set_seat_state<C>(redis_cli: &mut C, schedule_id: i32, seat_id: i32, state: SeatState)
where
    C: ConnectionLike + Send,
{
    let Some(offset) = seat_bit_offset(seat_id) else {
        error!("Ignoring negative seat id {}", seat_id);
        return;
    };

    let key = keys::schedule_seat_bitmap(schedule_id);
    let _: redis::RedisResult<Vec<i64>> = redis::cmd("BITFIELD")
        .arg(&key)
        .arg("SET")
        .arg("u2")
        .arg(offset)
        .arg(state as i64)
        .query_async(redis_cli)
        .await;
}

async fn seat_state<C>(redis_cli: &mut C, schedule_id: i32, seat_id: i32) -> SeatState
where
    C: ConnectionLike + Send,
{
    let Some(offset) = seat_bit_offset(seat_id) else {
        return SeatState::Available;
    };

    let key = keys::schedule_seat_bitmap(schedule_id);
    let values: Vec<i64> = redis::cmd("BITFIELD")
        .arg(&key)
        .arg("GET")
        .arg("u2")
        .arg(offset)
        .query_async(redis_cli)
        .await
        .unwrap_or_default();

    SeatState::from_bitmap(values.first().copied().unwrap_or_default() as u8)
}

fn bitmap_snapshots(bitmap: &[u8]) -> Vec<(i32, SeatState)> {
    bitmap
        .iter()
        .enumerate()
        .flat_map(|(byte_index, byte)| {
            (0..4).filter_map(move |slot| {
                let state = SeatState::from_bitmap((byte >> (6 - slot * 2)) & 0b11);
                (state != SeatState::Available).then_some(((byte_index * 4 + slot) as i32, state))
            })
        })
        .collect()
}

fn make_queue_member(seat_id: i32, schedule_id: i32, user_id: i32) -> String {
    json!({
        "seat_id": seat_id,
        "schedule_id": schedule_id,
        "user_id": user_id,
    })
    .to_string()
}

fn parse_member_seat_id(member: &str) -> Option<i32> {
    serde_json::from_str::<Value>(member)
        .ok()
        .and_then(|value| {
            value
                .get("seat_id")
                .and_then(|seat| seat.as_i64())
                .map(|seat_id| seat_id as i32)
        })
        .or_else(|| member.parse::<i32>().ok())
}

pub async fn sync_locks_from_zset(
    redis_pool: &RedisPool,
    user_id: i32,
    showtime_id: i32,
) -> Vec<SeatStatusPayload> {
    let mut redis_cli = match redis_pool.get().await {
        Ok(cli) => cli,
        Err(_) => return vec![],
    };

    let now = chrono::Utc::now().timestamp();
    let user_zset_key = format!("{}:{}", showtime_id, user_id);

    let _: () = redis_cli
        .zrembyscore(&user_zset_key, "-inf", now)
        .await
        .unwrap_or(());

    let locked_seats: Vec<String> = redis_cli
        .zrange(&user_zset_key, 0, -1)
        .await
        .unwrap_or_default();
    locked_seats
        .into_iter()
        .filter_map(|seat| {
            parse_member_seat_id(&seat).map(|seat_id| SeatStatusPayload {
                seat_id,
                show_id: showtime_id,
                state: "locked".to_string(),
            })
        })
        .collect()
}

pub async fn sync_room_state_snapshot(
    redis_pool: &RedisPool,
    user_id: i32,
    showtime_id: i32,
) -> (Vec<RoomSeatSnapshot>, Vec<SeatStatusPayload>) {
    let mut redis_cli = match redis_pool.get().await {
        Ok(cli) => cli,
        Err(_) => return (vec![], vec![]),
    };

    let user_zset_key = format!("{}:{}", showtime_id, user_id);
    let now = chrono::Utc::now().timestamp();

    let _: () = redis_cli
        .zrembyscore(&user_zset_key, "-inf", now)
        .await
        .unwrap_or(());

    let bitmap_key = keys::schedule_seat_bitmap(showtime_id);
    let bitmap: Option<Vec<u8>> = redis::cmd("GET")
        .arg(&bitmap_key)
        .query_async(&mut *redis_cli)
        .await
        .unwrap_or(None);
    let active_locks: Vec<SeatStatusPayload> = redis_cli
        .zrange::<_, Vec<String>>(&user_zset_key, 0, -1)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter_map(|seat| {
            parse_member_seat_id(&seat).map(|seat_id| SeatStatusPayload {
                seat_id,
                show_id: showtime_id,
                state: "locked".to_string(),
            })
        })
        .collect();

    let mut seats = Vec::new();
    for (seat_id, state) in bitmap_snapshots(bitmap.as_deref().unwrap_or_default()) {
        // Ownership is already represented by the existing per-seat lock. A
        // booked seat has no active lock, so its owner intentionally remains
        // absent just as it would after the lock's TTL elapsed.
        let owner_id = if state == SeatState::Locked {
            redis::cmd("GET")
                .arg(keys::seat_lock_key(showtime_id, seat_id))
                .query_async(&mut *redis_cli)
                .await
                .unwrap_or(None)
        } else {
            None
        };

        seats.push(RoomSeatSnapshot {
            seat_id,
            status: state.status().to_string(),
            user_id: owner_id,
        });
    }

    (seats, active_locks)
}

pub async fn confirm_payment(
    redis_pool: &RedisPool,
    single_node_lock: &dyn SeatLock,
    user_id: i32,
    showtime_id: i32,
    seat_ids: Vec<i32>,
) -> bool {
    let mut redis_cli = match redis_pool.get().await {
        Ok(cli) => cli,
        Err(_) => return false,
    };

    let mut success = true;

    for seat_id in seat_ids {
        let deleted_and_booked = single_node_lock
            .book_seat_lua(showtime_id, seat_id, user_id)
            .await;

        if deleted_and_booked {
            set_seat_state(&mut *redis_cli, showtime_id, seat_id, SeatState::Booked).await;
        } else {
            success = false;
        }
    }

    success
}

#[cfg(test)]
mod tests {
    use super::{SeatState, bitmap_snapshots, seat_bit_offset};

    #[test]
    fn decodes_redis_bitmap_fields_in_bitfield_order() {
        // Redis BITFIELD counts offsets from the most-significant bit of a byte.
        let snapshots = bitmap_snapshots(&[0b0001_1000]);

        assert_eq!(
            snapshots,
            vec![(1, SeatState::Locked), (2, SeatState::Booked)]
        );
    }

    #[test]
    fn reserves_two_bits_per_non_negative_seat() {
        assert_eq!(seat_bit_offset(0), Some(0));
        assert_eq!(seat_bit_offset(7), Some(14));
        assert_eq!(seat_bit_offset(-1), None);
    }
}
