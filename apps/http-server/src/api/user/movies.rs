use axum::{
    extract::{Query, State},
    Json,
};
use bson::doc;
use futures::stream::StreamExt;
use serde::Deserialize;
use std::sync::Arc;

use crate::api::state::AppState;
use crate::helpers::AppError;
use crate::services::cache::{get_cached, set_cached};
use bookit_mongo::models::Show;
use bookit_redis::keys;

#[derive(Deserialize)]
pub struct ShowQuery {
    pub show_type: Option<String>,
    pub city: Option<String>,
}

pub async fn get_movies(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ShowQuery>,
) -> Result<Json<Vec<Show>>, AppError> {
    let mut cache_key = match &query.show_type {
        Some(st) => format!("{}:{}", keys::MOVIES_ALL, st),
        None => keys::MOVIES_ALL.to_string(),
    };

    if let Some(c) = &query.city {
        if c != "All" && !c.trim().is_empty() {
            cache_key = format!("{}:city:{}", cache_key, c.trim());
        }
    }

    // Cache hit
    if let Some(cached) = get_cached::<Vec<Show>>(&state, &cache_key) {
        return Ok(Json(cached));
    }

    let shows_collection = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    let mut filter = doc! {
        "deleted_at": null
    };

    if let Some(st) = &query.show_type {
        if st != "All" {
            filter.insert("show_type", st);
        }
    }

    if let Some(c) = &query.city {
        if c != "All" && !c.trim().is_empty() {
            filter.insert("city", c.trim());
        }
    }

    use diesel::prelude::*;
    use bookit_db::schema::schedules;

    let mut conn = state.db_pool.get().map_err(|e| AppError::internal(e.to_string()))?;
    
    // Fetch distinct mongo_show_ids that have an active schedule
    let active_show_ids: Vec<String> = schedules::table
        .select(schedules::mongo_show_id)
        .filter(schedules::start_time.gt(chrono::Utc::now()))
        .filter(schedules::deleted_at.is_null())
        .distinct()
        .load::<String>(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Convert strings to ObjectIds
    let object_ids: Vec<bson::oid::ObjectId> = active_show_ids
        .into_iter()
        .filter_map(|id| bson::oid::ObjectId::parse_str(&id).ok())
        .collect();

    if object_ids.is_empty() {
        return Ok(Json(vec![]));
    }

    filter.insert("_id", doc! { "$in": object_ids });

    let mut cursor = shows_collection
        .find(filter)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut movies = Vec::new();
    while let Some(result) = cursor.next().await {
        if let Ok(movie) = result {
            movies.push(movie);
        }
    }

    // Sort by created_at desc
    movies.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let _ = set_cached(&state, &cache_key, &movies, keys::TTL_MOVIES_ALL);
    Ok(Json(movies))
}

