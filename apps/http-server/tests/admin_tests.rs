mod common;

use axum::{
    body::Body,
    http::{header, Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

fn auth_header(token: &str) -> (header::HeaderName, String) {
    (header::AUTHORIZATION, format!("Bearer {}", token))
}

// ─── Admin Movie CRUD ─────────────────────────────────────────────────────────

#[tokio::test]
async fn test_add_movie_requires_admin() {
    let app = common::create_test_app().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/shows")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({ "title": "Test", "show_type": "Movie" })).unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    // No auth → 401
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_add_movie_success_with_cast() {
    let app = common::create_test_app().await;
    let (k, v) = auth_header(&common::admin_jwt());
    let title = format!("Movie {}", Uuid::new_v4());

    let res = app.clone().oneshot(Request::builder()
        .uri("/api/admin/shows").method("POST")
        .header(header::CONTENT_TYPE, "application/json")
        .header(k.clone(), v.clone())
        .body(Body::from(serde_json::to_vec(&json!({
            "show_type": "Movie",
            "title": title,
            "duration_minutes": 135,
            "director": "Test Director",
            "director_photo_url": "https://picsum.photos/200",
            "genre": ["Action"],
            "language": "English",
            "status": "comingSoon",
            "cast": [
                { "name": "Actor A", "photo_url": "https://picsum.photos/100", "role": "Lead" },
                { "name": "Actor B", "photo_url": "https://picsum.photos/101", "role": "Supporting" }
            ]
        })).unwrap())).unwrap()
    ).await.unwrap();

    let status = res.status();
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    if status != StatusCode::CREATED {
        println!("Error: {}", body);
    }
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body["title"], title);
    assert_eq!(body["cast"].as_array().unwrap().len(), 2);

    // Cleanup: hard-delete for tests (unless you have a soft-delete endpoint, delete_show usually hard deletes in mongo)
    let show_id = body["_id"].as_str().unwrap();
    let (k2, v2) = auth_header(&common::admin_jwt());
    app.oneshot(
        Request::builder()
            .uri(format!("/api/admin/shows/{}", show_id))
            .method("DELETE")
            .header(k2, v2)
            .body(Body::empty())
            .unwrap(),
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn test_list_shows_admin() {
    let app = common::create_test_app().await;
    let (k, v) = auth_header(&common::admin_jwt());

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/shows")
                .method("GET")
                .header(k, v)
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

#[tokio::test]
async fn test_delete_show() {
    let app = common::create_test_app().await;
    let (k, v) = auth_header(&common::admin_jwt());

    // Create a show to delete
    let create_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/admin/shows")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .header(k.clone(), v.clone())
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "show_type": "Movie",
                        "title": format!("DeleteMe {}", Uuid::new_v4()),
                        "duration_minutes": 90,
                        "director": "Director X",
                        "director_photo_url": "https://picsum.photos/200",
                        "cast": [{ "name": "A", "photo_url": "https://picsum.photos/50" }]
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let body: Value =
        serde_json::from_slice(&create_res.into_body().collect().await.unwrap().to_bytes())
            .unwrap();
    let id = body["_id"].as_str().unwrap();

    let (k2, v2) = auth_header(&common::admin_jwt());
    let del_res = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/admin/shows/{}", id))
                .method("DELETE")
                .header(k2, v2)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(del_res.status(), StatusCode::OK);
    let del_body: Value =
        serde_json::from_slice(&del_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(del_body["success"], true);
}
