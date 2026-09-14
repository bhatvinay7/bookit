//! Deployment contract for payment consumption and notification handoff.

#[test]
fn payment_processor_preserves_delivery_context() {
    let main = include_str!("../src/main.rs");
    let consumer = include_str!("../src/consumer.rs");
    let repository = include_str!("../src/repository.rs");
    let payment = include_str!("../src/payment.rs");

    assert!(main.contains("init_telemetry(\"bookit-payment-processor\")"));
    assert!(consumer.contains("rmq_conn::delivery_span(&delivery, \"payment_processing\")"));
    assert!(repository.contains("\"_trace_context\": bookit_telemetry::current_carrier()"));
    assert!(payment.contains("otel.name = \"razorpay refund\""));
}
