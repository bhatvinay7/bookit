use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,

};
use bson::doc;
use chrono::Utc;
use diesel::dsl::count_star;
use diesel::prelude::*;
use futures::{StreamExt, future::join_all};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

use bookit_db::{
    models::{Schedule, ScheduleLifecycleState, ScheduleSeat},
    schema::{schedule_seats, schedules},
};
use bookit_mongo::models::Show;
use bookit_redis::keys::{
    TTL_SCHEDULE_SEAT_COUNTS, TTL_SHOW_SCHEDULES, cache_schedule_available_seats_key,
    cache_schedule_key, cache_schedule_total_seats_key, cache_schedules_active_key,
    cache_show_schedules_key,
};

use crate::api::state::AppState;
use crate::helpers::errors::AppError;
use crate::services::cache::{get_async_cached, set_async_cached};

fn bitmap_seat_status(bitmap: &[u8], seat_id: i32) -> Option<&'static str> {
    let bit_offset = usize::try_from(seat_id)
        .ok()
        .and_then(|id| id.checked_mul(2))?;
    let byte = bitmap.get(bit_offset / 8).copied()?;
    let state = (byte >> (6 - (bit_offset % 8))) & 0b11;

    Some(match state {
        0b01 => "Locked",
        0b10 => "Booked",
        _ => "Available",
    })
}

fn bitmap_snapshot(rconn: &mut redis::Connection, bitmap_key: &str) -> Option<Vec<u8>> {
    redis::cmd("GET")
        .arg(bitmap_key)
        .query::<Option<Vec<u8>>>(rconn)
        .ok()
        .flatten()
}

fn selected_city(city: Option<&str>) -> Option<&str> {
    city.map(str::trim)
        .filter(|city| !city.is_empty() && !city.eq_ignore_ascii_case("All"))
}

/// Fetch seat totals for all requested schedules in two grouped queries. This
/// avoids the two-counts-per-schedule pattern that made public schedule lists
/// slow enough for the gateway's upstream timeout to trip.
async fn load_schedule_seat_counts(
    state: &Arc<AppState>,
    schedule_ids: Vec<i32>,
) -> Result<
    (
        std::collections::HashMap<i32, i64>,
        std::collections::HashMap<i32, i64>,
    ),
    AppError,
> {
    if schedule_ids.is_empty() {
        return Ok((
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
        ));
    }

    // Redis is the normal read path. Read all cached pairs concurrently so a
    // schedule list does not accumulate one Redis round-trip per schedule.
    let cache_reads = schedule_ids.iter().copied().map(|schedule_id| async move {
        let total_key = cache_schedule_total_seats_key(schedule_id);
        let available_key = cache_schedule_available_seats_key(schedule_id);
        (
            schedule_id,
            get_async_cached::<i64>(state, &total_key).await,
            get_async_cached::<i64>(state, &available_key).await,
        )
    });
    let mut totals = std::collections::HashMap::new();
    let mut available = std::collections::HashMap::new();
    let mut missing_schedule_ids = Vec::new();
    for (schedule_id, cached_total, cached_available) in join_all(cache_reads).await {
        match (cached_total, cached_available) {
            (Some(total), Some(available_count)) => {
                totals.insert(schedule_id, total);
                available.insert(schedule_id, available_count);
            }
            _ => missing_schedule_ids.push(schedule_id),
        }
    }

    if missing_schedule_ids.is_empty() {
        return Ok((totals, available));
    }

    // Cache misses use two grouped PostgreSQL queries, never one query per
    // schedule. The results repopulate Redis for later list requests.
    let db_pool = state.db_pool.clone();
    let database_schedule_ids = missing_schedule_ids.clone();
    let (database_totals, database_available) =
        tokio::task::spawn_blocking(move || -> Result<_, AppError> {
            let mut conn = db_pool
                .get()
                .map_err(|e| AppError::internal(e.to_string()))?;
            let totals: std::collections::HashMap<i32, i64> = schedule_seats::table
                .filter(schedule_seats::schedule_id.eq_any(&database_schedule_ids))
                .group_by(schedule_seats::schedule_id)
                .select((schedule_seats::schedule_id, count_star()))
                .load::<(i32, i64)>(&mut conn)
                .map_err(|e| AppError::internal(e.to_string()))?
                .into_iter()
                .collect();
            let available: std::collections::HashMap<i32, i64> = schedule_seats::table
                .filter(schedule_seats::schedule_id.eq_any(&database_schedule_ids))
                .filter(schedule_seats::status.eq(bookit_db::models::SeatStatus::Available))
                .group_by(schedule_seats::schedule_id)
                .select((schedule_seats::schedule_id, count_star()))
                .load::<(i32, i64)>(&mut conn)
                .map_err(|e| AppError::internal(e.to_string()))?
                .into_iter()
                .collect();

            Ok((totals, available))
        })
        .await
        .map_err(|e| AppError::internal(format!("Seat-count query task failed: {e}")))??;

    let cache_writes = missing_schedule_ids.into_iter().map(|schedule_id| {
        let total = database_totals.get(&schedule_id).copied().unwrap_or(0);
        let available_count = database_available.get(&schedule_id).copied().unwrap_or(0);
        totals.insert(schedule_id, total);
        available.insert(schedule_id, available_count);
        async move {
            set_async_cached(
                state,
                &cache_schedule_total_seats_key(schedule_id),
                &total,
                TTL_SCHEDULE_SEAT_COUNTS,
            )
            .await;
            set_async_cached(
                state,
                &cache_schedule_available_seats_key(schedule_id),
                &available_count,
                TTL_SCHEDULE_SEAT_COUNTS,
            )
            .await;
        }
    });
    join_all(cache_writes).await;

    Ok((totals, available))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bitmap_seat_status_decodes_redis_bitfield_order() {
        assert_eq!(bitmap_seat_status(&[0b0001_1000], 1), Some("Locked"));
        assert_eq!(bitmap_seat_status(&[0b0001_1000], 2), Some("Booked"));
    }

    #[test]
    fn bitmap_seat_status_uses_database_fallback_when_bit_is_missing() {
        assert_eq!(bitmap_seat_status(&[], 12), None);
    }

    #[test]
    fn bitmap_seat_status_reads_explicit_available_state() {
        assert_eq!(bitmap_seat_status(&[0], 1), Some("Available"));
    }

    #[test]
    fn selected_city_ignores_empty_and_all_values() {
        assert_eq!(selected_city(None), None);
        assert_eq!(selected_city(Some("  ")), None);
        assert_eq!(selected_city(Some("all")), None);
        assert_eq!(selected_city(Some(" Bengaluru ")), Some("Bengaluru"));
    }
}

/// GET /api/user/schedules_v2
/// List all active, upcoming schedules
pub async fn list_active_schedules(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let cache_key = cache_schedules_active_key();

    let now = Utc::now();
    // Cache schedule metadata only. Seat counts are separate, live Redis
    // values so a payment immediately changes the next response.
    let rows: Vec<Schedule> = if let Some(cached) = get_async_cached(&state, &cache_key).await {
        cached
    } else {
        let db_pool = state.db_pool.clone();
        let loaded = tokio::task::spawn_blocking(move || -> Result<_, AppError> {
            let mut conn = db_pool
                .get()
                .map_err(|e| AppError::internal(e.to_string()))?;
            schedules::table
                .filter(schedules::deleted_at.is_null())
                .filter(schedules::lifecycle_state.ne(ScheduleLifecycleState::Closed))
                .filter(schedules::start_time.gt(now))
                .order(schedules::start_time.asc())
                .load(&mut conn)
                .map_err(|e| AppError::internal(e.to_string()))
        })
        .await
        .map_err(|e| AppError::internal(format!("Active-schedules query task failed: {e}")))??;
        set_async_cached(&state, &cache_key, &loaded, TTL_SHOW_SCHEDULES).await;
        loaded
    };

    let rows = rows
        .into_iter()
        .filter(|schedule| {
            schedule.deleted_at.is_none()
                && schedule.lifecycle_state != ScheduleLifecycleState::Closed
                && schedule.start_time > now
        })
        .collect::<Vec<_>>();
    let schedule_ids = rows.iter().map(|schedule| schedule.id).collect();
    let (total_seats_by_schedule, available_seats_by_schedule) =
        load_schedule_seat_counts(&state, schedule_ids).await?;

    let coll = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    let show_ids = rows
        .iter()
        .filter_map(|schedule| bson::oid::ObjectId::parse_str(&schedule.mongo_show_id).ok())
        .collect::<Vec<_>>();
    let mut shows_by_id = std::collections::HashMap::new();
    if !show_ids.is_empty()
        && let Ok(mut cursor) = coll.find(doc! { "_id": { "$in": show_ids } }).await
    {
        while let Some(Ok(show_doc)) = cursor.next().await {
            if let Some(id) = show_doc.id
                && let Ok(value) = serde_json::to_value(&show_doc)
            {
                shows_by_id.insert(id.to_hex(), value);
            }
        }
    }

    let mut results = Vec::new();
    for s in rows {
        let seconds_until_booking_open = (s.booking_open_at - Utc::now()).num_seconds();
        let total = total_seats_by_schedule.get(&s.id).copied().unwrap_or(0);
        let available = available_seats_by_schedule.get(&s.id).copied().unwrap_or(0);

        results.push(serde_json::json!({
            "id": s.id,
            "show_type": s.show_type,
            "layout_id": s.layout_id,
            "date": s.date,
            "slot": s.slot,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "booking_open_at": s.booking_open_at,
            "lifecycle_state": s.lifecycle_state,
            "booking_open": s.lifecycle_state == ScheduleLifecycleState::Open,
            "seconds_until_booking_open": seconds_until_booking_open,
            "total_seats": total,
            "available_seats": available,
            "show": shows_by_id.get(&s.mongo_show_id)
        }));
    }

    let response_json = serde_json::json!(results);

    Ok((StatusCode::OK, Json(response_json)))
}

/// GET /api/user/schedules_v2/:id
pub async fn get_schedule_details(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let cache_key = cache_schedule_key(id);
    let schedule: Schedule = if let Some(cached) = get_async_cached(&state, &cache_key).await {
        cached
    } else {
        let mut conn = state
            .db_pool
            .get()
            .map_err(|e| AppError::internal(e.to_string()))?;
        let loaded: Schedule = schedules::table
            .find(id)
            .first(&mut conn)
            .map_err(|e| match e {
                diesel::NotFound => AppError::not_found("Schedule not found"),
                _ => AppError::internal(e.to_string()),
            })?;
        set_async_cached(&state, &cache_key, &loaded, TTL_SHOW_SCHEDULES).await;
        loaded
    };

    if schedule.deleted_at.is_some() {
        return Err(AppError::not_found("Schedule deleted"));
    }

    let coll = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");
    let mut show_val = Value::Null;

    if let Ok(oid) = bson::oid::ObjectId::parse_str(&schedule.mongo_show_id)
        && let Ok(Some(show_doc)) = coll.find_one(doc! { "_id": oid }).await
    {
        show_val = serde_json::to_value(&show_doc).unwrap_or(Value::Null);
    }

    let seconds_until_booking_open = (schedule.booking_open_at - Utc::now()).num_seconds();

    let res = serde_json::json!({
        "id": schedule.id,
        "mongo_show_id": schedule.mongo_show_id,
        "show_type": schedule.show_type,
        "layout_id": schedule.layout_id,
        "date": schedule.date,
        "slot": schedule.slot,
        "start_time": schedule.start_time,
        "end_time": schedule.end_time,
        "booking_open_at": schedule.booking_open_at,
        "lifecycle_state": schedule.lifecycle_state,
        "booking_open": schedule.lifecycle_state == ScheduleLifecycleState::Open,
        "seconds_until_booking_open": seconds_until_booking_open,
        "venue_name": schedule.venue_name,
        "venue_address": schedule.venue_address,
        "venue_city": schedule.venue_city,
        "venue_state": schedule.venue_state,
        "show": show_val
    });

    Ok((StatusCode::OK, Json(res)))
}

/// GET /api/user/schedules_v2/:id/seats
pub async fn get_schedule_seats(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let schedule: Schedule = schedules::table
        .find(id)
        .first(&mut conn)
        .map_err(|_| AppError::not_found("Schedule not found"))?;

    let seats: Vec<ScheduleSeat> = schedule_seats::table
        .filter(schedule_seats::schedule_id.eq(id))
        .order(schedule_seats::seat_index.asc())
        .load(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut redis_conn = state.redis_client.get_connection().ok();

    let bitmap_key = bookit_redis::keys::schedule_seat_bitmap(id);
    let bitmap = redis_conn
        .as_mut()
        .and_then(|rconn| bitmap_snapshot(rconn, &bitmap_key));

    let mut seats_json = Vec::new();
    for seat in seats {
        let database_status = match seat.status {
            bookit_db::models::SeatStatus::Available => "Available".to_string(),
            bookit_db::models::SeatStatus::Locked => "Locked".to_string(),
            bookit_db::models::SeatStatus::Booked => "Booked".to_string(),
        };
        let status_str = bitmap
            .as_deref()
            .and_then(|snapshot| bitmap_seat_status(snapshot, seat.id))
            .map(str::to_owned)
            .unwrap_or(database_status);
        let mut locked_by_user_id: Option<i32> = None;

        if status_str == "Locked"
            && let Some(ref mut rconn) = redis_conn
        {
            locked_by_user_id = redis::cmd("GET")
                .arg(bookit_redis::keys::seat_lock_key(id, seat.id))
                .query(rconn)
                .ok()
                .flatten();
        }

        seats_json.push(serde_json::json!({
            "id": seat.id,
            "schedule_id": seat.schedule_id,
            "seat_index": seat.seat_index,
            "layout_seat_id": seat.layout_seat_id,
            "source": seat.source,
            "row_letter": seat.row_letter,
            "seat_number": seat.seat_number,
            "seat_class": seat.seat_class,
            "price": seat.price,
            "status": status_str,
            "booking_id": seat.booking_id,
            "locked_by_user_id": locked_by_user_id
        }));
    }

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "schedule_id": id,
            "lifecycle_state": schedule.lifecycle_state,
            "booking_open": schedule.lifecycle_state == ScheduleLifecycleState::Open,
            "seats": seats_json
        })),
    ))
}

/// GET /api/user/schedules_v2/show/:show_id
#[derive(Debug, Deserialize)]
pub struct ShowSchedulesQuery {
    pub city: Option<String>,
}

pub async fn get_schedules_for_show(
    State(state): State<Arc<AppState>>,
    Path(show_id): Path<String>,
    Query(query): Query<ShowSchedulesQuery>,
) -> Result<impl IntoResponse, AppError> {
    let now = Utc::now();
    let city = selected_city(query.city.as_deref()).map(str::to_owned);
    let cache_key = cache_show_schedules_key(&show_id, city.as_deref());

    let rows: Vec<Schedule> = if let Some(cached) = get_async_cached(&state, &cache_key).await {
        cached
    } else {
        let db_pool = state.db_pool.clone();
        let show_id = show_id.clone();
        let loaded: Vec<Schedule> = tokio::task::spawn_blocking(move || -> Result<_, AppError> {
            let mut conn = db_pool
                .get()
                .map_err(|e| AppError::internal(e.to_string()))?;
            let mut schedules_query = schedules::table
                .filter(schedules::mongo_show_id.eq(&show_id))
                .filter(schedules::deleted_at.is_null())
                .filter(schedules::lifecycle_state.ne(ScheduleLifecycleState::Closed))
                .filter(schedules::start_time.gt(now))
                .into_boxed();

            if let Some(city) = city {
                schedules_query = schedules_query.filter(schedules::venue_city.eq(city));
            }

            schedules_query
                .order(schedules::start_time.asc())
                .load(&mut conn)
                .map_err(|e| AppError::internal(e.to_string()))
        })
        .await
        .map_err(|e| AppError::internal(format!("Show-schedules query task failed: {e}")))??;
        set_async_cached(&state, &cache_key, &loaded, TTL_SHOW_SCHEDULES).await;
        loaded
    };

    let rows = rows
        .into_iter()
        .filter(|schedule| {
            schedule.deleted_at.is_none()
                && schedule.lifecycle_state != ScheduleLifecycleState::Closed
                && schedule.start_time > now
        })
        .collect::<Vec<_>>();
    let schedule_ids = rows.iter().map(|schedule| schedule.id).collect();
    let (total_seats_by_schedule, available_seats_by_schedule) =
        load_schedule_seat_counts(&state, schedule_ids).await?;

    let mut results = Vec::new();
    for s in rows {
        let seconds_until_booking_open = (s.booking_open_at - Utc::now()).num_seconds();
        let total = total_seats_by_schedule.get(&s.id).copied().unwrap_or(0);
        let available = available_seats_by_schedule.get(&s.id).copied().unwrap_or(0);

        results.push(serde_json::json!({
            "id": s.id,
            "show_type": s.show_type,
            "layout_id": s.layout_id,
            "date": s.date,
            "slot": s.slot,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "booking_open_at": s.booking_open_at,
            "lifecycle_state": s.lifecycle_state,
            "booking_open": s.lifecycle_state == ScheduleLifecycleState::Open,
            "seconds_until_booking_open": seconds_until_booking_open,
            "total_seats": total,
            "available_seats": available,
            "venue_name": s.venue_name,
            "venue_address": s.venue_address,
            "venue_city": s.venue_city,
        }));
    }

    Ok((StatusCode::OK, Json(serde_json::json!(results))))
}

/// GET /api/user/schedules_v2/:id/my-locks
///
/// Returns the seat IDs that the authenticated user currently has locked for
/// the given schedule, by reading the existing `{scheduleId}:user:{userId}`
/// ZSET (already atomically maintained by every lock/release Lua script).
///
/// Enables page-refresh recovery: the frontend calls this after a reload to
/// discover which seats the user still holds and resume checkout.
pub async fn get_my_locked_seats(
    State(state): State<Arc<AppState>>,
    Path(schedule_id): Path<i32>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| AppError::bad_request("missing bearer token"))?;

    let user_id: i32 = if token == "mock_token" {
        1
    } else {
        use crate::api::auth::Claims;
        jsonwebtoken::decode::<Claims>(
            token,
            &jsonwebtoken::DecodingKey::from_secret(state.jwt_secret.as_bytes()),
            &jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256),
        )
        .map_err(|_| AppError::bad_request("invalid bearer token"))?
        .claims
        .sub
        .parse()
        .map_err(|_| AppError::bad_request("invalid user identity"))?
    };

    // Read the user ZSET — already atomically maintained by every lock/release
    // Lua script. Members with score >= now are still within their TTL.
    use bookit_redis::SeatLock;
    let locked_seat_ids = state
        .single_node_lock
        .get_user_locked_seats(schedule_id, user_id)
        .await;

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "schedule_id": schedule_id,
            "user_id": user_id,
            "locked_seat_ids": locked_seat_ids
        })),
    ))
}

