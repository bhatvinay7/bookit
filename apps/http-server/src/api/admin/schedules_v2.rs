use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use bigdecimal::BigDecimal;
use chrono::Utc;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;

use crate::api::state::AppState;
use crate::helpers::errors::AppError;
use crate::services::cache::invalidate_async;
use bookit_db::{
    insertables::{NewSchedule, NewScheduleSeat},
    models::{LayoutSeatClass, Schedule, ScheduleSeat, SeatLayoutSeat, SeatSource, ShowType},
    schema::{schedule_seats, schedules, seat_layout_seats},
};
use bookit_mongo::models::{Show, ShowType as MongoShowType};
use bookit_redis::keys::{
    cache_movies_key, cache_schedule_key, cache_schedules_active_key, cache_show_schedules_key,
};

fn show_types_match(postgres: &ShowType, mongo: &MongoShowType) -> bool {
    matches!(
        (postgres, mongo),
        (ShowType::Movie, MongoShowType::Movie)
            | (ShowType::Concert, MongoShowType::Concert)
            | (ShowType::Event, MongoShowType::Event)
            | (ShowType::GameEvent, MongoShowType::GameEvent)
    )
}

fn show_type_name(show_type: &ShowType) -> &'static str {
    match show_type {
        ShowType::Movie => "Movie",
        ShowType::Concert => "Concert",
        ShowType::Event => "Event",
        ShowType::GameEvent => "GameEvent",
    }
}

async fn invalidate_show_schedule_caches(state: &Arc<AppState>, schedule: &Schedule) {
    invalidate_async(state, &cache_schedules_active_key()).await;
    invalidate_async(
        state,
        &cache_show_schedules_key(&schedule.mongo_show_id, schedule.venue_city.as_deref()),
    )
    .await;
    invalidate_async(
        state,
        &cache_show_schedules_key(&schedule.mongo_show_id, None),
    )
    .await;

    let show_type = show_type_name(&schedule.show_type);
    for key in [
        cache_movies_key(None, None),
        cache_movies_key(Some(show_type), None),
        cache_movies_key(None, schedule.venue_city.as_deref()),
        cache_movies_key(Some(show_type), schedule.venue_city.as_deref()),
    ] {
        invalidate_async(state, &key).await;
    }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Serialize, Debug)]
pub struct CreateScheduleRequest {
    pub mongo_show_id: String,
    pub show_type: ShowType,
    pub layout_id: i32,
    /// YYYY-MM-DD string
    pub date: String,
    pub slot: bookit_db::models::TimeSlot,
    /// ISO-8601 datetime string (optional, will compute from slot if omitted)
    pub start_time: Option<String>,
    pub end_time: String,
    /// When users may start booking
    pub booking_open_at: String,
    /// Price per seat class: { "Standard": "150.00", "Premium": "250.00" }
    pub prices: std::collections::HashMap<String, String>,
    pub venue_name: Option<String>,
    pub venue_address: Option<String>,
    pub venue_city: String,
    pub venue_state: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ExtraSeatInput {
    pub row_letter: String,
    pub seat_number: i32,
    pub seat_class: LayoutSeatClass,
    pub price: String,
}

#[derive(Deserialize)]
pub struct AddExtraSeatsRequest {
    pub seats: Vec<ExtraSeatInput>,
}

#[derive(Deserialize)]
pub struct ListSchedulesQuery {
    pub show_type: Option<String>,
    pub upcoming: Option<bool>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct UpdateSeatInput {
    pub id: i32,
    pub price: Option<String>,
    pub status: Option<bookit_db::models::SeatStatus>,
}

#[derive(Deserialize)]
pub struct UpdateScheduleSeatsRequest {
    pub seats: Vec<UpdateSeatInput>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateScheduleRequest {
    pub date: Option<String>,
    pub slot: Option<bookit_db::models::TimeSlot>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub booking_open_at: Option<String>,
    pub venue_name: Option<String>,
    pub venue_address: Option<String>,
    pub venue_city: Option<String>,
    pub venue_state: Option<String>,
}

// ─── List schedules ───────────────────────────────────────────────────────────

pub async fn list_schedules(
    State(state): State<Arc<AppState>>,
    Query(_q): Query<ListSchedulesQuery>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let rows: Vec<Schedule> = schedules::table
        .filter(schedules::deleted_at.is_null())
        .order(schedules::start_time.asc())
        .load(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut mongo_show_ids = vec![];
    for s in &rows {
        if let Ok(oid) = bson::oid::ObjectId::parse_str(&s.mongo_show_id) {
            mongo_show_ids.push(oid);
        }
    }

    let mut shows_map = std::collections::HashMap::new();
    if !mongo_show_ids.is_empty() {
        let col = state
            .mongo_client
            .database(&state.mongo_db_name)
            .collection::<bookit_mongo::models::Show>("shows");
        if let Ok(mut cursor) = col
            .find(bson::doc! { "_id": { "$in": mongo_show_ids } })
            .await
        {
            use futures::StreamExt;
            while let Some(Ok(show)) = cursor.next().await {
                if let Some(id) = show.id {
                    shows_map.insert(id.to_hex(), show);
                }
            }
        }
    }

    let enriched: Vec<serde_json::Value> = rows
        .iter()
        .map(|s| {
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

            let now = Utc::now();
            let seconds_until_booking_open = (s.booking_open_at - now).num_seconds();

            let title = shows_map
                .get(&s.mongo_show_id)
                .map(|sh| sh.title.clone())
                .unwrap_or_else(|| "Unknown Show".to_string());

            serde_json::json!({
                "id":                          s.id,
                "mongo_show_id":               s.mongo_show_id,
                "show_title":                  title,
                "show_type":                   s.show_type,
                "layout_id":                   s.layout_id,
                "date":                        s.date,
                "slot":                        s.slot,
                "start_time":                  s.start_time,
                "end_time":                    s.end_time,
                "booking_open_at":             s.booking_open_at,
                "created_at":                  s.created_at,
                "deleted_at":                  s.deleted_at,
                "total_seats":                 total,
                "available_seats":             available,
                "booked_seats":                total - available,
                "seconds_until_booking_open":  seconds_until_booking_open,
                "booking_open":                seconds_until_booking_open <= 0,
                "venue_name":                  s.venue_name,
                "venue_address":               s.venue_address,
                "venue_city":                  s.venue_city,
                "venue_state":                 s.venue_state,
            })
        })
        .collect();

    Ok(Json(enriched))
}

// ─── Create schedule (copies base layout seats) ───────────────────────────────

pub async fn create_schedule(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateScheduleRequest>,
) -> Result<impl IntoResponse, AppError> {
    let venue_city = body.venue_city.trim().to_owned();
    if venue_city.is_empty() {
        return Err(AppError::bad_request("venue_city is required"));
    }

    // PostgreSQL cannot enforce a foreign key into MongoDB, so validate the
    // application-level reference before creating the schedule.
    let mongo_show_id = body.mongo_show_id.trim().to_owned();
    let show_oid = bson::oid::ObjectId::parse_str(&mongo_show_id)
        .map_err(|_| AppError::bad_request("mongo_show_id must be a valid MongoDB ObjectId"))?;
    let shows = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");
    let mongo_show = shows
        .find_one(bson::doc! { "_id": show_oid, "deleted_at": null })
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("Show not found or has been deleted"))?;

    if !show_types_match(&body.show_type, &mongo_show.show_type) {
        return Err(AppError::bad_request(
            "show_type does not match the referenced MongoDB show",
        ));
    }

    // Validate times
    let date = chrono::NaiveDate::parse_from_str(&body.date, "%Y-%m-%d")
        .map_err(|_| AppError::bad_request("Invalid date format, expected YYYY-MM-DD"))?;

    let start_time = if let Some(st) = &body.start_time {
        chrono::DateTime::parse_from_rfc3339(st)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|_| AppError::bad_request("Invalid start_time — use ISO-8601"))?
    } else {
        // Fallback: derive from date and slot
        let hour = match body.slot {
            bookit_db::models::TimeSlot::Morning => 10,
            bookit_db::models::TimeSlot::Afternoon => 14,
            bookit_db::models::TimeSlot::Evening => 18,
            bookit_db::models::TimeSlot::Night => 22,
        };
        chrono::DateTime::from_naive_utc_and_offset(date.and_hms_opt(hour, 0, 0).unwrap(), Utc)
    };

    let end_time = chrono::DateTime::parse_from_rfc3339(&body.end_time)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| AppError::bad_request("Invalid end_time — use ISO-8601"))?;

    let booking_open_at = chrono::DateTime::parse_from_rfc3339(&body.booking_open_at)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| AppError::bad_request("Invalid booking_open_at — use ISO-8601"))?;

    if booking_open_at >= start_time {
        return Err(AppError::bad_request(
            "booking_open_at must be before start_time",
        ));
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Insert schedule
    let new_schedule = NewSchedule {
        mongo_show_id,
        show_type: body.show_type.clone(),
        layout_id: Some(body.layout_id),
        date,
        slot: body.slot.clone(),
        start_time,
        end_time,
        booking_open_at,
        venue_name: body.venue_name,
        venue_address: body.venue_address,
        venue_city: Some(venue_city),
        venue_state: body.venue_state,
    };

    let schedule: Schedule = diesel::insert_into(schedules::table)
        .values(&new_schedule)
        .get_result(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Load base seats from layout
    let base_seats: Vec<SeatLayoutSeat> = seat_layout_seats::table
        .filter(seat_layout_seats::layout_id.eq(body.layout_id))
        .load(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    if base_seats.is_empty() {
        return Err(AppError::bad_request(
            "Seat layout has no seats — add seats to the layout first",
        ));
    }

    // Copy layout seats → schedule_seats (deduplicated by (row_letter, seat_number))
    let default_price = BigDecimal::from(0u32);
    let mut seen_seat_keys = std::collections::HashSet::new();
    let mut new_seats: Vec<NewScheduleSeat> = Vec::new();

    for seat in base_seats.iter() {
        if !seen_seat_keys.insert((seat.row_letter.clone(), seat.seat_number)) {
            continue; // Skip duplicate (row_letter, seat_number) in layout
        }
        let class_key = match seat.seat_class {
            LayoutSeatClass::Standard => "Standard",
            LayoutSeatClass::Premium => "Premium",
            LayoutSeatClass::Vip => "VIP",
            LayoutSeatClass::Ga => "GA",
        };

        let price_str = body
            .prices
            .get(class_key)
            .or_else(|| body.prices.get("Standard"))
            .map(|s| s.as_str())
            .unwrap_or("0");
        let price = BigDecimal::from_str(price_str).unwrap_or_else(|_| default_price.clone());

        new_seats.push(NewScheduleSeat {
            schedule_id: schedule.id,
            layout_seat_id: Some(seat.id),
            source: SeatSource::Base,
            row_letter: seat.row_letter.clone(),
            seat_number: seat.seat_number,
            seat_class: seat.seat_class.clone(),
            price,
        });
    }

    diesel::insert_into(schedule_seats::table)
        .values(&new_seats)
        .on_conflict_do_nothing()
        .execute(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    invalidate_show_schedule_caches(&state, &schedule).await;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id":          schedule.id,
            "start_time":  schedule.start_time,
            "seats_copied": new_seats.len(),
        })),
    ))
}

// ─── Add extra seats to an existing schedule ──────────────────────────────────

pub async fn add_extra_seats(
    State(state): State<Arc<AppState>>,
    Path(schedule_id): Path<i32>,
    Json(body): Json<AddExtraSeatsRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.seats.is_empty() {
        return Err(AppError::bad_request("seats must not be empty"));
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Verify schedule exists and is not deleted
    let _sched: Schedule = schedules::table
        .find(schedule_id)
        .filter(schedules::deleted_at.is_null())
        .first(&mut conn)
        .map_err(|_| AppError::not_found("Schedule not found"))?;

    let mut seen_seat_keys = std::collections::HashSet::new();
    let mut new_seats = Vec::new();
    for s in body.seats.iter() {
        if !seen_seat_keys.insert((s.row_letter.clone(), s.seat_number)) {
            continue;
        }
        let price = BigDecimal::from_str(&s.price)
            .map_err(|_| AppError::bad_request(format!("Invalid price: {}", s.price)))?;
        new_seats.push(NewScheduleSeat {
            schedule_id,
            layout_seat_id: None,
            source: SeatSource::Extra,
            row_letter: s.row_letter.clone(),
            seat_number: s.seat_number,
            seat_class: s.seat_class.clone(),
            price,
        });
    }

    let inserted: Vec<ScheduleSeat> = diesel::insert_into(schedule_seats::table)
        .values(&new_seats)
        .on_conflict_do_nothing()
        .get_results(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Invalidate caches since seat count changed
    invalidate_async(&state, &cache_schedule_key(schedule_id)).await;
    invalidate_async(&state, &cache_schedules_active_key()).await;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "schedule_id": schedule_id,
            "extra_seats_added": inserted.len(),
            "seats": inserted,
        })),
    ))
}

// ─── Update existing schedule seats (price/status) ────────────────────────────

pub async fn update_schedule_seats(
    State(state): State<Arc<AppState>>,
    Path(schedule_id): Path<i32>,
    Json(body): Json<UpdateScheduleSeatsRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.seats.is_empty() {
        return Err(AppError::bad_request("seats array must not be empty"));
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Verify schedule exists
    let _sched: Schedule = schedules::table
        .find(schedule_id)
        .first(&mut conn)
        .map_err(|_| AppError::not_found("Schedule not found"))?;

    for seat in body.seats {
        if let Some(price_str) = &seat.price
            && let Ok(price) = BigDecimal::from_str(price_str)
        {
            diesel::update(
                schedule_seats::table.filter(
                    schedule_seats::id
                        .eq(seat.id)
                        .and(schedule_seats::schedule_id.eq(schedule_id)),
                ),
            )
            .set(schedule_seats::price.eq(price))
            .execute(&mut conn)
            .map_err(|e| AppError::internal(e.to_string()))?;
        }
        if let Some(new_status) = &seat.status {
            diesel::update(
                schedule_seats::table.filter(
                    schedule_seats::id
                        .eq(seat.id)
                        .and(schedule_seats::schedule_id.eq(schedule_id)),
                ),
            )
            .set(schedule_seats::status.eq(new_status))
            .execute(&mut conn)
            .map_err(|e| AppError::internal(e.to_string()))?;
        }
    }

    invalidate_async(&state, &cache_schedule_key(schedule_id)).await;

    Ok(Json(serde_json::json!({ "updated": true })))
}

// ─── Get schedule seats (seat map) ────────────────────────────────────────────

pub async fn get_schedule_seats(
    State(state): State<Arc<AppState>>,
    Path(schedule_id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let seats: Vec<ScheduleSeat> = schedule_seats::table
        .filter(schedule_seats::schedule_id.eq(schedule_id))
        .order((
            schedule_seats::row_letter.asc(),
            schedule_seats::seat_number.asc(),
        ))
        .load(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(seats))
}

// ─── Cancel schedule (soft delete) ───────────────────────────────────────────

pub async fn delete_schedule(
    State(state): State<Arc<AppState>>,
    Path(schedule_id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let schedule: Schedule = schedules::table
        .find(schedule_id)
        .filter(schedules::deleted_at.is_null())
        .first(&mut conn)
        .map_err(|_| AppError::not_found("Schedule not found"))?;

    diesel::update(schedules::table.find(schedule_id))
        .set(schedules::deleted_at.eq(Some(Utc::now())))
        .execute(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    invalidate_async(&state, &cache_schedule_key(schedule_id)).await;
    invalidate_show_schedule_caches(&state, &schedule).await;

    Ok(Json(serde_json::json!({ "cancelled": true })))
}

// ─── Update schedule metadata ─────────────────────────────────────────────────

#[derive(AsChangeset, Default)]
#[diesel(table_name = schedules)]
struct ScheduleChangeset<'a> {
    date: Option<chrono::NaiveDate>,
    slot: Option<&'a bookit_db::models::TimeSlot>,
    start_time: Option<chrono::DateTime<Utc>>,
    end_time: Option<chrono::DateTime<Utc>>,
    booking_open_at: Option<chrono::DateTime<Utc>>,
    venue_name: Option<&'a str>,
    venue_address: Option<&'a str>,
    venue_city: Option<&'a str>,
    venue_state: Option<&'a str>,
}

pub async fn update_schedule(
    State(state): State<Arc<AppState>>,
    Path(schedule_id): Path<i32>,
    Json(body): Json<UpdateScheduleRequest>,
) -> Result<impl IntoResponse, AppError> {
    let venue_city = body.venue_city.as_deref().map(str::trim);
    if venue_city.is_some_and(str::is_empty) {
        return Err(AppError::bad_request("venue_city must not be empty"));
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Verify schedule exists
    let existing: Schedule = schedules::table
        .find(schedule_id)
        .filter(schedules::deleted_at.is_null())
        .first(&mut conn)
        .map_err(|_| AppError::not_found("Schedule not found"))?;

    let start_time = if let Some(st) = &body.start_time {
        Some(
            chrono::DateTime::parse_from_rfc3339(st)
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(|_| AppError::bad_request("Invalid start_time — use ISO-8601"))?,
        )
    } else {
        None
    };

    let end_time = if let Some(et) = &body.end_time {
        Some(
            chrono::DateTime::parse_from_rfc3339(et)
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(|_| AppError::bad_request("Invalid end_time — use ISO-8601"))?,
        )
    } else {
        None
    };

    let booking_open_at = if let Some(bot) = &body.booking_open_at {
        Some(
            chrono::DateTime::parse_from_rfc3339(bot)
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(|_| AppError::bad_request("Invalid booking_open_at — use ISO-8601"))?,
        )
    } else {
        None
    };

    let parsed_date = if let Some(d_str) = &body.date {
        Some(
            chrono::NaiveDate::parse_from_str(d_str, "%Y-%m-%d")
                .map_err(|_| AppError::bad_request("Invalid date format, expected YYYY-MM-DD"))?,
        )
    } else {
        None
    };

    let changeset = ScheduleChangeset {
        date: parsed_date,
        slot: body.slot.as_ref(),
        start_time,
        end_time,
        booking_open_at,
        venue_name: body.venue_name.as_deref(),
        venue_address: body.venue_address.as_deref(),
        venue_city,
        venue_state: body.venue_state.as_deref(),
    };

    diesel::update(schedules::table.find(schedule_id))
        .set(&changeset)
        .execute(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    invalidate_async(&state, &cache_schedule_key(schedule_id)).await;

    let updated: Schedule = schedules::table
        .find(schedule_id)
        .first(&mut conn)
        .unwrap_or_else(|_| existing.clone());
    invalidate_show_schedule_caches(&state, &existing).await;
    if existing.venue_city != updated.venue_city {
        invalidate_show_schedule_caches(&state, &updated).await;
    }
    Ok(Json(updated))
}

// ─── Get single schedule metadata ─────────────────────────────────────────────

pub async fn get_schedule(
    State(state): State<Arc<AppState>>,
    Path(schedule_id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let schedule: Schedule = schedules::table
        .find(schedule_id)
        .first(&mut conn)
        .map_err(|_| AppError::not_found("Schedule not found"))?;

    Ok(Json(schedule))
}
