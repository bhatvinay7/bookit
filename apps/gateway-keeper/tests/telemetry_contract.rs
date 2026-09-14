//! Deployment contract for gateway HTTP, gRPC, and RabbitMQ propagation.

#[test]
fn gateway_keeps_all_trace_boundaries_instrumented() {
    let main = include_str!("../src/main.rs");
    let grpc = include_str!("../src/grpc_service.rs");
    let proxy = include_str!("../src/proxy.rs");
    let state = include_str!("../src/state_active.rs");

    assert!(main.contains("init_telemetry(\"bookit-gateway-keeper\")"));
    assert!(main.contains("HttpTraceLayer"));
    assert!(grpc.contains("bookit_telemetry::grpc_request"));
    assert!(proxy.contains("bookit_telemetry::inject_headers"));
    assert!(proxy.contains("bookit_telemetry::inject_grpc"));
    assert!(state.contains("rmq_conn::traced_properties"));
}
