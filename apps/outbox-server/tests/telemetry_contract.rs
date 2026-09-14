//! Deployment contract for durable outbox publication.

#[test]
fn outbox_publisher_restores_and_injects_context() {
    let main = include_str!("../src/main.rs");
    let publisher = include_str!("../src/publisher.rs");

    assert!(main.contains("init_telemetry(\"bookit-outbox-server\")"));
    assert!(publisher.contains("bookit_telemetry::payload_carrier(&event.payload)"));
    assert!(publisher.contains("bookit_telemetry::in_result_span"));
    assert!(publisher.contains("rmq_conn::traced_properties(properties)"));
}
