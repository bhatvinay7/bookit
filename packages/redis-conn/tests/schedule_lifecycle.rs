use redis_conn::adapter::PubSubEvent;

#[test]
fn schedule_lifecycle_events_round_trip_through_json() {
    let event = PubSubEvent::ScheduleClosed { schedule_id: 42 };
    let encoded = serde_json::to_string(&event).unwrap();
    let decoded: PubSubEvent = serde_json::from_str(&encoded).unwrap();

    assert!(matches!(
        decoded,
        PubSubEvent::ScheduleClosed { schedule_id: 42 }
    ));
}
