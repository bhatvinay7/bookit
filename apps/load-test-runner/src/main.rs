//! Bounded, in-cluster lock contention generator for manual load tests.
//!
//! The global dispatcher admits exactly `RPS * duration` attempts. Tokio
//! workers each keep their own gRPC connection so the normal ClusterIP Service
//! can distribute connections over ready Gateway Keeper replicas.

use std::{
    env,
    error::Error,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tokio::{
    sync::{Mutex, mpsc},
    time::{MissedTickBehavior, interval},
};
use tonic::transport::Endpoint;

pub mod locking {
    tonic::include_proto!("locking");
}

use locking::{
    LockSlotRequest, UnlockSlotRequest, slot_locking_service_client::SlotLockingServiceClient,
};

type AppResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

#[derive(Clone, Deserialize)]
struct LockPayload {
    #[serde(alias = "showtimeId")]
    showtime_id: i32,
    #[serde(alias = "seatIds")]
    seat_ids: Vec<i32>,
    #[serde(alias = "userId")]
    user_id: i32,
    #[serde(alias = "totalSeatCount")]
    total_seat_count: i32,
    #[serde(alias = "seatIndices")]
    seat_indices: Vec<i32>,
}

impl LockPayload {
    fn validate(&self) -> AppResult<()> {
        if self.showtime_id <= 0
            || self.user_id <= 0
            || self.total_seat_count <= 0
            || self.seat_ids.len() != 1
            || self.seat_indices.len() != 1
            || self.seat_ids[0] <= 0
            || self.seat_indices[0] <= 0
            || self.seat_indices[0] > self.total_seat_count
        {
            return Err("LOAD_TEST_GRPC_PAYLOAD must contain one valid, isolated seat".into());
        }
        Ok(())
    }

    fn lock_request(&self) -> LockSlotRequest {
        LockSlotRequest {
            showtime_id: self.showtime_id,
            seat_ids: self.seat_ids.clone(),
            user_id: self.user_id,
            total_seat_count: self.total_seat_count,
            seat_indices: self.seat_indices.clone(),
        }
    }

    fn unlock_request(&self) -> UnlockSlotRequest {
        UnlockSlotRequest {
            showtime_id: self.showtime_id,
            seat_ids: self.seat_ids.clone(),
            user_id: self.user_id,
            total_seat_count: self.total_seat_count,
            seat_indices: self.seat_indices.clone(),
        }
    }
}

struct Config {
    target: String,
    payload: LockPayload,
    rps: u64,
    duration: Duration,
    workers: usize,
    threads: usize,
    run_id: String,
    pushgateway_url: String,
}

impl Config {
    fn required(name: &str) -> AppResult<String> {
        env::var(name).map_err(|_| format!("{name} is required").into())
    }

    fn positive(name: &str, default: u64, maximum: u64) -> AppResult<u64> {
        let value = env::var(name)
            .ok()
            .map(|v| v.parse::<u64>())
            .transpose()?
            .unwrap_or(default);
        if value == 0 || value > maximum {
            return Err(format!("{name} must be between 1 and {maximum}").into());
        }
        Ok(value)
    }

    fn from_env() -> AppResult<Self> {
        let payload: LockPayload =
            serde_json::from_str(&Self::required("LOAD_TEST_GRPC_PAYLOAD")?)?;
        payload.validate()?;
        let rps = Self::positive("LOAD_TEST_RPS", 50, 10_000)?;
        let duration_seconds = Self::positive("LOAD_TEST_DURATION_SECONDS", 600, 14_400)?;
        let workers = Self::positive("LOAD_TEST_CONCURRENCY", 100, 5_000)? as usize;
        let threads = Self::positive("LOAD_TEST_THREADS", 4, 32)? as usize;
        Ok(Self {
            target: env::var("LOAD_TEST_GRPC_TARGET")
                .unwrap_or_else(|_| "http://gateway-keeper.bookit.svc.cluster.local:50052".into()),
            payload,
            rps,
            duration: Duration::from_secs(duration_seconds),
            workers,
            threads,
            run_id: Self::required("LOAD_TEST_RUN_ID")?,
            pushgateway_url: env::var("LOAD_TEST_PUSHGATEWAY_URL").unwrap_or_else(|_| {
                "http://load-test-pushgateway.monitoring.svc.cluster.local:9091".into()
            }),
        })
    }
}

#[derive(Default)]
struct Counters {
    requested: AtomicU64,
    accepted: AtomicU64,
    conflicts: AtomicU64,
    transport_errors: AtomicU64,
    dropped: AtomicU64,
}

#[derive(Serialize)]
struct Summary {
    requested: u64,
    accepted: u64,
    conflicts: u64,
    transport_errors: u64,
    dropped: u64,
    duration_seconds: u64,
    observed_rps: f64,
    target_rps: u64,
    workers: usize,
    threads: usize,
}

async fn connect(target: &str) -> AppResult<SlotLockingServiceClient<tonic::transport::Channel>> {
    let endpoint = Endpoint::from_shared(target.to_owned())?
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(10));
    Ok(SlotLockingServiceClient::connect(endpoint).await?)
}

async fn unlock(
    client: &mut SlotLockingServiceClient<tonic::transport::Channel>,
    payload: &LockPayload,
) {
    if let Err(error) = client.unlock_slot(payload.unlock_request()).await {
        eprintln!("lock cleanup failed: {error}");
    }
}

async fn verify_free_test_seat(config: &Config) -> AppResult<()> {
    let mut client = connect(&config.target).await?;
    let response = client
        .lock_slot(config.payload.lock_request())
        .await?
        .into_inner();
    if !response.success
        || !response
            .locked_seat_ids
            .contains(&config.payload.seat_ids[0])
    {
        return Err("test seat is not free; choose an isolated available schedule/seat".into());
    }
    unlock(&mut client, &config.payload).await;
    // Unlock propagation is asynchronous. A short delay lets the next request
    // begin with an available seat instead of measuring a stale test lock.
    tokio::time::sleep(Duration::from_secs(2)).await;
    Ok(())
}

async fn worker(
    receiver: Arc<Mutex<mpsc::Receiver<()>>>,
    config: Arc<Config>,
    counters: Arc<Counters>,
) {
    let mut client = match connect(&config.target).await {
        Ok(client) => client,
        Err(error) => {
            eprintln!("worker connection failed: {error}");
            counters.transport_errors.fetch_add(1, Ordering::Relaxed);
            return;
        }
    };

    loop {
        let next = { receiver.lock().await.recv().await };
        if next.is_none() {
            return;
        }
        counters.requested.fetch_add(1, Ordering::Relaxed);
        match client.lock_slot(config.payload.lock_request()).await {
            Ok(response) => {
                if response.into_inner().success {
                    counters.accepted.fetch_add(1, Ordering::Relaxed);
                } else {
                    counters.conflicts.fetch_add(1, Ordering::Relaxed);
                }
            }
            Err(error) => {
                eprintln!("gRPC lock request failed: {error}");
                counters.transport_errors.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
}

async fn push_metrics(config: &Config, summary: &Summary) -> AppResult<()> {
    let metrics = format!(
        "# TYPE bookit_load_test_rust_lock_requested_requests gauge\n\
bookit_load_test_rust_lock_requested_requests{{test_case=\"rust_lock_job\"}} {}\n\
# TYPE bookit_load_test_rust_lock_accepted_requests gauge\n\
bookit_load_test_rust_lock_accepted_requests{{test_case=\"rust_lock_job\"}} {}\n\
# TYPE bookit_load_test_rust_lock_conflict_requests gauge\n\
bookit_load_test_rust_lock_conflict_requests{{test_case=\"rust_lock_job\"}} {}\n\
# TYPE bookit_load_test_rust_lock_transport_errors gauge\n\
bookit_load_test_rust_lock_transport_errors{{test_case=\"rust_lock_job\"}} {}\n\
# TYPE bookit_load_test_rust_lock_dropped_requests gauge\n\
bookit_load_test_rust_lock_dropped_requests{{test_case=\"rust_lock_job\"}} {}\n\
# TYPE bookit_load_test_rust_lock_observed_rps gauge\n\
bookit_load_test_rust_lock_observed_rps{{test_case=\"rust_lock_job\"}} {:.3}\n\
# TYPE bookit_load_test_rust_lock_complete gauge\n\
bookit_load_test_rust_lock_complete{{test_case=\"rust_lock_job\"}} 1\n",
        summary.requested,
        summary.accepted,
        summary.conflicts,
        summary.transport_errors,
        summary.dropped,
        summary.observed_rps,
    );
    let url = format!(
        "{}/metrics/job/bookit_rust_lock_load/run_id/{}",
        config.pushgateway_url.trim_end_matches('/'),
        config.run_id
    );
    let response = reqwest::Client::new().put(url).body(metrics).send().await?;
    if !response.status().is_success() {
        return Err(format!(
            "Pushgateway rejected load-test metrics: {}",
            response.status()
        )
        .into());
    }
    Ok(())
}

async fn run(config: Config) -> AppResult<()> {
    verify_free_test_seat(&config).await?;
    let config = Arc::new(config);
    let counters = Arc::new(Counters::default());
    let queue_size = config.workers.saturating_mul(2);
    let (sender, receiver) = mpsc::channel(queue_size);
    let receiver = Arc::new(Mutex::new(receiver));
    let mut workers = Vec::with_capacity(config.workers);
    for _ in 0..config.workers {
        workers.push(tokio::spawn(worker(
            Arc::clone(&receiver),
            Arc::clone(&config),
            Arc::clone(&counters),
        )));
    }

    let attempts = config.rps.saturating_mul(config.duration.as_secs());
    let mut ticker = interval(Duration::from_secs_f64(1.0 / config.rps as f64));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let started = tokio::time::Instant::now();
    for _ in 0..attempts {
        ticker.tick().await;
        if sender.try_send(()).is_err() {
            counters.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
    drop(sender);
    for worker in workers {
        worker.await?;
    }
    let elapsed = started.elapsed();

    let mut cleanup_client = connect(&config.target).await?;
    unlock(&mut cleanup_client, &config.payload).await;
    let requested = counters.requested.load(Ordering::Relaxed);
    let summary = Summary {
        requested,
        accepted: counters.accepted.load(Ordering::Relaxed),
        conflicts: counters.conflicts.load(Ordering::Relaxed),
        transport_errors: counters.transport_errors.load(Ordering::Relaxed),
        dropped: counters.dropped.load(Ordering::Relaxed),
        duration_seconds: elapsed.as_secs(),
        observed_rps: requested as f64 / elapsed.as_secs_f64().max(f64::EPSILON),
        target_rps: config.rps,
        workers: config.workers,
        threads: config.threads,
    };
    println!("{}", serde_json::to_string(&summary)?);
    push_metrics(&config, &summary).await?;

    if summary.accepted == 0 || summary.transport_errors > 0 || summary.dropped > 0 {
        return Err(
            "load test failed: no accepted lock, transport errors, or generator drops detected"
                .into(),
        );
    }
    Ok(())
}

fn main() -> AppResult<()> {
    let config = Config::from_env()?;
    let threads = config.threads;
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(threads)
        .enable_all()
        .build()?
        .block_on(run(config))
}
