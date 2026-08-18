mod consumer;
mod db;
mod email;

use bookit_db::db::create_db_pool;
use dotenvy::dotenv;
use lapin::{
    options::{ExchangeDeclareOptions, QueueBindOptions, QueueDeclareOptions, BasicConsumeOptions},
    types::{AMQPValue, FieldTable},
    ExchangeKind,
};
use rmq_conn::connect_with_retry;
use std::collections::BTreeMap;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    bookit_telemetry::init_telemetry("bookit-notification-worker");
    let _ = rustls::crypto::ring::default_provider().install_default();

    println!("Starting Notification & Audit Worker...");

    let db_pool = create_db_pool();

    let amqp_conn = connect_with_retry().await.expect("RMQ connect failed");
    let channel = amqp_conn.create_channel().await.unwrap();

    // 1. Declare Fanout Exchange
    channel
        .exchange_declare(
            "booking_events_exchange".into(),
            ExchangeKind::Fanout,
            ExchangeDeclareOptions::default(),
            FieldTable::default(),
        )
        .await?;

    // 2. Declare Dead Letter Exchange & Queue for Notification Worker
    channel
        .exchange_declare(
            "notification_dlx".into(),
            ExchangeKind::Direct,
            ExchangeDeclareOptions::default(),
            FieldTable::default(),
        )
        .await?;

    channel
        .queue_declare(
            "notification_failed".into(),
            QueueDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;

    channel
        .queue_bind(
            "notification_failed".into(),
            "notification_dlx".into(),
            "failed".into(),
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;

    // 3. Declare Notification Queue with DLQ arguments
    let mut q_args = BTreeMap::new();
    q_args.insert(
        "x-dead-letter-exchange".into(),
        AMQPValue::LongString("notification_dlx".into()),
    );
    q_args.insert(
        "x-dead-letter-routing-key".into(),
        AMQPValue::LongString("failed".into()),
    );

    channel
        .queue_declare(
            "notification_queue".into(),
            QueueDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::from(q_args),
        )
        .await?;

    channel
        .queue_bind(
            "notification_queue".into(),
            "booking_events_exchange".into(),
            "".into(),
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;

    let consumer = channel
        .basic_consume(
            "notification_queue".into(),
            "notify_worker_tag".into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    consumer::process_messages(consumer, db_pool).await;

    Ok(())
}
