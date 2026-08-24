mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

// ─── Auth Tests ────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_signup_success() {
    let app = common::create_test_app().await;
    let email = format!("test_{}@bookit.test", Uuid::new_v4());

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/signup")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "email": email, "password": "password123"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body["token"].is_string(), "Should return a JWT token");
    assert_eq!(body["user"]["email"], email);
}

#[tokio::test]
async fn test_signup_duplicate_email() {
    let app = common::create_test_app().await;
    let email = format!("dup_{}@bookit.test", Uuid::new_v4());

    // First signup
    app.clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/signup")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({ "email": email, "password": "pass123" })).unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Duplicate should fail
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/signup")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({ "email": email, "password": "pass123" })).unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::CONFLICT);
}

#[tokio::test]
async fn test_signup_short_password() {
    let app = common::create_test_app().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/signup")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "email": "valid@test.com", "password": "abc"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body["error"].as_str().unwrap().contains("6 characters"));
}

#[tokio::test]
async fn test_login_wrong_password() {
    let app = common::create_test_app().await;
    let email = format!("login_{}@bookit.test", Uuid::new_v4());

    // Create account first
    app.clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/signup")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({ "email": email, "password": "correct123" }))
                        .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Wrong password
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/login")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({ "email": email, "password": "wrongpass" }))
                        .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    let body: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body["error"].is_string());
}

#[tokio::test]
async fn test_login_unknown_email() {
    let app = common::create_test_app().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/login")
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "email": "nobody@nowhere.test", "password": "anypass"
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_me_requires_token() {
    let app = common::create_test_app().await;
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}
