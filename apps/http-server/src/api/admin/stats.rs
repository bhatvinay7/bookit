use axum::{Json, extract::State};
use bigdecimal::BigDecimal;
use bson::doc;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use bookit_db::models::SeatStatus;
use bookit_db::schema::{
    bookings::dsl as bk, schedule_seats::dsl as ss, schedules::dsl as sc, users::dsl as us,
};
use bookit_mongo::models::Show;

use crate::api::state::AppState;
use crate::helpers::{AppError, db_err};
use crate::middleware::auth::AdminUser;
use crate::services::cache::{get_async_cached, set_async_cached};
use bookit_redis::keys;

#[derive(Serialize, Deserialize)]
pub struct StatsResponse {
    pub total_users: i64,
    pub total_shows: u64,
    pub total_bookings: i64,
    pub total_revenue: f64,
    pub total_schedules: i64,
    pub available_seats: i64,
}

pub async fn get_stats(
    _admin: AdminUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<StatsResponse>, AppError> {
    if let Some(cached) = get_async_cached::<StatsResponse>(&state, keys::ADMIN_STATS).await {
        return Ok(Json(cached));
    }

    // These aggregates use Diesel's synchronous PostgreSQL connection. Run
    // them on a blocking worker so a cache miss cannot stall unrelated async
    // admin requests waiting for HTTP-server to respond.
    let db_pool = state.db_pool.clone();
    let (total_users, total_bookings, total_schedules, total_revenue, available_seats) =
        tokio::task::spawn_blocking(move || -> Result<_, AppError> {
            let mut conn = db_pool.get().map_err(|_| db_err())?;

            let total_users = us::users.count().get_result::<i64>(&mut conn).unwrap_or(0);
            let total_bookings = bk::bookings
                .count()
                .get_result::<i64>(&mut conn)
                .unwrap_or(0);
            let total_schedules = sc::schedules
                .filter(bookit_db::schema::schedules::deleted_at.is_null())
                .count()
                .get_result::<i64>(&mut conn)
                .unwrap_or(0);

            let revenue: Option<BigDecimal> = bk::bookings
                .select(diesel::dsl::sum(bookit_db::schema::bookings::total_amount))
                .first(&mut conn)
                .unwrap_or(None);
            let total_revenue = revenue
                .map(|b| bigdecimal::ToPrimitive::to_f64(&b).unwrap_or(0.0))
                .unwrap_or(0.0);

            let available_seats = ss::schedule_seats
                .filter(bookit_db::schema::schedule_seats::status.eq(SeatStatus::Available))
                .count()
                .get_result::<i64>(&mut conn)
                .unwrap_or(0);

            Ok((
                total_users,
                total_bookings,
                total_schedules,
                total_revenue,
                available_seats,
            ))
        })
        .await
        .map_err(|e| AppError::internal(format!("Stats query task failed: {e}")))??;

    let col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");
    let total_shows = col
        .count_documents(doc! { "deleted_at": { "$exists": false } })
        .await
        .unwrap_or(0);

    let stats = StatsResponse {
        total_users,
        total_shows,
        total_bookings,
        total_revenue,
        total_schedules,
        available_seats,
    };

    set_async_cached(&state, keys::ADMIN_STATS, &stats, keys::TTL_ADMIN_STATS).await;
    Ok(Json(stats))
}
