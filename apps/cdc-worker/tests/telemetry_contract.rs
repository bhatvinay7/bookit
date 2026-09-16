//! Deployment contract: CDC events must create and carry a trace context.

#[test]
fn cdc_worker_initializes_and_propagates_telemetry() {
    let main = include_str!("../src/main.rs");
    let stream = include_str!("../src/stream.rs");

    assert!(main.contains("init_telemetry(\"bookit-cdc-worker\")"));
    assert!(stream.contains("\"mongodb.shows change\""));
    assert!(stream.contains("bookit_telemetry::current_carrier()"));
}
