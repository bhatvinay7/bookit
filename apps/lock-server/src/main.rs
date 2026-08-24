// mod consumer;
// mod handlers;
// mod types;

// use bookit_db::db::create_db_pool;
// use dotenvy::dotenv;
// use redis_conn::{establish_pool, establish_seat_lock};
// use rmq_conn::connect_with_retry;
// use std::sync::Arc;
// use tracing::info;
// use uuid::Uuid;

// #[tokio::main]
// async fn main() -> Result<(), Box<dyn std::error::Error>> {
//     let _ = dotenvy::dotenv();
//     bookit_telemetry::init_telemetry("bookit-lock-server");
//     let _ = rustls::crypto::ring::default_provider().install_default();

//     let instance_id = format!("lock_server_{}", Uuid::new_v4());
//     info!(
//         instance_id = %instance_id,
//         "Starting Multi-Consumer Lock Server & Dedicated Seat Layout Updater Worker..."
//     );

//     let db_pool = create_db_pool();
//     let redis_pool = establish_pool().await?;
//     let seat_lock = establish_seat_lock().await?;

//     // Spawn dedicated background seat layout & expiry updater worker task with distributed leader locking
//     let db_for_updater = db_pool.clone();
//     let redis_for_updater = redis_pool.clone();
//     let lock_for_updater = seat_lock.clone();
//     let instance_for_updater = instance_id.clone();
//     tokio::spawn(async move {
//         handlers::start_seat_layout_updater_worker(
//             db_for_updater,
//             redis_for_updater,
//             lock_for_updater,
//             instance_for_updater,
//         )
//         .await;
//     });

//     let amqp_conn = connect_with_retry().await.expect("RMQ connection failed");
//     let channel = amqp_conn.create_channel().await?;

//     consumer::start_consumers(channel, redis_pool, seat_lock).await?;

//     Ok(())
// }

mod consumer;
mod handlers;
mod types;

include!("main_active.rs");
