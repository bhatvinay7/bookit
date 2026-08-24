use axum::{Json, extract::State, response::IntoResponse};
use bson::{Bson, doc, oid::ObjectId};
use chrono::Utc;
use futures::StreamExt;
use mongodb::Collection;
use std::sync::Arc;

use crate::api::state::AppState;
use crate::helpers::errors::AppError;
use crate::services::cache;
use bookit_mongo::models::{Category, Show};

/// Redis key for the public categories list (active shows only, 24h TTL).
const CACHE_KEY: &str = "categories:public:all";
const TTL_24H: u64 = 60 * 60 * 24;

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
    if let Some(cached) = cache::get_async_cached::<Vec<Category>>(&state, CACHE_KEY).await {
        return Ok(Json(cached));
    }

    // ── Cache miss: query Mongo ──────────────────────────────────────────────
    let shows = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    // Categories are only public when at least one non-deleted show using them
    // starts now or in the future. Categories themselves do not carry dates.
    let category_ids = shows
        .distinct(
            "category_ids",
            doc! {
                "deleted_at": Bson::Null,
                "next_start_time": { "$gte": Utc::now().to_rfc3339() },
            },
        )
        .await
        .map_err(|e| AppError::internal(&format!("DB Error: {}", e)))?
        .into_iter()
        .filter_map(|value| match value {
            Bson::String(id) => ObjectId::parse_str(id).ok(),
            _ => None,
        })
        .collect::<Vec<_>>();

    if category_ids.is_empty() {
        return Ok(Json(Vec::<Category>::new()));
    }

    let col = categories_col(&state);

    // Sort alphabetically by name
    let sort = doc! { "name": 1 };

    let mut cursor = col
        .find(doc! { "_id": { "$in": category_ids } })
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
    cache::set_async_cached(&state, CACHE_KEY, &categories, TTL_24H).await;

    Ok(Json(categories))
}
