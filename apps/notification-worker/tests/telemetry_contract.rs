//! Deployment contract for notification delivery and external client spans.

#[test]
fn notification_worker_traces_delivery_pdf_and_email() {
    let main = include_str!("../src/main.rs");
    let consumer = include_str!("../src/consumer.rs");
    let email = include_str!("../src/email.rs");

    assert!(main.contains("init_telemetry(\"bookit-notification-worker\")"));
    assert!(consumer.contains("rmq_conn::delivery_span(&delivery, \"notification_queue\")"));
    assert!(consumer.contains("otel.name = \"ticket PDF generate\""));
    assert!(email.contains("otel.name = \"smtp send\""));
}
