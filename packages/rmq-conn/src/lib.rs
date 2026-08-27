use lapin::{Connection, ConnectionProperties};
use std::time::Duration;
use tokio_retry::{Retry, strategy::ExponentialBackoff};
use tracing::{error, info};

/// Connects to RabbitMQ with exponential backoff retries.
pub async fn connect_with_retry() -> lapin::Result<Connection> {
    let amqp_url = std::env::var("RABBITMQ_URL").expect("RABBITMQ_URL must be set");

    let initial_delay = std::env::var("CONNECTION_RETRY_INITIAL_MS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(500);
    let max_delay = std::env::var("CONNECTION_RETRY_MAX_MS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(30_000);
    let attempts = std::env::var("CONNECTION_RETRY_ATTEMPTS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(30)
        .max(1);

    let retry_strategy = ExponentialBackoff::from_millis(initial_delay)
        .max_delay(Duration::from_millis(max_delay))
        .take(attempts);

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
