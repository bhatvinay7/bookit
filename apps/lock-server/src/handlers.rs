// use std::sync::Arc;
// use std::time::Duration;

// use bookit_db::{
//     db::DbPool,
//     models::SeatStatus,
//     schema::{schedule_seats::dsl as ss, tickets::dsl as tk},
// };
// use diesel::prelude::*;
// use redis::AsyncCommands;
// use redis_conn::{adapter::PubSubEvent, keys, RedisPool, SeatLock};
// use tracing::{debug, info};

// use crate::types::{QueueEntry, SeatLockMessage, LOCK_TTL_SECS, PROCESSING_GRACE_SECS};

// pub async fn process_lock_request(
//     msg: &SeatLockMessage,
//     seat_lock: &Arc<dyn SeatLock>,
//     redis_pool: &RedisPool,
// ) {
//     if msg.action == "unlock" {
//         for seat_id in &msg.seat_ids {
//             if seat_lock.release_lock(msg.showtime_id, *seat_id, msg.user_id).await {
//                 info!(
//                     showtime_id = msg.showtime_id,
//                     seat_id = *seat_id,
//                     user_id = msg.user_id,
//                     "Lock server released seat lock via Lua script"
//                 );
//                 publish_room_event(
//                     redis_pool,
//                     PubSubEvent::SeatUnlocked {
//                         user_id: msg.user_id,
//                         showtime_id: msg.showtime_id,
//                         seat_id: *seat_id,
//                     },
//                 )
//                 .await;
//             }
//         }
//         return;
//     }

//     let mut metadata_updated = false;
//     let mut retries = 0;
//     let max_retries = 3;

//     while retries < max_retries {
//         if seat_lock.update_seat_metadata_lua(msg.showtime_id, msg.seat_ids.clone(), msg.user_id, LOCK_TTL_SECS as i32).await {
//             metadata_updated = true;
//             break;
//         }
//         retries += 1;
//         tokio::time::sleep(Duration::from_millis(100 * (1 << retries))).await;
//     }

//     if metadata_updated {
//         for seat_id in &msg.seat_ids {
//             info!(
//                 showtime_id = msg.showtime_id,
//                 seat_id = *seat_id,
//                 user_id = msg.user_id,
//                 "Lock server updated seat metadata via Lua script"
//             );
//             publish_room_event(
//                 redis_pool,
//                 PubSubEvent::SeatLocked {
//                     user_id: msg.user_id,
//                     showtime_id: msg.showtime_id,
//                     seat_id: *seat_id,
//                 },
//             )
//             .await;
//         }
//     } else {
//         tracing::error!("Failed to update seat metadata after {} retries", max_retries);
//     }

//     publish_global_event(
//         redis_pool,
//         PubSubEvent::LockSlotsResponse {
//             user_id: msg.user_id,
//             showtime_id: msg.showtime_id,
//             success: metadata_updated,
//             locked_seat_ids: if metadata_updated { msg.seat_ids.clone() } else { vec![] },
//             failed_seat_ids: if metadata_updated { vec![] } else { msg.seat_ids.clone() },
//         },
//     )
//     .await;
// }

include!("handlers_active.rs");

// pub async fn start_seat_layout_updater_worker(
//     db_pool: DbPool,
//     redis_pool: RedisPool,
//     seat_lock: Arc<dyn SeatLock>,
//     instance_id: String,
// ) {
//     let mut interval = tokio::time::interval(Duration::from_millis(500));
//     let queue_key = keys::seat_processing_queue_key();

//     info!(
//         instance_id = %instance_id,
//         "Dedicated Seat Layout & Expiry Updater Worker started (500ms loop with leader lock)"
//     );

//     loop {
//         interval.tick().await;

//         // Acquire or renew distributed leader lock in Redis
//         if !acquire_updater_leader_lock(&redis_pool, &instance_id).await {
//             debug!(
//                 instance_id = %instance_id,
//                 "Standing by: Another lock-server instance is currently the layout updater leader"
//             );
//             continue;
//         }

//         let now = chrono::Utc::now().timestamp();
//         let Ok(mut redis_cli) = redis_pool.get().await else {
//             continue;
//         };

//         let due: Vec<String> = redis_cli
//             .zrangebyscore(&queue_key, "-inf", now)
//             .await
//             .unwrap_or_default();

//         for encoded in due {
//             let Ok(entry) = serde_json::from_str::<QueueEntry>(&encoded) else {
//                 seat_lock.zrem_cluster(&queue_key, &encoded).await;
//                 continue;
//             };

//             // Check database to verify if seat was permanently booked/paid
//             let is_booked = is_seat_booked_in_db(&db_pool, entry.schedule_id, entry.seat_id);

//             if is_booked {
//                 info!(
//                     schedule_id = entry.schedule_id,
//                     seat_id = entry.seat_id,
//                     "Seat confirmed in DB; updating bitmap state to BOOKED (0b10) atomically"
//                 );
//                 seat_lock
//                     .force_book_seat_lua(
//                         entry.schedule_id,
//                         entry.seat_id,
//                         entry.user_id,
//                         &encoded,
//                     )
//                     .await;
//             } else {
//                 info!(
//                     schedule_id = entry.schedule_id,
//                     seat_id = entry.seat_id,
//                     user_id = entry.user_id,
//                     "Seat lock expired / user left layout; releasing lock & updating bitmap state to AVAILABLE (0b00)"
//                 );

//                 seat_lock
//                     .release_expired_lock_lua(
//                         entry.schedule_id,
//                         entry.seat_id,
//                         entry.user_id,
//                         &encoded,
//                     )
//                     .await;

//                 publish_room_event(
//                     &redis_pool,
//                     PubSubEvent::SeatUnlocked {
//                         user_id: entry.user_id,
//                         showtime_id: entry.schedule_id,
//                         seat_id: entry.seat_id,
//                     },
//                 )
//                 .await;
//             }
//         }
//     }
// }

// async fn acquire_updater_leader_lock(redis_pool: &RedisPool, instance_id: &str) -> bool {
//     let Ok(mut cli) = redis_pool.get().await else {
//         return false;
//     };
//     let leader_key = "lock_server:layout_updater_leader";
//     let ttl_ms: u64 = 2000;

//     let set_res: redis::RedisResult<bool> = redis::cmd("SET")
//         .arg(leader_key)
//         .arg(instance_id)
//         .arg("NX")
//         .arg("PX")
//         .arg(ttl_ms)
//         .query_async(&mut *cli)
//         .await;

//     match set_res {
//         Ok(true) => true,
//         _ => {
//             let current_leader: Option<String> = redis::cmd("GET")
//                 .arg(leader_key)
//                 .query_async(&mut *cli)
//                 .await
//                 .unwrap_or(None);
//             if current_leader.as_deref() == Some(instance_id) {
//                 let _: () = redis::cmd("PEXPIRE")
//                     .arg(leader_key)
//                     .arg(ttl_ms)
//                     .query_async(&mut *cli)
//                     .await
//                     .unwrap_or(());
//                 true
//             } else {
//                 false
//             }
//         }
//     }
// }

// fn is_seat_booked_in_db(db_pool: &DbPool, schedule_id: i32, seat_id: i32) -> bool {
//     let Ok(mut conn) = db_pool.get() else {
//         return false;
//     };

//     let booked_seats_count: i64 = ss::schedule_seats
//         .filter(ss::schedule_id.eq(schedule_id))
//         .filter(ss::id.eq(seat_id))
//         .filter(ss::status.eq(SeatStatus::Booked))
//         .count()
//         .get_result(&mut conn)
//         .unwrap_or(0);

//     if booked_seats_count > 0 {
//         return true;
//     }

//     let active_tickets_count: i64 = tk::tickets
//         .filter(tk::schedule_id.eq(schedule_id))
//         .filter(tk::status.eq("active"))
//         .count()
//         .get_result(&mut conn)
//         .unwrap_or(0);

//     active_tickets_count > 0
// }

// async fn publish_room_event(redis_pool: &RedisPool, event: PubSubEvent) {
//     let Ok(mut redis_cli) = redis_pool.get().await else {
//         tracing::error!("Failed to get Redis connection for publish_room_event");
//         return;
//     };
//     let Ok(payload) = serde_json::to_string(&event) else {
//         tracing::error!("Failed to serialize PubSubEvent");
//         return;
//     };
//     let channel = keys::room_channel(match event {
//         PubSubEvent::SeatLocked { showtime_id, .. }
//         | PubSubEvent::SeatUnlocked { showtime_id, .. } => showtime_id,
//         _ => return,
//     });
//     let res: redis::RedisResult<()> = redis_cli.publish(&channel, &payload).await;
//     if let Err(e) = res {
//         tracing::error!("Failed to publish to channel {}: {:?}", channel, e);
//     } else {
//         tracing::info!("Published room event to {}", channel);
//     }
// }

// async fn publish_global_event(redis_pool: &RedisPool, event: PubSubEvent) {
//     let Ok(mut redis_cli) = redis_pool.get().await else {
//         tracing::error!("Failed to get Redis connection for publish_global_event");
//         return;
//     };
//     let Ok(payload) = serde_json::to_string(&event) else {
//         tracing::error!("Failed to serialize global PubSubEvent");
//         return;
//     };
//     let channel = keys::global_events_channel();
//     let res: redis::RedisResult<()> = redis_cli.publish(&channel, &payload).await;
//     if let Err(e) = res {
//         tracing::error!("Failed to publish to channel {}: {:?}", channel, e);
//     } else {
//         tracing::info!("Published global event to {}", channel);
//     }
// }
