mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn test_get_shows_public() {
    let app = common::create_test_app().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/user/shows")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body.is_array(), "Response should be a JSON array");
    // Every show must have a title
    for m in body.as_array().unwrap() {
        assert!(m["title"].is_string());
    }
}

#[tokio::test]
async fn test_get_schedules_for_nonexistent_show() {
    let app = common::create_test_app().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/user/schedules_v2/show/507f1f77bcf86cd799439011")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return OK with an empty array, not 404
    assert_eq!(res.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body.is_array());
}

#[tokio::test]
async fn test_schedule_response_has_countdown() {
    // This test requires at least one showtime in the DB.
    // If there are no showtimes, it's a no-op pass.
    let app = common::create_test_app().await;

    // Get show list first
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/user/shows")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let shows: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();

    if let Some(first) = shows.as_array().and_then(|a| a.first()) {
        let mid = first["_id"].as_str().unwrap();
        let res2 = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/user/schedules_v2/show/{}", mid))
                    .method("GET")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(res2.status(), StatusCode::OK);
        let schedules: Value =
            serde_json::from_slice(&res2.into_body().collect().await.unwrap().to_bytes()).unwrap();

        if let Some(st) = schedules.as_array().and_then(|a| a.first()) {
            // Countdown fields must exist
            assert!(
                st["seconds_until_booking_open"].is_number(),
                "Missing seconds_until_booking_open"
            );
            assert!(st["booking_open"].is_boolean(), "Missing booking_open");
        }
    }
}

#[tokio::test]
async fn test_ticket_not_found() {
    let app = common::create_test_app().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/user/tickets/999999")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_user_tickets_list() {
    let app = common::create_test_app().await;
    // user_id=999999 → no bookings → empty array OK
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/user/999999/tickets")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body.is_array());
}
