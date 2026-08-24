use crate::helpers::AppError;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String, // user id as string
    pub email: String,
    pub role: String,
    pub exp: usize,
}

pub fn decode_token(token: &str) -> Result<Claims, AppError> {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "secret".into());
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map(|d| d.claims)
    .map_err(|e| AppError::Unauthorized(format!("Invalid token: {}", e)))
}

pub fn user_id_from_claims(claims: &Claims) -> Result<i32, AppError> {
    claims
        .sub
        .parse::<i32>()
        .map_err(|_| AppError::Internal(anyhow::anyhow!("Malformed token subject")))
}
