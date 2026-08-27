use lapin::{Connection, ConnectionProperties};
use std::time::Duration;
use tokio_retry::{Retry, strategy::ExponentialBackoff};
use tracing::{error, info};

/// Connects to RabbitMQ with exponential backoff retries.
pub async fn connect_with_retry() -> lapin::Result<Connection> {
    let amqp_url = std::env::var("RABBITMQ_URL").expect("RABBITMQ_URL must be set");

    let attempts = env_u64("CONNECTION_RETRY_ATTEMPTS", 30);
    let initial_ms = env_u64("CONNECTION_RETRY_INITIAL_MS", 500);
    let max_ms = env_u64("CONNECTION_RETRY_MAX_MS", 30_000);
    let retry_strategy = ExponentialBackoff::from_millis(initial_ms)
        .max_delay(Duration::from_millis(max_ms))
        .take(attempts as usize);

    Retry::start(retry_strategy, || async {
        info!("Attempting to connect to RabbitMQ...");
        let options = ConnectionProperties::default();

        // Lapin uses `amqps://` internally to trigger rustls via feature flag
        match Connection::connect(&amqp_url, options.clone()).await {
            Ok(conn) => {
                info!("Successfully connected to RabbitMQ!");
                Ok(conn)
            }
            Err(e) => {
                error!("Failed to connect to RabbitMQ: {:?}", e);
                Err(e)
            }
        }
    })
    .await
}

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}
