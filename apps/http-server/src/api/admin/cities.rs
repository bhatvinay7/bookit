use axum::{extract::State, Json};
use bson::doc;
use diesel::prelude::*;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use tracing::{error, info};

use crate::api::state::AppState;
use bookit_db::schema::schedules;

#[derive(Serialize)]
pub struct CityListResponse {
    pub cities: Vec<String>,
}

pub async fn list_distinct_cities(
    State(state): State<Arc<AppState>>,
) -> Result<Json<CityListResponse>, axum::http::StatusCode> {
    let mut city_set: HashSet<String> = HashSet::new();

    // 1. Get distinct cities from MongoDB (shows collection)
    let mongo_db = &state.mongo_client.database(&state.mongo_db_name);
    let coll = mongo_db.collection::<bson::Document>("shows");

    match coll.distinct("city", doc! {}).await {
        Ok(results) => {
            for r in results {
                if let bson::Bson::String(city) = r {
                    let city_trimmed = city.trim();
                    if !city_trimmed.is_empty() {
                        city_set.insert(city_trimmed.to_lowercase());
                    }
                }
            }
        }
        Err(e) => {
            error!("Failed to fetch distinct cities from MongoDB: {:?}", e);
            // We can continue to try fetching from postgres
        }
    }

    // 2. Get distinct venue_cities from Postgres (schedules table)
    let mut conn = match state.db_pool.get() {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to get DB connection for Postgres cities: {:?}", e);
            return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let pg_cities: Result<Vec<Option<String>>, diesel::result::Error> = schedules::table
        .select(schedules::venue_city)
        .distinct()
        .load::<Option<String>>(&mut conn);

    match pg_cities {
        Ok(cities) => {
            for city_opt in cities {
                if let Some(city) = city_opt {
                    let city_trimmed = city.trim();
                    if !city_trimmed.is_empty() {
                        city_set.insert(city_trimmed.to_lowercase());
                    }
                }
            }
        }
        Err(e) => {
            error!("Failed to fetch distinct cities from Postgres: {:?}", e);
        }
    }

    // Process and sort the final list (capitalize first letters)
    let mut sorted_cities: Vec<String> = city_set
        .into_iter()
        .map(|c| {
            // Title case formatting
            c.split_whitespace()
                .map(|word| {
                    let mut c = word.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    }
                })
                .collect::<Vec<String>>()
                .join(" ")
        })
        .collect();

    sorted_cities.sort();

    info!("Fetched {} distinct cities", sorted_cities.len());
    Ok(Json(CityListResponse {
        cities: sorted_cities,
    }))
}
