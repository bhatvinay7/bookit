mod common;

use axum::{
    body::Body,
    http::{header, Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn auth_header(token: &str) -> (header::HeaderName, String) {
    (header::AUTHORIZATION, format!("Bearer {}", token))
}

#[tokio::test]
async fn test_create_movie_show_success() {
    let app = common::create_test_app().await;
    let (k, v) = auth_header(&common::admin_jwt());

    let payload = json!({
        "show_type": "Movie",
        "title": "Inception",
        "description": "A mind-bending thriller",
        "tags": ["sci-fi", "thriller"],
        "poster_url": "https://example.com/inception.jpg",
        "status": "comingSoon",
        "director": "Christopher Nolan",
        "cast": [
            { "name": "Leonardo DiCaprio", "photo_url": "https://example.com/leo.jpg", "role": "Cobb" }
        ]
    });

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/shows")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .header(k, v)
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::CREATED);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body["_id"].is_string());
    assert_eq!(body["title"], "Inception");
}

#[tokio::test]
async fn test_create_concert_show_success() {
    let app = common::create_test_app().await;
    let (k, v) = auth_header(&common::admin_jwt());

    let payload = json!({
        "show_type": "Concert",
        "title": "Live Aid 2026",
        "tags": ["live", "music"],
        "status": "comingSoon",
        "host": "Famous Host",
        "performers": [
            { "name": "The Band", "photo_url": "https://example.com/band.jpg", "role": "Vocals/Guitar" }
        ]
    });

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/shows")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .header(k.clone(), v.clone())
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn test_create_seat_layout_success() {
    let app = common::create_test_app().await;
    let (k, v) = auth_header(&common::admin_jwt());

    let layout_name = format!(
        "Standard Theater Layout {}",
        chrono::Utc::now().timestamp_millis()
    );
    let payload = json!({
        "name": layout_name,
        "show_type": "Movie",
        "description": "A 2-row test layout"
    });

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/layouts")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .header(k, v)
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::CREATED);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body["id"].is_number());
    assert_eq!(body["name"], layout_name);
}

#[tokio::test]
async fn test_create_schedule_fails_missing_mongo_id() {
    let app = common::create_test_app().await;
    let (k, v) = auth_header(&common::admin_jwt());

    let payload = json!({
        "mongo_show_id": "invalid_id", // Invalid ObjectId format
        "show_type": "Movie",
        "layout_id": 9999,
        "date": "2026-12-01",
        "slot": "Evening",
        "end_time": "2026-12-01T22:00:00Z",
        "booking_open_at": "2026-11-25T10:00:00Z",
        "prices": {
            "Standard": "150.00",
            "Premium": "250.00"
        }
    });

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/schedules")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .header(k, v)
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Since the mongo_show_id is invalid (not 24 hex chars), it should fail validation or mongo parsing
    assert_ne!(res.status(), StatusCode::CREATED);
}
