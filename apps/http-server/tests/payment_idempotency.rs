use http_server::api::user::payments::same_payment_intent;

#[test]
fn idempotent_retry_accepts_same_seats_in_different_order() {
    assert!(same_payment_intent(7, &[3, 1, 2], 7, &[1, 2, 3]));
}

#[test]
fn idempotency_key_cannot_be_reused_for_another_purchase() {
    assert!(!same_payment_intent(7, &[1, 2], 8, &[1, 2]));
    assert!(!same_payment_intent(7, &[1, 2], 7, &[1, 3]));
}
