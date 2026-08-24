use crate::api::state::AppState;
use crate::helpers::AppError;
use crate::services::r2::upload_from_multipart;
use axum::{
    Json,
    extract::{Multipart, State},
};
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
pub struct UploadResponse {
    pub url: String,
    pub key: String,
}

pub async fn upload_file(
    State(_state): State<Arc<AppState>>,
    multipart: Multipart,
) -> Result<Json<UploadResponse>, AppError> {
    let result = upload_from_multipart(multipart).await?;
    Ok(Json(UploadResponse {
        url: result.url,
        key: result.key,
    }))
}
