use outbox_server::{
    MAX_ATTEMPTS, parse_payment_message_ttl, retry_delay_seconds, routing::route_for,
    should_dead_letter,
};

#[test]
fn payment_events_route_to_existing_processor_queue() {
    assert_eq!(
        route_for("payment.requested").unwrap().routing_key,
        "payment_processing"
    );
    assert_eq!(
        route_for("payment.cancellation_requested")
            .unwrap()
            .routing_key,
        "payment_processing"
    );
}

#[test]
fn domain_events_route_to_booking_fanout() {
    assert_eq!(
        route_for("OrderCompleted").unwrap().exchange,
        "booking_events_exchange"
    );
    assert!(route_for("unknown").is_none());
}

#[test]
fn retry_backoff_is_bounded() {
    assert_eq!(retry_delay_seconds(1), 2);
    assert_eq!(retry_delay_seconds(3), 8);
    assert_eq!(retry_delay_seconds(99), 256);
}

#[test]
fn transient_broker_failures_never_exhaust_the_durable_outbox() {
    assert!(!should_dead_letter(MAX_ATTEMPTS, false));
    assert!(!should_dead_letter(MAX_ATTEMPTS * 100, false));
}

#[test]
fn permanent_event_errors_are_eventually_dead_lettered() {
    assert!(!should_dead_letter(MAX_ATTEMPTS - 1, true));
    assert!(should_dead_letter(MAX_ATTEMPTS, true));
}

#[test]
fn payment_ttl_has_a_safe_default() {
    assert_eq!(parse_payment_message_ttl(None), 300_000);
    assert_eq!(parse_payment_message_ttl(Some("999")), 300_000);
    assert_eq!(parse_payment_message_ttl(Some("60000")), 60_000);
}
