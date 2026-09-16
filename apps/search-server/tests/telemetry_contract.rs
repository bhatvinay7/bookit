//! Deployment contract for HTTP/gRPC search and CDC processing.

#[test]
fn search_server_traces_every_ingress_path() {
    let main = include_str!("../src/main.rs");
    let grpc = include_str!("../src/grpc.rs");
    let stream = include_str!("../src/stream.rs");

    assert!(main.contains("init_telemetry(\"bookit-search-server\")"));
    assert!(main.contains("HttpTraceLayer"));
    assert!(grpc.contains("bookit_telemetry::grpc_request"));
    assert!(stream.contains("bookit_telemetry::payload_carrier"));
}
