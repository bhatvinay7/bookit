//! Deployment contract for the WebSocket handshake, messages, and gRPC calls.

#[test]
fn websocket_server_traces_handshake_messages_and_grpc() {
    let main = include_str!("../src/main.rs");
    let handlers = include_str!("../src/handlers.rs");
    let grpc = include_str!("../src/grpc_client.rs");

    assert!(main.contains("init_telemetry(\"bookit-ws-server\")"));
    assert!(main.contains("HttpTraceLayer"));
    assert!(handlers.contains("bookit_telemetry::operation_span(operation, \"server\", None)"));
    assert!(grpc.contains("bookit_telemetry::inject_grpc"));
}
