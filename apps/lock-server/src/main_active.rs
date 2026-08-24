use bookit_db::db::create_db_pool;
use redis_conn::{establish_pool, establish_seat_lock};
use rmq_conn::connect_with_retry;
use tracing::info;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    bookit_telemetry::init_telemetry("bookit-lock-server");
    let _ = rustls::crypto::ring::default_provider().install_default();
    let instance_id = format!("lock_server_{}", Uuid::new_v4());
    let db_pool = create_db_pool();
    let redis_pool = establish_pool().await?;
    let seat_lock = establish_seat_lock().await?;
    handlers::start_supervised_seat_layout_updater(
        db_pool,
        redis_pool.clone(),
        seat_lock.clone(),
        instance_id.clone(),
    );
    info!(%instance_id, "lock server started");
    let connection = connect_with_retry().await.expect("RMQ connection failed");
    consumer::start_consumers(connection.create_channel().await?, redis_pool, seat_lock).await
}
