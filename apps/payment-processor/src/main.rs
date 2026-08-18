mod consumer;
mod payment;

use bookit_db::db::create_db_pool;
use dotenvy::dotenv;
use lapin::types::AMQPValue;
use lapin::{
    options::{BasicConsumeOptions, ExchangeDeclareOptions, QueueBindOptions, QueueDeclareOptions},
    types::FieldTable,
    ExchangeKind,
};
use redis_conn::{establish_pool, establish_seat_lock};
use rmq_conn::connect_with_retry;
use std::collections::BTreeMap;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install crypto provider");

    let _ = dotenvy::dotenv();
    bookit_telemetry::init_telemetry("bookit-payment-processor");
    println!("Starting Payment Processor Worker...");

    // 1. Connect to PostgreSQL and Redis cluster
    let db_pool = create_db_pool();
    let redis_pool = establish_pool().await?;
    let seat_lock = establish_seat_lock().await.expect("Failed to connect to Redis cluster");

    // 2. RabbitMQ Connection
    let amqp_conn = connect_with_retry().await.expect("RMQ connect failed");
    let channel = amqp_conn.create_channel().await.unwrap();

    // 3. Topology Setup
    // Dead Letter Exchange
    channel
        .exchange_declare(
            "payment_dlx".into(),
            ExchangeKind::Direct,
            ExchangeDeclareOptions::default(),
            FieldTable::default(),
        )
        .await?;

    // Dead Letter Queue
    channel
        .queue_declare(
            "payment_failed".into(),
            QueueDeclareOptions::default(),
            FieldTable::default(),
        )
        .await?;

    channel
        .queue_bind(
            "payment_failed".into(),
            "payment_dlx".into(),
            "failed".into(), // routing key
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;

    // Primary Queue with DLQ arguments
    let mut q_args = BTreeMap::new();
    q_args.insert(
        "x-dead-letter-exchange".into(),
        AMQPValue::LongString("payment_dlx".into()),
    );
    q_args.insert(
        "x-dead-letter-routing-key".into(),
        AMQPValue::LongString("failed".into()),
    );

    channel
        .queue_declare(
            "payment_processing".into(),
            QueueDeclareOptions::default(),
            FieldTable::from(q_args),
        )
        .await?;

    // Fanout Exchange for Notifications
    channel
        .exchange_declare(
            "booking_events_exchange".into(),
            ExchangeKind::Fanout,
            ExchangeDeclareOptions::default(),
            FieldTable::default(),
        )
        .await?;

    // 4. Consume
    let consumer = channel
        .basic_consume(
            "payment_processing".into(),
            "payment_worker_tag".into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    consumer::process_messages(consumer, db_pool, channel, seat_lock, redis_pool).await;

    Ok(())
}
