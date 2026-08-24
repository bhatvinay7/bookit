use std::{panic::AssertUnwindSafe, sync::Arc, time::Duration};

use bookit_db::{
    db::DbPool,
    models::SeatStatus,
    schema::{schedule_seats::dsl as ss, tickets::dsl as tk},
};
use diesel::prelude::*;
use futures::FutureExt;
use redis::AsyncCommands;
use redis_conn::{RedisPool, SeatLock, adapter::PubSubEvent, keys};
use tracing::{debug, error, info};

use crate::types::{LOCK_TTL_SECS, QueueEntry, SeatLockMessage};

pub async fn process_lock_request(
    message: &SeatLockMessage,
    seat_lock: &Arc<dyn SeatLock>,
    redis_pool: &RedisPool,
) {
    if message.action == "unlock" {
        for seat_id in &message.seat_ids {
            if seat_lock
                .release_lock(message.showtime_id, *seat_id, message.user_id)
                .await
            {
                publish_room_event(
                    redis_pool,
                    PubSubEvent::SeatUnlocked {
                        user_id: message.user_id,
                        showtime_id: message.showtime_id,
                        seat_id: *seat_id,
                    },
                )
                .await;
            }
        }
        return;
    }

    let mut updated = false;
    for retry in 0..3 {
        if seat_lock
            .update_seat_metadata_lua(
                message.showtime_id,
                message.seat_ids.clone(),
                message.user_id,
                LOCK_TTL_SECS as i32,
            )
            .await
        {
            updated = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(100 * (1_u64 << (retry + 1)))).await;
    }
    if updated {
        for seat_id in &message.seat_ids {
            publish_room_event(
                redis_pool,
                PubSubEvent::SeatLocked {
                    user_id: message.user_id,
                    showtime_id: message.showtime_id,
                    seat_id: *seat_id,
                },
            )
            .await;
        }
    } else {
        error!(
            showtime_id = message.showtime_id,
            "seat metadata update failed after retries"
        );
    }
    publish_global_event(
        redis_pool,
        PubSubEvent::LockSlotsResponse {
            user_id: message.user_id,
            showtime_id: message.showtime_id,
            success: updated,
            locked_seat_ids: if updated {
                message.seat_ids.clone()
            } else {
                vec![]
            },
            failed_seat_ids: if updated {
                vec![]
            } else {
                message.seat_ids.clone()
            },
        },
    )
    .await;
}

pub fn start_supervised_seat_layout_updater(
    db_pool: DbPool,
    redis_pool: RedisPool,
    seat_lock: Arc<dyn SeatLock>,
    instance_id: String,
) {
    tokio::spawn(async move {
        let mut restarts = 0_u64;
        loop {
            let outcome = AssertUnwindSafe(run_seat_layout_updater(
                &db_pool,
                &redis_pool,
                &seat_lock,
                &instance_id,
            ))
            .catch_unwind()
            .await;
            if outcome.is_ok() {
                break;
            }
            restarts += 1;
            error!(%instance_id, restarts, "seat layout updater panicked; restarting");
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    });
}

async fn run_seat_layout_updater(
    db_pool: &DbPool,
    redis_pool: &RedisPool,
    seat_lock: &Arc<dyn SeatLock>,
    instance_id: &str,
) {
    let mut interval = tokio::time::interval(Duration::from_millis(500));
    let queue = keys::seat_processing_queue_key();
    loop {
        interval.tick().await;
        if !acquire_updater_leader_lock(redis_pool, instance_id).await {
            debug!(%instance_id, "seat layout updater standing by");
            continue;
        }
        let now = chrono::Utc::now().timestamp();
        let Ok(mut redis) = redis_pool.get().await else {
            continue;
        };
        let due: Vec<String> = redis
            .zrangebyscore(&queue, "-inf", now)
            .await
            .unwrap_or_default();
        for encoded in due {
            let Ok(entry) = serde_json::from_str::<QueueEntry>(&encoded) else {
                seat_lock.zrem_cluster(&queue, &encoded).await;
                continue;
            };
            if is_seat_booked_in_db(db_pool, entry.schedule_id, entry.seat_id) {
                seat_lock
                    .force_book_seat_lua(entry.schedule_id, entry.seat_id, entry.user_id, &encoded)
                    .await;
            } else {
                seat_lock
                    .release_expired_lock_lua(
                        entry.schedule_id,
                        entry.seat_id,
                        entry.user_id,
                        &encoded,
                    )
                    .await;
                publish_room_event(
                    redis_pool,
                    PubSubEvent::SeatUnlocked {
                        user_id: entry.user_id,
                        showtime_id: entry.schedule_id,
                        seat_id: entry.seat_id,
                    },
                )
                .await;
            }
        }
    }
}

async fn acquire_updater_leader_lock(redis_pool: &RedisPool, instance_id: &str) -> bool {
    let Ok(mut redis) = redis_pool.get().await else {
        return false;
    };
    let key = "lock_server:layout_updater_leader";
    let created: redis::RedisResult<bool> = redis::cmd("SET")
        .arg(key)
        .arg(instance_id)
        .arg("NX")
        .arg("PX")
        .arg(2000_u64)
        .query_async(&mut *redis)
        .await;
    if matches!(created, Ok(true)) {
        return true;
    }
    let owner: Option<String> = redis::cmd("GET")
        .arg(key)
        .query_async(&mut *redis)
        .await
        .unwrap_or(None);
    if owner.as_deref() != Some(instance_id) {
        return false;
    }
    let _: redis::RedisResult<bool> = redis::cmd("PEXPIRE")
        .arg(key)
        .arg(2000_u64)
        .query_async(&mut *redis)
        .await;
    true
}

fn is_seat_booked_in_db(db_pool: &DbPool, schedule_id: i32, seat_id: i32) -> bool {
    let Ok(mut conn) = db_pool.get() else {
        return false;
    };
    let booked: i64 = ss::schedule_seats
        .filter(ss::schedule_id.eq(schedule_id))
        .filter(ss::id.eq(seat_id))
        .filter(ss::status.eq(SeatStatus::Booked))
        .count()
        .get_result(&mut conn)
        .unwrap_or(0);
    if booked > 0 {
        return true;
    }
    tk::tickets
        .filter(tk::schedule_id.eq(schedule_id))
        .filter(tk::status.eq("active"))
        .count()
        .get_result::<i64>(&mut conn)
        .unwrap_or(0)
        > 0
}

async fn publish_room_event(redis_pool: &RedisPool, event: PubSubEvent) {
    let showtime_id = match &event {
        PubSubEvent::SeatLocked { showtime_id, .. }
        | PubSubEvent::SeatUnlocked { showtime_id, .. } => *showtime_id,
        _ => return,
    };
    publish(redis_pool, keys::room_channel(showtime_id), event).await;
}

async fn publish_global_event(redis_pool: &RedisPool, event: PubSubEvent) {
    publish(redis_pool, keys::global_events_channel(), event).await;
}

async fn publish(redis_pool: &RedisPool, channel: String, event: PubSubEvent) {
    let Ok(mut redis) = redis_pool.get().await else {
        return;
    };
    let Ok(payload) = serde_json::to_string(&event) else {
        return;
    };
    if let Err(error) = redis.publish::<_, _, ()>(&channel, payload).await {
        error!(?error, %channel, "failed to publish lock event");
    } else {
        info!(%channel, "published lock event");
    }
}
