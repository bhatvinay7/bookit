use ws_server::locking::RoomSeatSnapshot;

#[test]
fn room_seat_snapshot_uses_status_and_owner() {
    let snapshot = RoomSeatSnapshot {
        seat_id: 12,
        status: "LOCKED".to_string(),
        user_id: Some(42),
    };

    assert_eq!(snapshot.seat_id, 12);
    assert_eq!(snapshot.status, "LOCKED");
    assert_eq!(snapshot.user_id, Some(42));
}
