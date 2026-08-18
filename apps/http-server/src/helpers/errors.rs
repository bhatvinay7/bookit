use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// Central application error type. All handlers return `Result<T, AppError>`.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),

    #[error("{0}")]
    Unauthorized(String),

    #[error("{0}")]
    Forbidden(String),

    #[error("{0}")]
    NotFound(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Too many requests: {0}")]
    TooManyRequests(String),

    #[error("Database error: {0}")]
    Database(#[from] diesel::result::Error),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            AppError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, m.clone()),
            AppError::Forbidden(m) => (StatusCode::FORBIDDEN, m.clone()),
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, m.clone()),
            AppError::Validation(m) => (StatusCode::UNPROCESSABLE_ENTITY, m.clone()),
            AppError::TooManyRequests(m) => (StatusCode::TOO_MANY_REQUESTS, m.clone()),
            AppError::Database(e) => {
                tracing::error!("Database error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "An unexpected internal error occurred. Please try again later.".to_string())
            },
            AppError::Internal(e) => {
                tracing::error!("Internal error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "An unexpected internal error occurred. Please try again later.".to_string())
            },
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

/// Convenience: pool connection error → AppError
pub fn db_err() -> AppError {
    AppError::Internal(anyhow::anyhow!("Failed to acquire DB connection"))
}

impl AppError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        AppError::BadRequest(msg.into())
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        AppError::NotFound(msg.into())
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        AppError::Internal(anyhow::anyhow!("{}", msg.into()))
    }
}

impl From<bson::ser::Error> for AppError {
    fn from(e: bson::ser::Error) -> Self {
        AppError::Internal(anyhow::anyhow!("BSON error: {e}"))
    }
}
