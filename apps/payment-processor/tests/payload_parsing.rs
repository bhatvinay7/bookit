use payment_processor::consumer::parse_seat_ids;
use serde_json::json;

#[test]
fn parses_multiple_seats_and_legacy_single_seat() {
    assert_eq!(parse_seat_ids(&json!({"seat_ids": [1, 2]})), vec![1, 2]);
    assert_eq!(parse_seat_ids(&json!({"seat_id": 9})), vec![9]);
}

#[test]
fn invalid_payload_has_no_seats() {
    assert!(parse_seat_ids(&json!({"seat_ids": ["bad"]})).is_empty());
}
