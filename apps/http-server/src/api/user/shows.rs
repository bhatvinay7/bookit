use crate::services::cache::{get_async_cached, set_async_cached};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use bookit_redis::keys::{CACHE_DASHBOARD_GRID, CACHE_SHOWS, TTL_DASHBOARD_GRID, TTL_SHOWS};
use bson::oid::ObjectId;
use mongodb::options::FindOptions;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::state::AppState;
use crate::helpers::errors::AppError;
use bookit_mongo::models::Show;

pub async fn get_cities() -> Result<impl IntoResponse, AppError> {
    let cities = vec![
        "Mumbai",
        "Bengaluru",
        "Delhi-NCR",
        "Hyderabad",
        "Chennai",
        "Pune",
        "Kolkata",
        "Ahmedabad",
        "Chandigarh",
        "Kochi",
    ];
    Ok((StatusCode::OK, Json(cities)))
}

pub async fn get_show_details(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let oid =
        ObjectId::parse_str(&id).map_err(|_| AppError::bad_request("Invalid Show ID format"))?;

    let shows_collection = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    let show = shows_collection
        .find_one(bson::doc! { "_id": oid })
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    match show {
        Some(show) => Ok((StatusCode::OK, Json(show))),
        None => Err(AppError::not_found("Show not found")),
    }
}

pub async fn list_shows(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, AppError> {
    use futures::stream::StreamExt;

    if let Some(cached) = get_async_cached::<Vec<Show>>(&state, CACHE_SHOWS).await {
        return Ok((StatusCode::OK, Json(cached)));
    }

    let shows_collection = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    let mut cursor = shows_collection
        .find(bson::doc! { "deleted_at": null })
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut shows = Vec::new();
    while let Some(result) = cursor.next().await {
        match result {
            Ok(show) => shows.push(show),
            Err(e) => {
                println!("Error parsing show: {:?}", e);
            }
        }
    }

    // Sort by created_at desc
    shows.sort_by_key(|show| std::cmp::Reverse(show.created_at));

    set_async_cached(&state, CACHE_SHOWS, &shows, TTL_SHOWS).await;

    Ok((StatusCode::OK, Json(shows)))
}

#[derive(Deserialize)]
pub struct GridQuery {
    pub page: Option<u64>,
    pub limit: Option<u64>,
    pub city: Option<String>,
}

#[derive(Serialize)]
pub struct GridResponse {
    pub shows: Vec<Show>,
    pub has_more: bool,
}

pub async fn list_shows_grid(
    State(state): State<Arc<AppState>>,
    Query(q): Query<GridQuery>,
) -> Result<impl IntoResponse, AppError> {
    use futures::stream::StreamExt;

    let page = q.page.unwrap_or(1);
    let limit = q.limit.unwrap_or(30);

    let mut cache_key = CACHE_DASHBOARD_GRID.to_string();
    if let Some(c) = &q.city
        && c != "All"
        && !c.trim().is_empty()
    {
        cache_key = format!("{}:city:{}", cache_key, c.trim());
    }

    // Initial load cache check
    if page == 1
        && limit == 30
        && let Some(cached) = get_async_cached::<Vec<Show>>(&state, &cache_key).await
    {
        let res = GridResponse {
            shows: cached,
            has_more: true,
        };
        return Ok((StatusCode::OK, Json(res)));
    }

    let shows_collection = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    let skip = (page - 1) * limit;

    let find_options = FindOptions::builder()
        .sort(bson::doc! { "weight": -1, "next_start_time": 1 })
        .skip(skip)
        .limit(limit as i64)
        .build();

    let mut filter = bson::doc! { "deleted_at": null };
    if let Some(c) = &q.city
        && c != "All"
        && !c.trim().is_empty()
    {
        filter.insert("city", c.trim());
    }

    let mut cursor = shows_collection
        .find(filter)
        .with_options(find_options)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut shows = Vec::new();
    while let Some(result) = cursor.next().await {
        match result {
            Ok(show) => shows.push(show),
            Err(e) => println!("Error parsing show: {:?}", e),
        }
    }

    // Check if there are more
    let has_more = shows.len() as u64 == limit;

    // Cache the first page
    if page == 1 && limit == 30 {
        set_async_cached(&state, &cache_key, &shows, TTL_DASHBOARD_GRID).await;
    }

    Ok((StatusCode::OK, Json(GridResponse { shows, has_more })))
}
