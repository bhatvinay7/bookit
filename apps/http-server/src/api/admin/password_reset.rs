use axum::{Json, extract::State, http::StatusCode};
use bcrypt::{DEFAULT_COST, hash};
use bookit_db::models::{User, UserRole};
use bookit_db::schema::users::dsl::{email as email_col, password_hash as pw_col, users};
use diesel::prelude::*;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::state::AppState;

/// 15-minute TTL for password-reset tokens.
const RESET_TTL_SECS: u64 = 60 * 15;

fn reset_key(email: &str) -> String {
    format!("admin:pwd_reset:{}", email)
}

fn err(code: StatusCode, msg: &str) -> (StatusCode, Json<serde_json::Value>) {
    (code, Json(serde_json::json!({ "error": msg })))
}

// ─── Request: generate a one-time token and store it in Redis ─────────────────

#[derive(Deserialize)]
pub struct ResetRequestPayload {
    pub email: String,
}

#[derive(Serialize)]
pub struct ResetRequestResponse {
    pub message: String,
    /// Included for development / demo.  In production, omit this and email it.
    pub reset_token: String,
}

pub async fn reset_request(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ResetRequestPayload>,
) -> Result<Json<ResetRequestResponse>, (StatusCode, Json<serde_json::Value>)> {
    if payload.email.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Email is required."));
    }

    let mut conn = state.db_pool.get().map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database connection failed.",
        )
    })?;

    // Only generate a token if the user exists AND is an Admin
    let user = users
        .filter(email_col.eq(&payload.email))
        .first::<User>(&mut conn)
        .map_err(|_| {
            err(
                StatusCode::NOT_FOUND,
                "No admin account found with that email.",
            )
        })?;

    if user.role != UserRole::Admin {
        // Return the same message to avoid leaking which accounts are admins
        return Err(err(
            StatusCode::FORBIDDEN,
            "No admin account found with that email.",
        ));
    }

    // Generate a cryptographically random token via UUID v4 (already in deps)
    let token = uuid::Uuid::new_v4().simple().to_string();

    // Store in Redis with TTL
    let key = reset_key(&payload.email);
    let mut redis = state.redis_manager.clone();
    redis
        .set_ex::<_, _, ()>(&key, &token, RESET_TTL_SECS)
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Cache error."))?;

    eprintln!(
        "[ADMIN PASSWORD RESET] email={} token={} (valid {} min)",
        payload.email,
        token,
        RESET_TTL_SECS / 60
    );

    Ok(Json(ResetRequestResponse {
        message: format!(
            "Reset token generated. It expires in {} minutes.",
            RESET_TTL_SECS / 60
        ),
        reset_token: token,
    }))
}

// ─── Confirm: validate token, update password, delete token from Redis ────────

#[derive(Deserialize)]
pub struct ResetConfirmPayload {
    pub email: String,
    pub token: String,
    pub new_password: String,
}

pub async fn reset_confirm(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ResetConfirmPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if payload.new_password.len() < 8 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Password must be at least 8 characters.",
        ));
    }

    // Look up the token in Redis
    let key = reset_key(&payload.email);
    let mut redis = state.redis_manager.clone();
    let stored: Option<String> = redis
        .get(&key)
        .await
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Cache error."))?;

    let stored_token = stored.ok_or_else(|| {
        err(
            StatusCode::GONE,
            "Reset token not found or has expired. Please request a new one.",
        )
    })?;

    if stored_token != payload.token {
        return Err(err(StatusCode::UNAUTHORIZED, "Invalid reset token."));
    }

    // Hash the new password
    let hashed = hash(&payload.new_password, DEFAULT_COST).map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to hash password.",
        )
    })?;

    // Update the user's password in Postgres
    let mut conn = state.db_pool.get().map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database connection failed.",
        )
    })?;

    let updated = diesel::update(users.filter(email_col.eq(&payload.email)))
        .set(pw_col.eq(&hashed))
        .execute(&mut conn)
        .map_err(|_| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to update password.",
            )
        })?;

    if updated == 0 {
        return Err(err(StatusCode::NOT_FOUND, "User not found."));
    }

    // Invalidate the token immediately (single-use)
    let _: Result<(), _> = redis.del(&key).await;

    Ok(Json(
        serde_json::json!({ "message": "Password reset successfully." }),
    ))
}
