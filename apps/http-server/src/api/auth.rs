use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use bookit_db::schema::users::dsl::{email as email_col, users};
use bookit_db::{
    insertables::NewUser,
    models::{User, UserRole},
};
use diesel::prelude::*;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::state::AppState;
use crate::helpers::AppError;
use crate::api::admin::password_reset;

#[derive(Deserialize)]
pub struct SignupRequest {
    pub email: String,
    pub password: String,
    pub role: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserPublic,
}

/// Public-safe user shape (no password_hash)
#[derive(Serialize)]
pub struct UserPublic {
    pub id: i32,
    pub email: String,
    pub role: String,
}

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user id
    pub email: String,
    pub role: String,
    pub exp: usize,
}

pub fn auth_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/signup", post(signup))
        .route("/login", post(login))
        .route("/me", get(me))
        // ── Admin password reset (no auth required — pre-login flow) ──────────
        .route("/admin/reset-request", post(password_reset::reset_request))
        .route("/admin/reset-confirm", post(password_reset::reset_confirm))
        .with_state(state)
}

fn err(code: StatusCode, message: &str) -> (StatusCode, Json<serde_json::Value>) {
    (code, Json(serde_json::json!({ "error": message })))
}

async fn signup(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SignupRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<serde_json::Value>)> {
    if payload.email.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Email address is required."));
    }
    if !payload.email.contains('@') {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Please enter a valid email address.",
        ));
    }
    
    if payload.password.len() < 6 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Password must be at least 6 characters.",
        ));
    }

    let mut conn = state.db_pool.get().map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database connection failed.",
        )
    })?;

    if users
        .filter(email_col.eq(&payload.email))
        .first::<User>(&mut conn)
        .is_ok()
    {
        return Err(err(
            StatusCode::CONFLICT,
            "An account with this email already exists.",
        ));
    }

    let hashed = hash(&payload.password, DEFAULT_COST).map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to process password.",
        )
    })?;

    let user_role = match payload.role.as_deref() {
        Some("admin") => UserRole::Admin,
        _ => UserRole::User,
    };

    let user = diesel::insert_into(users)
        .values(&NewUser {
            email: payload.email.clone(),
            password_hash: hashed,
            role: user_role,
        })
        .returning(User::as_returning())
        .get_result(&mut conn)
        .map_err(|_| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create account.",
            )
        })?;

    let token = create_jwt(user.id, &user.email, &user.role, &state.jwt_secret).map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Account created but token failed.",
        )
    })?;

    Ok(Json(AuthResponse {
        token,
        user: to_public(&user),
    }))
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<serde_json::Value>)> {
    if payload.email.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Email address is required."));
    }
    if payload.password.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Password is required."));
    }

    let mut conn = state.db_pool.get().map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database connection failed.",
        )
    })?;

    let user = users
        .filter(email_col.eq(&payload.email))
        .first::<User>(&mut conn)
        .map_err(|_| {
            err(
                StatusCode::UNAUTHORIZED,
                "No account found with that email.",
            )
        })?;

    let valid = verify(&payload.password, &user.password_hash).map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to verify password.",
        )
    })?;

    if !valid {
        return Err(err(StatusCode::UNAUTHORIZED, "Incorrect password."));
    }

    let token = create_jwt(user.id, &user.email, &user.role, &state.jwt_secret).map_err(|_| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Login succeeded but token failed.",
        )
    })?;

    Ok(Json(AuthResponse {
        token,
        user: to_public(&user),
    }))
}

async fn me(
    State(_state): State<Arc<AppState>>,
    auth: crate::middleware::auth::AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({
        "id": auth.0.sub,
        "email": auth.0.email,
        "role": auth.0.role,
    })))
}

fn to_public(u: &User) -> UserPublic {
    UserPublic {
        id: u.id,
        email: u.email.clone(),
        role: format!("{:?}", u.role),
    }
}

fn create_jwt(
    user_id: i32,
    user_email: &str,
    user_role: &UserRole,
    secret: &str,
) -> Result<String, ()> {
    let role_str = match user_role {
        UserRole::Admin => "Admin",
        UserRole::User => "User",
    };
    let exp = (chrono::Utc::now() + chrono::Duration::days(7)).timestamp() as usize;
    encode(
        &Header::default(),
        &Claims {
            sub: user_id.to_string(),
            email: user_email.to_string(),
            role: role_str.into(),
            exp,
        },
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| ())
}
