use std::{
    panic::AssertUnwindSafe,
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
    },
    time::Duration,
};

use dashmap::{DashMap, mapref::entry::Entry};
use futures::{FutureExt, StreamExt};
use lapin::{
    message::Delivery,
    options::{BasicAckOptions, BasicConsumeOptions, BasicNackOptions, QueueDeclareOptions},
    types::FieldTable,
};
use redis_conn::{RedisPool, SeatLock};
use tokio::sync::{Mutex, Semaphore, mpsc};
use tracing::{error, info};

use crate::{handlers::process_lock_request, types::SeatLockMessage};

const AVAILABLE: u8 = 0;
const PROCESSING: u8 = 1;

#[repr(align(64))]
struct CachePaddedActor {
    sender: mpsc::Sender<LockTask>,
}

#[repr(align(64))]
struct CachePaddedSeatState {
    state: AtomicU8,
}

struct LockTask {
    message: SeatLockMessage,
    delivery: Delivery,
}

type SeatStateMap = Arc<DashMap<i32, Arc<CachePaddedSeatState>>>;
type ShowSeatMaps = Arc<DashMap<i32, SeatStateMap>>;

#[derive(Clone)]
struct LockServerActors {
    actors: Arc<DashMap<i32, Arc<CachePaddedActor>>>,
    seats: ShowSeatMaps,
    redis_pool: RedisPool,
    seat_lock: Arc<dyn SeatLock>,
    permits: Arc<Semaphore>,
    queue_capacity: usize,
}

impl LockServerActors {
    fn actor(&self, showtime_id: i32) -> Arc<CachePaddedActor> {
        match self.actors.entry(showtime_id) {
            Entry::Occupied(entry) => entry.get().clone(),
            Entry::Vacant(entry) => {
                let (sender, receiver) = mpsc::channel(self.queue_capacity);
                let actor = Arc::new(CachePaddedActor { sender });
                entry.insert(actor.clone());
                self.supervise(showtime_id, Arc::new(Mutex::new(receiver)));
                actor
            }
        }
    }

    fn supervise(&self, showtime_id: i32, receiver: Arc<Mutex<mpsc::Receiver<LockTask>>>) {
        let state = self.clone();
        tokio::spawn(async move {
            let mut restarts = 0_u64;
            loop {
                match AssertUnwindSafe(state.run_actor(showtime_id, receiver.clone()))
                    .catch_unwind()
                    .await
                {
                    Ok(()) => {
                        info!(showtime_id, "seat-lock actor channel closed");
                        break;
                    }
                    Err(_) => {
                        restarts += 1;
                        error!(
                            showtime_id,
                            restarts, "seat-lock actor panicked; restarting"
                        );
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }
            }
        });
    }

    async fn run_actor(&self, showtime_id: i32, receiver: Arc<Mutex<mpsc::Receiver<LockTask>>>) {
        let mut receiver = receiver.lock().await;
        while let Some(task) = receiver.recv().await {
            let _permit = self
                .permits
                .acquire()
                .await
                .expect("lock-server semaphore closed");
            let seat_ids = task.message.seat_ids.clone();
            self.mark_processing(showtime_id, &seat_ids);
            let result = AssertUnwindSafe(process_lock_request(
                &task.message,
                &self.seat_lock,
                &self.redis_pool,
            ))
            .catch_unwind()
            .await;
            self.clear_processing(showtime_id, &seat_ids);
            match result {
                Ok(()) => {
                    if let Err(error) = task.delivery.ack(BasicAckOptions::default()).await {
                        error!(showtime_id, ?error, "failed to acknowledge lock delivery");
                    }
                }
                Err(payload) => {
                    let _ = task
                        .delivery
                        .nack(BasicNackOptions {
                            multiple: false,
                            requeue: true,
                        })
                        .await;
                    std::panic::resume_unwind(payload);
                }
            }
        }
    }

    fn mark_processing(&self, showtime_id: i32, seat_ids: &[i32]) {
        let seats = self
            .seats
            .entry(showtime_id)
            .or_insert_with(|| Arc::new(DashMap::new()))
            .clone();
        for seat_id in seat_ids {
            let state = seats
                .entry(*seat_id)
                .or_insert_with(|| {
                    Arc::new(CachePaddedSeatState {
                        state: AtomicU8::new(AVAILABLE),
                    })
                })
                .clone();
            state.state.store(PROCESSING, Ordering::SeqCst);
        }
    }

    fn clear_processing(&self, showtime_id: i32, seat_ids: &[i32]) {
        if let Some(seats) = self.seats.get(&showtime_id) {
            for seat_id in seat_ids {
                if let Some(state) = seats.get(seat_id) {
                    state.state.store(AVAILABLE, Ordering::SeqCst);
                }
            }
        }
    }
}

pub async fn start_consumers(
    channel: lapin::Channel,
    redis_pool: RedisPool,
    seat_lock: Arc<dyn SeatLock>,
) -> Result<(), Box<dyn std::error::Error>> {
    channel
        .queue_declare(
            "locking_queue".into(),
            QueueDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;
    let mut consumer = channel
        .basic_consume(
            "locking_queue".into(),
            "lock_server_consumer".into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;
    let concurrency = std::env::var("LOCK_WORKER_CONCURRENCY")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10)
        .max(1);
    let state = LockServerActors {
        actors: Arc::new(DashMap::new()),
        seats: Arc::new(DashMap::new()),
        redis_pool,
        seat_lock,
        permits: Arc::new(Semaphore::new(concurrency)),
        queue_capacity: concurrency * 2,
    };
    info!(
        concurrency,
        "declared locking_queue with per-show seat-lock actors"
    );
    while let Some(delivery) = consumer.next().await {
        let delivery = match delivery {
            Ok(value) => value,
            Err(error) => {
                error!(?error, "RabbitMQ consumer error");
                continue;
            }
        };
        let message = match serde_json::from_slice::<SeatLockMessage>(&delivery.data) {
            Ok(value) => value,
            Err(error) => {
                error!(?error, "invalid locking_queue payload");
                let _ = delivery
                    .nack(BasicNackOptions {
                        multiple: false,
                        requeue: false,
                    })
                    .await;
                continue;
            }
        };
        let showtime_id = message.showtime_id;
        if let Err(error) = state
            .actor(showtime_id)
            .sender
            .send(LockTask { message, delivery })
            .await
        {
            error!(showtime_id, "seat-lock actor channel closed");
            let _ = error
                .0
                .delivery
                .nack(BasicNackOptions {
                    multiple: false,
                    requeue: true,
                })
                .await;
        }
    }
    Ok(())
}
