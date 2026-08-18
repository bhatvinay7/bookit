use lapin::{
    options::{BasicAckOptions, BasicConsumeOptions, QueueDeclareOptions},
    types::FieldTable,
};
use redis_conn::{RedisPool, SeatLock};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{error, info};

use crate::handlers::process_lock_request;
use crate::types::SeatLockMessage;

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

    info!("Declared durable queue 'locking_queue'. Consuming seat lock requests...");

    let mut consumer = channel
        .basic_consume(
            "locking_queue".into(),
            "lock_server_consumer".into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    let concurrency: usize = std::env::var("LOCK_WORKER_CONCURRENCY")
        .unwrap_or_else(|_| "10".into())
        .parse()
        .unwrap_or(10);

    let (tx, rx) = mpsc::channel::<lapin::message::Delivery>(concurrency * 2);
    let rx = std::sync::Arc::new(tokio::sync::Mutex::new(rx));

    // Spawn multi-consumer worker tasks for queue consumption
    for worker_id in 0..concurrency {
        let seat_lock = seat_lock.clone();
        let redis_pool = redis_pool.clone();
        let rx = rx.clone();

        tokio::spawn(async move {
            info!("Lock worker task #{} started", worker_id);
            loop {
                let delivery = {
                    let mut rx_lock = rx.lock().await;
                    rx_lock.recv().await
                };

                match delivery {
                    Some(delivery) => {
                        if let Ok(msg) = serde_json::from_slice::<SeatLockMessage>(&delivery.data) {
                            process_lock_request(&msg, &seat_lock, &redis_pool).await;
                        } else {
                            error!("Invalid payload received on locking_queue");
                        }
                        let _ = delivery.ack(BasicAckOptions::default()).await;
                    }
                    None => break,
                }
            }
        });
    }

    drop(rx); // Drop original receiver in main task

    use futures::StreamExt;
    while let Some(delivery) = consumer.next().await {
        if let Ok(delivery) = delivery {
            if let Err(e) = tx.send(delivery).await {
                error!("Failed to dispatch delivery to worker pool: {:?}", e);
            }
        }
    }

    Ok(())
}
