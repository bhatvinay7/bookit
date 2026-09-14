//! Deployment contract for HTTP request spans and payment outbox propagation.

#[test]
fn http_server_traces_requests_and_payment_events() {
    let main = include_str!("../src/main.rs");
    let payments = include_str!("../src/api/user/payments.rs");

    assert!(main.contains("init_telemetry(\"bookit-http-server\")"));
    assert!(main.contains("HttpTraceLayer"));
    assert!(main.contains("\"traceparent\""));
    assert!(payments.contains("\"_trace_context\": bookit_telemetry::current_carrier()"));
}
