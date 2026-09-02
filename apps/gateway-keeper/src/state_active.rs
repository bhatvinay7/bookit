use std::{
    panic::AssertUnwindSafe,
    sync::{
        Arc,
        atomic::{AtomicI32, AtomicU8, Ordering},
    },
    time::Duration,
};

use dashmap::{DashMap, mapref::entry::Entry};
use futures_util::{FutureExt, StreamExt};
use redis::AsyncCommands;
use redis_conn::{RedisPool, SeatLock, SingleNodeLock, adapter::PubSubEvent, keys};
use serde::Deserialize;
use tokio::sync::{Mutex, mpsc, oneshot};
use tracing::{error, info, warn};

const STATE_AVAILABLE: u8 = 0;
const STATE_PROCESSING: u8 = 1;
const SHOW_QUEUE_CAPACITY: usize = 5;
const MAX_SEATS_PER_SHOW: usize = 200_000;
const ACTOR_RESTART_DELAY: Duration = Duration::from_millis(500);

type ShowKey = i32;
type ShowSeatStates = Box<[CachePaddedSeatState]>;
type ShowActorCell = Arc<tokio::sync::OnceCell<Arc<CachePaddedShowActor>>>;

#[repr(align(64))]
pub struct CachePaddedSeatState {
    seat_id: AtomicI32,
    state: AtomicU8,
}

#[repr(align(64))]
struct CachePaddedShowActor {
    sender: mpsc::Sender<GatewayTask>,
    seat_states: ShowSeatStates,
    seat_indices: DashMap<i32, usize>,
}

impl CachePaddedShowActor {
    fn new(sender: mpsc::Sender<GatewayTask>, seat_count: usize) -> Result<Self, String> {
        let mut seats = Vec::new();
        seats
            .try_reserve_exact(seat_count)
            .map_err(|_| "unable to allocate show seat state".to_string())?;
        seats.resize_with(seat_count, || CachePaddedSeatState {
            seat_id: AtomicI32::new(0),
            state: AtomicU8::new(STATE_AVAILABLE),
        });
        Ok(Self {
            sender,
            seat_states: seats.into_boxed_slice(),
            seat_indices: DashMap::new(),
        })
    }

    fn validate_seat_count(&self, seat_count: usize) -> Result<(), String> {
        if self.seat_states.len() == seat_count {
            Ok(())
        } else {
            Err("total seat count does not match the initialized show".into())
        }
    }

    fn register_seat(&self, seat_id: i32, one_based_index: i32) -> Result<usize, String> {
        if seat_id <= 0 {
            return Err("seat ids must be positive".into());
        }
        let index = one_based_index
            .checked_sub(1)
            .and_then(|index| usize::try_from(index).ok())
            .filter(|index| *index < self.seat_states.len())
            .ok_or_else(|| "seat index is outside the show seat count".to_string())?;

        if let Some(existing) = self.seat_indices.get(&seat_id) {
            if *existing != index {
                return Err("seat id maps to a different seat index".into());
            }
        } else {
            match self.seat_indices.entry(seat_id) {
                Entry::Occupied(entry) if *entry.get() != index => {
                    return Err("seat id maps to a different seat index".into());
                }
                Entry::Occupied(_) => {}
                Entry::Vacant(entry) => {
                    entry.insert(index);
                }
            }
        }

        let slot = &self.seat_states[index];
        match slot
            .seat_id
            .compare_exchange(0, seat_id, Ordering::SeqCst, Ordering::SeqCst)
        {
            Ok(_) => Ok(index),
            Err(existing) if existing == seat_id => Ok(index),
            Err(_) => {
                self.seat_indices.remove_if(&seat_id, |_, mapped| *mapped == index);
                Err("seat index maps to a different seat id".into())
            }
        }
    }

    fn try_admit(&self, index: usize) -> bool {
        self.seat_states[index]
            .state
            .compare_exchange(
                STATE_AVAILABLE,
                STATE_PROCESSING,
                Ordering::SeqCst,
                Ordering::SeqCst,
            )
            .is_ok()
    }

    fn clear_seat(&self, seat_id: i32) {
        let index = self.seat_indices.get(&seat_id).map(|index| *index);
        if let Some(index) = index {
            self.seat_states[index]
                .state
                .store(STATE_AVAILABLE, Ordering::SeqCst);
        }
    }
}

enum GatewayTask {
    Lock {
        user_id: i32,
        seat_ids: Vec<i32>,
        response: oneshot::Sender<LockResult>,
    },
    Cancel {
        user_id: i32,
        seat_ids: Vec<i32>,
        response: oneshot::Sender<Vec<i32>>,
    },
}

#[derive(Debug, Clone)]
pub struct LockResult {
    pub locked_seat_ids: Vec<i32>,
    pub failed_seat_ids: Vec<i32>,
}

#[derive(Clone)]
pub struct GatewayState {
    show_actors: Arc<DashMap<ShowKey, ShowActorCell>>,
    pub redis_pool: RedisPool,
    pub single_node_lock: Arc<SingleNodeLock>,
    pub rmq_channel: Option<lapin::Channel>,
}

fn default_action() -> String {
    "lock".to_string()
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct SeatLockMessage {
    #[serde(default = "default_action")]
    pub action: String,
    pub user_id: i32,
    pub showtime_id: i32,
    pub seat_ids: Vec<i32>,
    pub timestamp: i64,
}

impl GatewayState {
    pub fn new(
        redis_pool: RedisPool,
        single_node_lock: Arc<SingleNodeLock>,
        rmq_channel: Option<lapin::Channel>,
    ) -> Self {
        Self {
            show_actors: Arc::new(DashMap::new()),
            redis_pool,
            single_node_lock,
            rmq_channel,
        }
    }

    pub async fn lock(
        &self,
        user_id: i32,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        seat_indices: Vec<i32>,
        total_seat_count: i32,
    ) -> Result<LockResult, String> {
        if seat_ids.len() != seat_indices.len() {
            return Err("seat_ids and seat_indices must have the same length".into());
        }
        let actor = self
            .get_or_create_show_actor(showtime_id, total_seat_count)
            .await?;
        let seats = seat_ids
            .into_iter()
            .zip(seat_indices)
            .map(|(seat_id, seat_index)| {
                actor
                    .register_seat(seat_id, seat_index)
                    .map(|index| (seat_id, index))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let mut admitted = Vec::new();
        let mut failed = Vec::new();
        for (seat_id, index) in seats {
            if actor.try_admit(index) {
                admitted.push(seat_id);
            } else {
                failed.push(seat_id);
            }
        }
        if admitted.is_empty() {
            return Ok(LockResult {
                locked_seat_ids: vec![],
                failed_seat_ids: failed,
            });
        }

        let (response, reply) = oneshot::channel();
        if actor
            .sender
            .try_send(GatewayTask::Lock {
                user_id,
                seat_ids: admitted.clone(),
                response,
            })
            .is_err()
        {
            self.clear_admission(showtime_id, &admitted);
            failed.extend(admitted);
            return Ok(LockResult {
                locked_seat_ids: vec![],
                failed_seat_ids: failed,
            });
        }

        let mut result = reply.await.unwrap_or_else(|_| LockResult {
            locked_seat_ids: vec![],
            failed_seat_ids: admitted.clone(),
        });
        self.clear_admission(showtime_id, &result.failed_seat_ids);
        result.failed_seat_ids.extend(failed);
        Ok(result)
    }

    pub async fn cancel(
        &self,
        user_id: i32,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        seat_indices: Vec<i32>,
        total_seat_count: i32,
    ) -> Result<Vec<i32>, String> {
        if seat_ids.len() != seat_indices.len() {
            return Err("seat_ids and seat_indices must have the same length".into());
        }
        let actor = self
            .get_or_create_show_actor(showtime_id, total_seat_count)
            .await?;
        for (&seat_id, &seat_index) in seat_ids.iter().zip(&seat_indices) {
            actor.register_seat(seat_id, seat_index)?;
        }
        if let Ok(mut conn) = self.redis_pool.get().await {
            for seat_id in &seat_ids {
                let key = format!("seat_checkout:{showtime_id}:{seat_id}");
                let exists: bool = redis::cmd("EXISTS")
                    .arg(key)
                    .query_async(&mut *conn)
                    .await
                    .unwrap_or(false);
                if exists {
                    return Err("Cannot cancel seats while checkout is in progress".into());
                }
            }
        }
        self.clear_admission(showtime_id, &seat_ids);
        let (response, reply) = oneshot::channel();
        actor
            .sender
            .send(GatewayTask::Cancel {
                user_id,
                seat_ids,
                response,
            })
            .await
            .map_err(|_| "show actor is unavailable".to_string())?;
        Ok(reply.await.unwrap_or_default())
    }

    async fn get_or_create_show_actor(
        &self,
        key: ShowKey,
        total_seat_count: i32,
    ) -> Result<Arc<CachePaddedShowActor>, String> {
        let seat_count = usize::try_from(total_seat_count)
            .ok()
            .filter(|count| *count > 0 && *count <= MAX_SEATS_PER_SHOW)
            .ok_or_else(|| format!("total_seat_count must be between 1 and {MAX_SEATS_PER_SHOW}"))?;
        // Insert only a lightweight cell while holding the DashMap shard.
        // Array allocation and supervisor startup happen once, outside it.
        let actor_cell = if let Some(cell) = self.show_actors.get(&key) {
            Arc::clone(cell.value())
        } else {
            let new_cell = Arc::new(tokio::sync::OnceCell::new());
            match self.show_actors.entry(key) {
                Entry::Occupied(entry) => Arc::clone(entry.get()),
                Entry::Vacant(entry) => {
                    entry.insert(Arc::clone(&new_cell));
                    new_cell
                }
            }
        };
        let actor = actor_cell
            .get_or_try_init(|| async {
                let (sender, receiver) = mpsc::channel(SHOW_QUEUE_CAPACITY);
                let actor = Arc::new(CachePaddedShowActor::new(sender, seat_count)?);
                // The map already owns actor_cell, so the supervisor's cloned
                // GatewayState keeps this actor and its fixed array alive.
                self.start_show_supervisor(key, Arc::new(Mutex::new(receiver)));
                Ok::<_, String>(actor)
            })
            .await?;
        actor.validate_seat_count(seat_count)?;
        Ok(Arc::clone(actor))
    }

    fn start_show_supervisor(
        &self,
        key: ShowKey,
        receiver: Arc<Mutex<mpsc::Receiver<GatewayTask>>>,
    ) {
        let state = self.clone();
        tokio::spawn(async move {
            let mut restarts = 0_u64;
            loop {
                let outcome = AssertUnwindSafe(state.run_show_actor(key, receiver.clone()))
                    .catch_unwind()
                    .await;
                match outcome {
                    Ok(()) => {
                        info!(showtime_id = key, "show actor channel closed");
                        break;
                    }
                    Err(_) => {
                        restarts += 1;
                        error!(
                            showtime_id = key,
                            restarts, "show actor panicked; restarting"
                        );
                        tokio::time::sleep(ACTOR_RESTART_DELAY).await;
                    }
                }
            }
        });
    }

    async fn run_show_actor(
        &self,
        key: ShowKey,
        receiver: Arc<Mutex<mpsc::Receiver<GatewayTask>>>,
    ) {
        let mut receiver = receiver.lock().await;
        while let Some(task) = receiver.recv().await {
            match task {
                GatewayTask::Lock {
                    user_id,
                    seat_ids,
                    response,
                } => {
                    let fallback = seat_ids.clone();
                    let result = AssertUnwindSafe(self.acquire_and_publish(user_id, key, seat_ids))
                        .catch_unwind()
                        .await;
                    match result {
                        Ok(result) => {
                            let _ = response.send(result);
                        }
                        Err(payload) => {
                            self.clear_admission(key, &fallback);
                            drop(response);
                            std::panic::resume_unwind(payload);
                        }
                    }
                }
                GatewayTask::Cancel {
                    user_id,
                    seat_ids,
                    response,
                } => {
                    let result = self.cancel_committed(user_id, key, seat_ids).await;
                    let _ = response.send(result);
                }
            }
        }
    }

    async fn acquire_and_publish(
        &self,
        user_id: i32,
        showtime_id: i32,
        seat_ids: Vec<i32>,
    ) -> LockResult {
        let mut locked = Vec::new();
        let mut failed = Vec::new();
        for seat_id in seat_ids {
            if self
                .single_node_lock
                .acquire_distributed_lock(showtime_id, seat_id, user_id, 300)
                .await
            {
                locked.push(seat_id);
            } else {
                failed.push(seat_id);
            }
        }
        if !locked.is_empty()
            && !self
                .publish_to_locking_queue("lock", user_id, showtime_id, locked.clone())
                .await
        {
            warn!(
                showtime_id,
                "seat locks acquired but RabbitMQ publication failed"
            );
        }
        LockResult {
            locked_seat_ids: locked,
            failed_seat_ids: failed,
        }
    }

    async fn cancel_committed(
        &self,
        user_id: i32,
        showtime_id: i32,
        seat_ids: Vec<i32>,
    ) -> Vec<i32> {
        if self
            .publish_to_locking_queue("unlock", user_id, showtime_id, seat_ids.clone())
            .await
        {
            seat_ids
        } else {
            vec![]
        }
    }

    async fn publish_to_locking_queue(
        &self,
        action: &str,
        user_id: i32,
        showtime_id: i32,
        seat_ids: Vec<i32>,
    ) -> bool {
        let Some(channel) = &self.rmq_channel else {
            return false;
        };
        let message = SeatLockMessage {
            action: action.into(),
            user_id,
            showtime_id,
            seat_ids,
            timestamp: chrono::Utc::now().timestamp_millis(),
        };
        let Ok(payload) = serde_json::to_vec(&message) else {
            return false;
        };
        channel
            .basic_publish(
                "".into(),
                "locking_queue".into(),
                lapin::options::BasicPublishOptions::default(),
                &payload,
                lapin::BasicProperties::default(),
            )
            .await
            .is_ok()
    }

    fn clear_admission(&self, key: ShowKey, seat_ids: &[i32]) {
        let Some(actor_cell) = self
            .show_actors
            .get(&key)
            .map(|cell| Arc::clone(cell.value()))
        else {
            return;
        };
        let Some(actor) = actor_cell.get() else {
            return;
        };
        for seat_id in seat_ids {
            actor.clear_seat(*seat_id);
        }
    }

    pub fn start_expiry_worker(&self) {
        let state = self.clone();
        tokio::spawn(async move {
            loop {
                let result = AssertUnwindSafe(state.run_expiry_loop())
                    .catch_unwind()
                    .await;
                if result.is_ok() {
                    break;
                }
                error!("gateway expiry worker panicked; restarting");
                tokio::time::sleep(ACTOR_RESTART_DELAY).await;
            }
        });
    }

    async fn run_expiry_loop(&self) {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            self.release_expired_locks().await;
        }
    }

    pub fn start_pubsub_listener(&self) {
        let state = self.clone();
        tokio::spawn(async move {
            loop {
                let result = AssertUnwindSafe(state.run_pubsub_loop())
                    .catch_unwind()
                    .await;
                if result.is_ok() {
                    break;
                }
                error!("gateway pubsub worker panicked; restarting");
                tokio::time::sleep(ACTOR_RESTART_DELAY).await;
            }
        });
    }

    async fn run_pubsub_loop(&self) {
        let url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into());
        loop {
            if let Err(error) = self.subscribe_and_listen(&url).await {
                error!(?error, "pubsub listener failed");
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }

    async fn subscribe_and_listen(&self, url: &str) -> Result<(), Box<dyn std::error::Error>> {
        let client = redis::Client::open(url)?;
        let mut pubsub = client.get_async_pubsub().await?;
        pubsub.psubscribe("room:*").await?;
        let mut stream = pubsub.on_message();
        while let Some(message) = stream.next().await {
            if let Ok(payload) = message.get_payload::<String>() {
                let channel = message.get_channel_name();
                self.handle_pubsub_message(&payload, channel);
            }
        }
        Ok(())
    }

    fn handle_pubsub_message(&self, payload: &str, channel: &str) {
        let Ok(serde_json::Value::Object(value)) = serde_json::from_str(payload) else {
            return;
        };
        let Some(event) = value.get("event").and_then(|v| v.as_str()) else {
            return;
        };
        if event != "seat_unlocked" && event != "seat_booked" {
            return;
        }
        let Some(showtime_id) = channel.split(':').nth(1).and_then(|v| v.parse().ok()) else {
            return;
        };
        let Some(values) = value.get("seat_ids").and_then(|v| v.as_array()) else {
            return;
        };
        let seats: Vec<i32> = values
            .iter()
            .filter_map(|v| v.as_i64().map(|id| id as i32))
            .collect();
        self.clear_admission(showtime_id, &seats);
    }

    async fn release_expired_locks(&self) {
        let queue = keys::seat_processing_queue_key();
        let now = chrono::Utc::now().timestamp();
        let Ok(mut redis) = self.redis_pool.get().await else {
            return;
        };
        let entries: Vec<String> = redis
            .zrangebyscore(&queue, "-inf", now)
            .await
            .unwrap_or_default();
        for encoded in entries {
            let Ok(entry) = serde_json::from_str::<QueueEntry>(&encoded) else {
                self.single_node_lock.zrem_cluster(&queue, &encoded).await;
                continue;
            };
            let owner = self
                .single_node_lock
                .get_lock_owner(entry.schedule_id, entry.seat_id)
                .await;
            if owner.is_some() && owner != Some(entry.user_id) {
                self.single_node_lock.zrem_cluster(&queue, &encoded).await;
                continue;
            }
            if owner == Some(entry.user_id) {
                let checkout = format!("seat_checkout:{}:{}", entry.schedule_id, entry.seat_id);
                let active: bool = redis::cmd("EXISTS")
                    .arg(checkout)
                    .query_async(&mut *redis)
                    .await
                    .unwrap_or(false);
                if active {
                    self.single_node_lock
                        .zadd_cluster(&queue, &encoded, now + 300)
                        .await;
                    continue;
                }
                self.single_node_lock
                    .release_lock(entry.schedule_id, entry.seat_id, entry.user_id)
                    .await;
            }
            self.clear_admission(entry.schedule_id, &[entry.seat_id]);
            self.single_node_lock.zrem_cluster(&queue, &encoded).await;
            self.single_node_lock
                .set_schedule_seat_bitmap_state_cluster(
                    &keys::schedule_seat_bitmap(entry.schedule_id),
                    entry.seat_id,
                    0b00,
                )
                .await;
            self.publish_room(PubSubEvent::SeatUnlocked {
                user_id: entry.user_id,
                showtime_id: entry.schedule_id,
                seat_id: entry.seat_id,
            })
            .await;
        }
    }

    async fn publish_room(&self, event: PubSubEvent) {
        let showtime_id = match &event {
            PubSubEvent::SeatLocked { showtime_id, .. }
            | PubSubEvent::SeatUnlocked { showtime_id, .. } => *showtime_id,
            _ => return,
        };
        let Ok(mut redis) = self.redis_pool.get().await else {
            return;
        };
        let Ok(payload) = serde_json::to_string(&event) else {
            return;
        };
        let _: redis::RedisResult<()> = redis
            .publish(keys::room_channel(showtime_id), payload)
            .await;
    }
}

#[derive(Deserialize)]
struct QueueEntry {
    seat_id: i32,
    schedule_id: i32,
    user_id: i32,
}

#[cfg(test)]
#[path = "../tests/unit/state_active.rs"]
mod tests;
