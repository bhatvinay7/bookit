use lapin::{
    Connection, ConnectionProperties,
    tcp::{OwnedIdentity, OwnedTLSConfig},
};
use std::time::Duration;
use tokio_retry::{Retry, strategy::ExponentialBackoff};
use tracing::{error, info};

fn tls_config_from_env() -> OwnedTLSConfig {
    let identity_path = std::env::var("RABBITMQ_TLS_IDENTITY_PATH").ok();
    let ca_path = std::env::var("RABBITMQ_TLS_CA_PATH").ok();

    match (identity_path, ca_path) {
        (Some(identity_path), Some(ca_path)) => OwnedTLSConfig {
            identity: Some(OwnedIdentity::PKCS12 {
                der: std::fs::read(&identity_path).unwrap_or_else(|error| {
                    panic!("failed to read RabbitMQ client identity {identity_path}: {error}")
                }),
                password: std::env::var("RABBITMQ_TLS_IDENTITY_PASSWORD").unwrap_or_default(),
            }),
            cert_chain: Some(std::fs::read_to_string(&ca_path).unwrap_or_else(|error| {
                panic!("failed to read RabbitMQ CA certificate {ca_path}: {error}")
            })),
        },
        (None, None) => OwnedTLSConfig::default(),
        _ => panic!(
            "RABBITMQ_TLS_IDENTITY_PATH and RABBITMQ_TLS_CA_PATH must be configured together"
        ),
    }
}

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
        let runtime = lapin::runtime::default_runtime()
            .expect("Lapin requires an enabled async runtime for RabbitMQ connections");
        match Connection::connect_with_config(
            &amqp_url,
            options.clone(),
            tls_config_from_env(),
            runtime,
        )
        .await
        {
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
/// Carry W3C context through RabbitMQ without altering the business payload.
pub fn traced_properties(properties: lapin::BasicProperties) -> lapin::BasicProperties {
    let mut headers = properties.headers().clone().unwrap_or_default();
    for (key, value) in bookit_telemetry::current_carrier() {
        headers.insert(
            key.into(),
            lapin::types::AMQPValue::LongString(value.into()),
        );
    }
    properties.with_headers(headers)
}

pub fn delivery_span(delivery: &lapin::message::Delivery, queue: &str) -> tracing::Span {
    let mut carrier = bookit_telemetry::TraceCarrier::new();
    if let Some(headers) = delivery.properties.headers() {
        for key in ["traceparent", "tracestate"] {
            if let Some(lapin::types::AMQPValue::LongString(value)) = headers.inner().get(key)
                && let Ok(value) = std::str::from_utf8(value.as_bytes())
            {
                carrier.insert(key.into(), value.into());
            }
        }
    }
    bookit_telemetry::operation_span(
        &format!("{queue} process"),
        "consumer",
        Some(bookit_telemetry::extract_context(&carrier)),
    )
}
