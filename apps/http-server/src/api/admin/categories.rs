use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use bson::{doc, oid::ObjectId};
use chrono::Utc;
use futures::StreamExt;
use mongodb::Collection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::state::AppState;
use crate::helpers::errors::AppError;
use crate::services::cache;
use bookit_mongo::models::Category;

/// Cache keys to bust whenever categories change.
/// Bust both public + admin lists so neither serves stale data.
const CACHE_KEY_PUBLIC: &str = "categories:public:all";
const CACHE_KEY_ADMIN: &str = "categories:admin:all";

fn categories_col(state: &AppState) -> Collection<Category> {
    state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection("categories")
}

// ─── List categories ─────────────────────────────────────────────────────────

pub async fn list_categories(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    // ── Cache hit ────────────────────────────────────────────────────────────
    if let Some(cached) = cache::get_async_cached::<Vec<Category>>(&state, CACHE_KEY_ADMIN).await {
        return Ok(Json(cached));
    }

    // ── Cache miss: query Mongo ──────────────────────────────────────────────
    let col = categories_col(&state);

    // Sort alphabetically by name
    let sort = doc! { "name": 1 };

    let mut cursor = col
        .find(doc! {})
        .sort(sort)
        .await
        .map_err(|e| AppError::internal(&format!("DB Error: {}", e)))?;

    let mut categories = Vec::new();
    while let Some(doc) = cursor.next().await {
        if let Ok(c) = doc {
            categories.push(c);
        }
    }

    // ── Populate cache (24 h TTL) ────────────────────────────────────────────
    cache::set_async_cached(&state, CACHE_KEY_ADMIN, &categories, 60 * 60 * 24).await;

    Ok(Json(categories))
}

// ─── Create category ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct CreateCategoryRequest {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
}

pub async fn create_category(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateCategoryRequest>,
) -> Result<impl IntoResponse, AppError> {
    let col = categories_col(&state);

    let new_cat = Category {
        id: None, // Mongo will auto-generate
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        image_url: payload.image_url,
        created_at: Some(Utc::now()),
        updated_at: Some(Utc::now()),
    };

    let res = col
        .insert_one(&new_cat)
        .await
        .map_err(|e| AppError::internal(&format!("Failed to insert category: {}", e)))?;

    let inserted_id = res
        .inserted_id
        .as_object_id()
        .ok_or_else(|| AppError::internal("Missing returned ObjectId"))?;

    let mut created = new_cat;
    created.id = Some(inserted_id);

    // Bust cache so next GET reflects the new category.
    bust_cache(&state).await;

    Ok((StatusCode::CREATED, Json(created)))
}

/// Helper: invalidate all category cache keys (fire-and-forget).
async fn bust_cache(state: &Arc<AppState>) {
    cache::invalidate_async(state, CACHE_KEY_PUBLIC).await;
    cache::invalidate_async(state, CACHE_KEY_ADMIN).await;
}

// ─── Get category ────────────────────────────────────────────────────────────

pub async fn get_category(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let col = categories_col(&state);

    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::bad_request("Invalid Category ID format"))?;

    let cat = col
        .find_one(doc! { "_id": oid })
        .await
        .map_err(|_| AppError::internal("DB Error"))?;

    match cat {
        Some(c) => Ok(Json(c)),
        None => Err(AppError::not_found("Category not found")),
    }
}

// ─── Update category ─────────────────────────────────────────────────────────

pub async fn update_category(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<CreateCategoryRequest>,
) -> Result<impl IntoResponse, AppError> {
    let col = categories_col(&state);

    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::bad_request("Invalid Category ID format"))?;

    // Better to use typed struct for update
    let update_doc = doc! {
        "$set": bson::to_document(&payload).unwrap(),
        "$currentDate": { "updated_at": true }
    };

    let res = col
        .update_one(doc! { "_id": oid }, update_doc)
        .await
        .map_err(|e| AppError::internal(&format!("Failed to update category: {}", e)))?;

    if res.matched_count == 0 {
        return Err(AppError::not_found("Category not found"));
    }

    // Bust cache so next GET reflects the updated category.
    bust_cache(&state).await;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Delete category ─────────────────────────────────────────────────────────

pub async fn delete_category(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let col = categories_col(&state);

    let oid = ObjectId::parse_str(&id)
        .map_err(|_| AppError::bad_request("Invalid Category ID format"))?;

    let res = col
        .delete_one(doc! { "_id": oid })
        .await
        .map_err(|e| AppError::internal(&format!("DB Error: {}", e)))?;

    if res.deleted_count == 0 {
        return Err(AppError::not_found("Category not found"));
    }

    // TODO: Maybe remove this category_id from all Shows?

    // Bust cache so next GET no longer returns the deleted category.
    bust_cache(&state).await;

    Ok(StatusCode::NO_CONTENT)
}
