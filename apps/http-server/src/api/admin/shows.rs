use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use bson::{doc, oid::ObjectId};
use chrono::Utc;
use mongodb::Collection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::state::AppState;
use crate::helpers::errors::AppError;
use crate::services::cache::invalidate_async;
use bookit_mongo::models::{CreateShowRequest, Show, ShowType};
use bookit_redis::keys::{cache_schedules_active_key, cache_show_key};

fn shows_col(state: &AppState) -> Collection<Show> {
    state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection("shows")
}

// ─── List shows ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListShowsQuery {
    pub show_type: Option<String>,
    pub search: Option<String>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

#[derive(Serialize)]
pub struct ShowSummary {
    pub id: String,
    pub show_type: ShowType,
    pub title: String,
    pub status: String,
    pub poster_url: Option<String>,
    pub duration_minutes: Option<i32>,
    pub tags: Vec<String>,
}

pub async fn list_shows(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListShowsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let col = shows_col(&state);

    let mut filter = doc! { "deleted_at": { "$exists": false } };
    if let Some(st) = &q.show_type {
        filter.insert("show_type", st.as_str());
    }
    if let Some(s) = &q.search {
        filter.insert(
            "$or",
            bson::to_bson(&[
                doc! { "title":  { "$regex": s, "$options": "i" } },
                doc! { "tags":   { "$elemMatch": { "$regex": s, "$options": "i" } } },
            ])?,
        );
    }

    let limit = q.limit.unwrap_or(50).min(200) as i64;
    let skip = (q.page.unwrap_or(0)) * limit as u64;

    let opts = mongodb::options::FindOptions::builder()
        .limit(limit)
        .skip(skip)
        .sort(doc! { "created_at": -1 })
        .build();

    let mut cursor = col
        .find(filter)
        .with_options(opts)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut results: Vec<serde_json::Value> = vec![];
    while cursor
        .advance()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
    {
        let show = cursor
            .deserialize_current()
            .map_err(|e| AppError::internal(e.to_string()))?;
        let id = show.id.map(|o| o.to_hex()).unwrap_or_default();
        let mut val = serde_json::to_value(&show).unwrap();
        if let Some(obj) = val.as_object_mut() {
            obj.insert("id".to_string(), serde_json::json!(id));
            obj.remove("_id");
        }
        results.push(val);
    }

    Ok(Json(results))
}

// ─── Get show detail ──────────────────────────────────────────────────────────

pub async fn get_show(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::bad_request("Invalid show id"))?;

    let col = shows_col(&state);
    let show = col
        .find_one(doc! { "_id": oid })
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("Show not found"))?;

    let mut val = serde_json::to_value(&show).unwrap();
    if let Some(obj) = val.as_object_mut() {
        obj.insert("id".to_string(), serde_json::json!(id));
        obj.remove("_id");
    }
    Ok(Json(val))
}

// ─── Create show ──────────────────────────────────────────────────────────────

pub async fn create_show(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateShowRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("title is required"));
    }

    let mut show: Show = body.into();
    show.created_at = Some(Utc::now());

    let col = shows_col(&state);
    let result = col
        .insert_one(&show)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let inserted_id = result
        .inserted_id
        .as_object_id()
        .map(|o| o.to_hex())
        .unwrap_or_default();

    invalidate_async(&state, bookit_redis::keys::CACHE_SHOWS).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_DASHBOARD_GRID).await;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": inserted_id })),
    ))
}

// ─── Update show ──────────────────────────────────────────────────────────────

pub async fn update_show(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateShowRequest>,
) -> Result<impl IntoResponse, AppError> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::bad_request("Invalid show id"))?;

    let col = shows_col(&state);

    // Fetch existing to preserve created_at
    let existing = col
        .find_one(doc! { "_id": oid })
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("Show not found"))?;

    let mut show: Show = body.into();
    show.id = Some(oid);
    show.created_at = existing.created_at;

    col.replace_one(doc! { "_id": oid }, &show)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    invalidate_async(&state, &cache_show_key(&id)).await;
    invalidate_async(&state, &cache_schedules_active_key()).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_SHOWS).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_DASHBOARD_GRID).await;

    Ok(Json(serde_json::json!({ "updated": true })))
}

// ─── Soft delete show ─────────────────────────────────────────────────────────

pub async fn delete_show(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::bad_request("Invalid show id"))?;

    let col = shows_col(&state);
    col.update_one(
        doc! { "_id": oid },
        doc! { "$set": { "deleted_at": bson::DateTime::now() } },
    )
    .await
    .map_err(|e| AppError::internal(e.to_string()))?;

    invalidate_async(&state, &cache_show_key(&id)).await;
    invalidate_async(&state, &cache_schedules_active_key()).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_SHOWS).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_DASHBOARD_GRID).await;

    Ok(Json(serde_json::json!({ "deleted": true })))
}
