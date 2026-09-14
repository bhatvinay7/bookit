//! Deployment contract for the RabbitMQ locking consumer.

#[test]
fn lock_server_restores_delivery_trace_context() {
    let main = include_str!("../src/main_active.rs");
    let consumer = include_str!("../src/consumer_active.rs");

    assert!(main.contains("init_telemetry(\"bookit-lock-server\")"));
    assert!(consumer.contains("rmq_conn::delivery_span(&task.delivery, \"locking_queue\")"));
    assert!(consumer.contains("bookit_telemetry::in_span"));
}
