use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use bson::doc;
use chrono::Utc;
use diesel::prelude::*;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

use bookit_db::{
    models::{Schedule, ScheduleSeat},
    schema::{schedule_seats, schedules},
};
use bookit_mongo::models::Show;
use bookit_redis::keys::{
    TTL_SHOW_SCHEDULES, cache_schedule_key, cache_schedules_active_key, cache_show_key,
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

    // 1. Try Cache
    if let Some(val) = get_async_cached::<Value>(&state, &cache_key).await {
        return Ok((StatusCode::OK, Json(val)));
    }

    // 2. Cache Miss -> Query Postgres
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;
    let now = Utc::now();

    let rows: Vec<Schedule> = schedules::table
        .filter(schedules::deleted_at.is_null())
        .filter(schedules::start_time.gt(now))
        .order(schedules::start_time.asc())
        .load(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    let coll = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    let mut results = Vec::new();

    for s in rows {
        // Fetch show details
        let show_cache_key = cache_show_key(&s.mongo_show_id);

        // Try show cache
        let mut show_val: Option<Value> = get_async_cached::<Value>(&state, &show_cache_key).await;

        // If show miss, fetch from Mongo
        if show_val.is_none()
            && let Ok(oid) = bson::oid::ObjectId::parse_str(&s.mongo_show_id)
            && let Ok(Some(show_doc)) = coll.find_one(doc! { "_id": oid }).await
        {
            let v = serde_json::to_value(&show_doc).unwrap_or(Value::Null);
            show_val = Some(v.clone());
            // Set cache
            set_async_cached(&state, &show_cache_key, &v, 3600).await;
        }

        let seconds_until_booking_open = (s.booking_open_at - Utc::now()).num_seconds();

        let total: i64 = schedule_seats::table
            .filter(schedule_seats::schedule_id.eq(s.id))
            .count()
            .get_result(&mut conn)
            .unwrap_or(0);

        let available: i64 = schedule_seats::table
            .filter(schedule_seats::schedule_id.eq(s.id))
            .filter(schedule_seats::status.eq(bookit_db::models::SeatStatus::Available))
            .count()
            .get_result(&mut conn)
            .unwrap_or(0);

        results.push(serde_json::json!({
            "id": s.id,
            "show_type": s.show_type,
            "layout_id": s.layout_id,
            "date": s.date,
            "slot": s.slot,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "booking_open_at": s.booking_open_at,
            "booking_open": seconds_until_booking_open <= 0,
            "seconds_until_booking_open": seconds_until_booking_open,
            "total_seats": total,
            "available_seats": available,
            "show": show_val
        }));
    }

    let response_json = serde_json::json!(results);

    // Set active schedules cache (expire in 60 seconds since availability changes often)
    set_async_cached(&state, &cache_key, &response_json, 60).await;

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
        "booking_open": seconds_until_booking_open <= 0,
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

    let seconds_until_booking_open = (schedule.booking_open_at - Utc::now()).num_seconds();

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
            "booking_open": seconds_until_booking_open <= 0,
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
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;
    let now = Utc::now();
    let city = selected_city(query.city.as_deref());
    let cache_key = cache_show_schedules_key(&show_id, city);

    let rows: Vec<Schedule> = if let Some(cached) = get_async_cached(&state, &cache_key).await {
        cached
    } else {
        let mut schedules_query = schedules::table
            .filter(schedules::mongo_show_id.eq(&show_id))
            .filter(schedules::deleted_at.is_null())
            .filter(schedules::start_time.gt(now))
            .into_boxed();

        if let Some(city) = city {
            schedules_query = schedules_query.filter(schedules::venue_city.eq(city));
        }

        let loaded: Vec<Schedule> = schedules_query
            .order(schedules::start_time.asc())
            .load(&mut conn)
            .map_err(|e| AppError::internal(e.to_string()))?;
        set_async_cached(&state, &cache_key, &loaded, TTL_SHOW_SCHEDULES).await;
        loaded
    };

    let mut results = Vec::new();

    for s in rows
        .into_iter()
        .filter(|schedule| schedule.deleted_at.is_none() && schedule.start_time > now)
    {
        let seconds_until_booking_open = (s.booking_open_at - Utc::now()).num_seconds();

        let total: i64 = schedule_seats::table
            .filter(schedule_seats::schedule_id.eq(s.id))
            .count()
            .get_result(&mut conn)
            .unwrap_or(0);

        let available: i64 = schedule_seats::table
            .filter(schedule_seats::schedule_id.eq(s.id))
            .filter(schedule_seats::status.eq(bookit_db::models::SeatStatus::Available))
            .count()
            .get_result(&mut conn)
            .unwrap_or(0);

        results.push(serde_json::json!({
            "id": s.id,
            "show_type": s.show_type,
            "layout_id": s.layout_id,
            "date": s.date,
            "slot": s.slot,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "booking_open_at": s.booking_open_at,
            "booking_open": seconds_until_booking_open <= 0,
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
