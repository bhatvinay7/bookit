use lapin::{Connection, ConnectionProperties};
use std::time::Duration;
use tokio_retry::{Retry, strategy::ExponentialBackoff};
use tracing::{error, info};

/// Connects to RabbitMQ with exponential backoff retries.
pub async fn connect_with_retry() -> lapin::Result<Connection> {
    let amqp_url = std::env::var("RABBITMQ_URL").expect("RABBITMQ_URL must be set");

    let retry_strategy = ExponentialBackoff::from_millis(100)
        .max_delay(Duration::from_secs(10)) // max 10 second delay between retries
        .take(10); // Attempt up to 10 times

    Retry::spawn(retry_strategy, || async {
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
