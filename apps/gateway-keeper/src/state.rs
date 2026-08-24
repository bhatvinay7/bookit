// use std::sync::{
//     Arc,
//     atomic::{AtomicU8, Ordering},
// };

// use dashmap::DashMap;
// use redis::AsyncCommands;
// use redis_conn::{RedisPool, SingleNodeLock, SeatLock, adapter::PubSubEvent, keys};
// use serde::Deserialize;
// use serde_json::json;
// use tokio::sync::{mpsc, oneshot};
// use futures_util::StreamExt;

// const STATE_AVAILABLE: u8 = 0;
// const STATE_PROCESSING: u8 = 1;
// const LOCK_TTL_MS: u64 = 300_000;
// const LOCK_TTL_SECS: i64 = 300;
// const PROCESSING_GRACE_SECS: i64 = 20;

// #[repr(align(64))]
// pub struct CachePaddedState {
//     state: AtomicU8,
// }

include!("state_active.rs");

// enum GatewayTask {
//     Lock {
//         user_id: i32,
//         seat_ids: Vec<i32>,
//         response: oneshot::Sender<LockResult>,
//     },
//     Cancel {
//         user_id: i32,
//         seat_ids: Vec<i32>,
//         response: oneshot::Sender<Vec<i32>>,
//     },
// }

// #[derive(Debug, Clone)]
// pub struct LockResult {
//     pub locked_seat_ids: Vec<i32>,
//     pub failed_seat_ids: Vec<i32>,
// }

// #[derive(Clone)]
// pub struct GatewayState {
//     cache: Arc<DashMap<i32, DashMap<i32, Arc<CachePaddedState>>>>,
//     show_channels: Arc<DashMap<i32, mpsc::Sender<GatewayTask>>>,
//     pub redis_pool: RedisPool,
//     pub single_node_lock: Arc<SingleNodeLock>,
//     pub rmq_channel: Option<lapin::Channel>,
// }

// fn default_action() -> String {
//     "lock".to_string()
// }

// #[derive(serde::Serialize, serde::Deserialize, Debug)]
// pub struct SeatLockMessage {
//     #[serde(default = "default_action")]
//     pub action: String,
//     pub user_id: i32,
//     pub showtime_id: i32,
//     pub seat_ids: Vec<i32>,
//     pub timestamp: i64,
// }

// impl GatewayState {
//     pub fn new(
//         redis_pool: RedisPool,
//         single_node_lock: Arc<SingleNodeLock>,
//         rmq_channel: Option<lapin::Channel>,
//     ) -> Self {
//         Self {
//             cache: Arc::new(DashMap::new()),
//             show_channels: Arc::new(DashMap::new()),
//             redis_pool,
//             single_node_lock,
//             rmq_channel,
//         }
//     }

//     pub async fn publish_to_locking_queue(
//         &self,
//         action: &str,
//         user_id: i32,
//         showtime_id: i32,
//         seat_ids: Vec<i32>,
//     ) -> bool {
//         if let Some(ch) = &self.rmq_channel {
//             let msg = SeatLockMessage {
//                 action: action.to_string(),
//                 user_id,
//                 showtime_id,
//                 seat_ids,
//                 timestamp: chrono::Utc::now().timestamp_millis(),
//             };
//             if let Ok(payload) = serde_json::to_vec(&msg) {
//                 let res = ch
//                     .basic_publish(
//                         "".into(),
//                         "locking_queue".into(),
//                         lapin::options::BasicPublishOptions::default(),
//                         &payload,
//                         lapin::BasicProperties::default(),
//                     )
//                     .await;
//                 return res.is_ok();
//             }
//         }
//         false
//     }

//     /// The delayed queue is part of the lock lifecycle, so it runs beside the
//     /// single-node lock owner rather than in the downstream gRPC processor.
//     pub fn start_expiry_worker(&self) {
//         let state = self.clone();
//         tokio::spawn(async move {
//             let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
//             loop {
//                 interval.tick().await;
//                 state.release_expired_locks().await;
//             }
//         });
//     }

//     pub fn start_pubsub_listener(&self) {
//         let state = self.clone();
//         tokio::spawn(async move {
//             state.run_pubsub_loop().await;
//         });
//     }

//     async fn run_pubsub_loop(&self) {
//         let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into());
//         loop {
//             if let Err(e) = self.subscribe_and_listen(&redis_url).await {
//                 tracing::error!("PubSub listener error: {:?}", e);
//             }
//             tokio::time::sleep(std::time::Duration::from_secs(2)).await;
//         }
//     }

//     async fn subscribe_and_listen(&self, redis_url: &str) -> Result<(), Box<dyn std::error::Error>> {
//         let client = redis::Client::open(redis_url)?;
//         let mut pubsub = client.get_async_pubsub().await?;

//         pubsub.psubscribe("room:*").await?;
//         let mut stream = pubsub.on_message();

//         while let Some(msg) = stream.next().await {
//             if let Ok(payload) = msg.get_payload::<String>() {
//                 self.handle_pubsub_message(&payload, msg.get_channel_name());
//             }
//         }
//         Ok(())
//     }

//     fn handle_pubsub_message(&self, payload: &str, channel_name: &str) {
//         let Ok(serde_json::Value::Object(map)) = serde_json::from_str(payload) else { return };
//         let Some(event) = map.get("event").and_then(|v| v.as_str()) else { return };

//         if event == "seat_unlocked" || event == "seat_booked" {
//             let Some(seat_ids) = map.get("seat_ids").and_then(|v| v.as_array()) else { return };
//             let Some(showtime_id) = channel_name.split(':').nth(1).and_then(|v| v.parse::<i32>().ok()) else { return };

//             let ids: Vec<i32> = seat_ids
//                 .iter()
//                 .filter_map(|v| v.as_i64().map(|id| id as i32))
//                 .collect();

//             self.clear_admission(showtime_id, &ids);
//         }
//     }

//     /// Preserves the previous lock server's atomic admission semantics: each
//     /// seat can have only one in-flight request in this gateway process.
//     pub async fn lock(&self, user_id: i32, showtime_id: i32, seat_ids: Vec<i32>) -> LockResult {
//         let show_seats = self
//             .cache
//             .entry(showtime_id)
//             .or_insert_with(DashMap::new)
//             .clone();
//         let mut admitted = Vec::new();
//         let mut failed = Vec::new();

//         for seat_id in &seat_ids {
//             let state = show_seats
//                 .entry(*seat_id)
//                 .or_insert_with(|| {
//                     Arc::new(CachePaddedState {
//                         state: AtomicU8::new(STATE_AVAILABLE),
//                     })
//                 })
//                 .clone();
//             if state
//                 .state
//                 .compare_exchange(
//                     STATE_AVAILABLE,
//                     STATE_PROCESSING,
//                     Ordering::SeqCst,
//                     Ordering::SeqCst,
//                 )
//                 .is_ok()
//             {
//                 admitted.push(*seat_id);
//             } else {
//                 failed.push(*seat_id);
//             }
//         }

//         if admitted.is_empty() {
//             return LockResult {
//                 locked_seat_ids: vec![],
//                 failed_seat_ids: failed,
//             };
//         }

//         let tx = self.show_sender(showtime_id);

//         let (response_tx, response_rx) = oneshot::channel();
//         if tx
//             .try_send(GatewayTask::Lock {
//                 user_id,
//                 seat_ids: admitted.clone(),
//                 response: response_tx,
//             })
//             .is_err()
//         {
//             self.clear_admission(showtime_id, &admitted);
//             failed.extend(admitted);
//             return LockResult {
//                 locked_seat_ids: vec![],
//                 failed_seat_ids: failed,
//             };
//         }

//         let mut result = response_rx.await.unwrap_or(LockResult {
//             locked_seat_ids: vec![],
//             failed_seat_ids: admitted.clone(),
//         });
//         self.clear_admission(showtime_id, &result.failed_seat_ids);
//         result.failed_seat_ids.extend(failed);
//         result
//     }

//     pub async fn cancel(&self, user_id: i32, showtime_id: i32, seat_ids: Vec<i32>) -> Result<Vec<i32>, String> {
//         // Prevent cancellation if checkout is in progress
//         if let Ok(mut redis_conn) = self.redis_pool.get().await {
//             for seat_id in &seat_ids {
//                 let key = format!("seat_checkout:{}:{}", showtime_id, seat_id);
//                 let exists: bool = redis::cmd("EXISTS").arg(&key).query_async(&mut *redis_conn).await.unwrap_or(false);
//                 if exists {
//                     return Err("Cannot cancel seats while checkout is in progress".into());
//                 }
//             }
//         }

//         // Cancellation must never leave the gateway's local gate occupied.
//         self.clear_admission(showtime_id, &seat_ids);

//         // Place cancellation behind any accepted lock request for this show.
//         // This guarantees that a request cancelled while still queued cannot
//         // acquire a seat lock after the cancellation response is returned.
//         let tx = self.show_sender(showtime_id);
//         let (response_tx, response_rx) = oneshot::channel();
//         if tx
//             .send(GatewayTask::Cancel {
//                 user_id,
//                 seat_ids,
//                 response: response_tx,
//             })
//             .await
//             .is_err()
//         {
//             return Ok(vec![]);
//         }
//         Ok(response_rx.await.unwrap_or_default())
//     }

//     async fn cancel_committed(
//         &self,
//         user_id: i32,
//         showtime_id: i32,
//         seat_ids: Vec<i32>,
//     ) -> Vec<i32> {
//         let published = self.publish_to_locking_queue("unlock", user_id, showtime_id, seat_ids.clone()).await;

//         if published {
//             seat_ids
//         } else {
//             vec![]
//         }
//     }

//     fn show_sender(&self, showtime_id: i32) -> mpsc::Sender<GatewayTask> {
//         let state_for_worker = self.clone();
//         self.show_channels
//             .entry(showtime_id)
//             .or_insert_with(|| {
//                 let (tx, mut rx) = mpsc::channel::<GatewayTask>(5);
//                 tokio::spawn(async move {
//                     while let Some(task) = rx.recv().await {
//                         match task {
//                             GatewayTask::Lock {
//                                 user_id,
//                                 seat_ids,
//                                 response,
//                             } => {
//                                 let result = state_for_worker
//                                     .acquire_and_publish(user_id, showtime_id, seat_ids)
//                                     .await;
//                                 let _ = response.send(result);
//                             }
//                             GatewayTask::Cancel {
//                                 user_id,
//                                 seat_ids,
//                                 response,
//                             } => {
//                                 let result = state_for_worker
//                                     .cancel_committed(user_id, showtime_id, seat_ids)
//                                     .await;
//                                 let _ = response.send(result);
//                             }
//                         }
//                     }
//                 });
//                 tx
//             })
//             .clone()
//     }

//     async fn acquire_and_publish(
//         &self,
//         user_id: i32,
//         showtime_id: i32,
//         seat_ids: Vec<i32>,
//     ) -> LockResult {
//         let mut locked_seat_ids = Vec::new();
//         let mut failed_seat_ids = Vec::new();

//         // 1. Acquire distributed lock for each seat
//         for seat_id in seat_ids {
//             let acquired = self.single_node_lock
//                 .acquire_distributed_lock(showtime_id, seat_id, user_id, 300) // TTL 300s (5 min)
//                 .await;
//             if acquired {
//                 locked_seat_ids.push(seat_id);
//             } else {
//                 failed_seat_ids.push(seat_id);
//             }
//         }

//         // 2. Publish successfully locked seats to RMQ for metadata update
//         if !locked_seat_ids.is_empty() {
//             self.publish_to_locking_queue("lock", user_id, showtime_id, locked_seat_ids.clone()).await;
//         }

//         LockResult {
//             locked_seat_ids,
//             failed_seat_ids,
//         }
//     }

//     fn clear_admission(&self, showtime_id: i32, seat_ids: &[i32]) {
//         if let Some(show_seats) = self.cache.get(&showtime_id) {
//             for seat_id in seat_ids {
//                 if let Some(state) = show_seats.get(seat_id) {
//                     state.state.store(STATE_AVAILABLE, Ordering::SeqCst);
//                 }
//             }
//         }
//     }

//     async fn publish_room(&self, event: PubSubEvent) {
//         let Ok(mut redis_cli) = self.redis_pool.get().await else {
//             return;
//         };
//         let Ok(payload) = serde_json::to_string(&event) else {
//             return;
//         };
//         let channel = keys::room_channel(match event {
//             PubSubEvent::SeatLocked { showtime_id, .. }
//             | PubSubEvent::SeatUnlocked { showtime_id, .. } => showtime_id,
//             _ => return,
//         });
//         let _: redis::RedisResult<()> = redis_cli.publish(channel, payload).await;
//     }

//     async fn release_expired_locks(&self) {
//         let queue_key = keys::seat_processing_queue_key();
//         let now = chrono::Utc::now().timestamp();
//         let Ok(mut redis_cli) = self.redis_pool.get().await else {
//             return;
//         };
//         let due: Vec<String> = redis_cli
//             .zrangebyscore(&queue_key, "-inf", now)
//             .await
//             .unwrap_or_default();

//         for encoded in due {
//             let Ok(entry) = serde_json::from_str::<QueueEntry>(&encoded) else {
//                 self.single_node_lock
//                     .zrem_cluster(&queue_key, &encoded)
//                     .await;
//                 continue;
//             };
//             let owner = self
//                 .single_node_lock
//                 .get_lock_owner(entry.schedule_id, entry.seat_id)
//                 .await;
//             if owner.is_some() && owner != Some(entry.user_id) {
//                 // A newer owner obtained the seat after this entry's lock
//                 // expired; never clear that owner's bitmap state.
//                 self.single_node_lock
//                     .zrem_cluster(&queue_key, &encoded)
//                     .await;
//                 continue;
//             }

//             if owner == Some(entry.user_id) {
//                 let checkout_key = format!("seat_checkout:{}:{}", entry.schedule_id, entry.seat_id);
//                 let checkout_exists: bool = redis::cmd("EXISTS")
//                     .arg(&checkout_key)
//                     .query_async(&mut *redis_cli)
//                     .await
//                     .unwrap_or(false);

//                 if checkout_exists {
//                     // Checkout is in progress. Re-queue for another 5 minutes to wait for checkout to finish.
//                     let new_expiry = now + 300;
//                     self.single_node_lock.zadd_cluster(&queue_key, &encoded, new_expiry).await;
//                     continue;
//                 }

//                 self.single_node_lock
//                     .release_lock(entry.schedule_id, entry.seat_id, entry.user_id)
//                     .await;
//             }
//             self.clear_admission(entry.schedule_id, &[entry.seat_id]);

//             let user_zset_key = format!("{{{}}}:user:{}", entry.schedule_id, entry.user_id);
//             self.single_node_lock
//                 .zrem_cluster(&user_zset_key, &entry.seat_id.to_string())
//                 .await;
//             self.single_node_lock
//                 .zrem_cluster(
//                     &format!("{{{}}}:locks", entry.schedule_id),
//                     &format!("{}:{}", entry.seat_id, entry.user_id),
//                 )
//                 .await;
//             self.single_node_lock
//                 .zrem_cluster(&queue_key, &encoded)
//                 .await;
//             self.single_node_lock
//                 .set_schedule_seat_bitmap_state_cluster(
//                     &keys::schedule_seat_bitmap(entry.schedule_id),
//                     entry.seat_id,
//                     0b00,
//                 )
//                 .await;
//             self.publish_room(PubSubEvent::SeatUnlocked {
//                 user_id: entry.user_id,
//                 showtime_id: entry.schedule_id,
//                 seat_id: entry.seat_id,
//             })
//             .await;
//         }
//     }
// }

// #[derive(Deserialize)]
// struct QueueEntry {
//     seat_id: i32,
//     schedule_id: i32,
//     user_id: i32,
// }

// fn queue_member(seat_id: i32, showtime_id: i32, user_id: i32) -> String {
//     json!({
//         "seat_id": seat_id,
//         "schedule_id": showtime_id,
//         "user_id": user_id,
//     })
//     .to_string()
// }
