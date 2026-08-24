use crate::helpers::{
    AppError,
    jwt::{Claims, decode_token},
};
use axum::{
    async_trait, extract::FromRequestParts, http::header::AUTHORIZATION, http::request::Parts,
};

/// Extractor that validates the Bearer token and provides `Claims`.
pub struct AuthUser(pub Claims);

#[async_trait]
impl<S: Send + Sync> FromRequestParts<S> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("Authorization must use Bearer scheme".into()))?;

        let claims = decode_token(token)?;
        Ok(AuthUser(claims))
    }
}

/// Extractor that additionally validates the user is an Admin.
pub struct AdminUser(pub Claims);

#[async_trait]
impl<S: Send + Sync> FromRequestParts<S> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let AuthUser(claims) = AuthUser::from_request_parts(parts, state).await?;
        if claims.role != "Admin" {
            return Err(AppError::Forbidden("Admin access required".into()));
        }
        Ok(AdminUser(claims))
    }
}
