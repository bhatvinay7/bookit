use axum::{extract::{Path, State}, Json};
use chrono::Utc;
use diesel::prelude::*;
use serde::Serialize;
use std::sync::Arc;

use bookit_db::models::{Seat, ShowtimeSeat, Showtime, SeatStatus};
use bookit_db::schema::showtimes::dsl as st;
use bookit_db::schema::showtime_seats::dsl as ss;
use bookit_db::schema::seats::dsl as se;

use crate::api::state::AppState;
use crate::helpers::{AppError, db_err};
use crate::services::cache::{get_cached, set_cached};
use bookit_redis::keys;

// ─── Showtime with countdown ──────────────────────────────────────────────────

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct ShowtimeWithCountdown {
    pub id: i32,
    pub movie_id: i32,
    pub screen_id: i32,
    pub start_time: String,  // ISO-8601
    pub available_seats: i64,
    pub total_seats: i64,
    /// Seconds remaining until show starts. Negative means started.
    pub seconds_until_start: i64,
    /// True once the show has started (booking window open)
    pub booking_open: bool,
    /// "upcoming" | "booking_open" | "in_progress" | "ended"
    pub status: String,
}

pub async fn get_showtimes(
    Path(movie_id_param): Path<i32>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ShowtimeWithCountdown>>, AppError> {
    let cache_key = keys::movie_showtimes(movie_id_param);

    if let Some(cached) = get_cached::<Vec<ShowtimeWithCountdown>>(&state, &cache_key) {
        return Ok(Json(cached));
    }

    let mut conn = state.db_pool.get().map_err(|_| db_err())?;

    let movie_showtimes = st::showtimes
        .filter(bookit_db::schema::showtimes::movie_id.eq(movie_id_param))
        .filter(bookit_db::schema::showtimes::deleted_at.is_null())
        .order(bookit_db::schema::showtimes::start_time.asc())
        .load::<Showtime>(&mut conn)?;

    let all_ss = ss::showtime_seats.load::<ShowtimeSeat>(&mut conn)?;

    let now = Utc::now().naive_utc();

    let results: Vec<ShowtimeWithCountdown> = movie_showtimes.into_iter().map(|s| {
        let seats: Vec<_> = all_ss.iter().filter(|x| x.showtime_id == s.id).collect();
        let total     = seats.len() as i64;
        let available = seats.iter().filter(|x| x.status == SeatStatus::Available).count() as i64;

        let secs_until = (s.start_time - now).num_seconds();
        // Assume 150-min movie duration for "in_progress" detection
        let secs_since_start = -secs_until;
        let status = if secs_until > 0 {
            "upcoming".into()
        } else if secs_since_start < 150 * 60 {
            "in_progress".into()
        } else {
            "ended".into()
        };

        ShowtimeWithCountdown {
            id: s.id,
            movie_id: s.movie_id,
            screen_id: s.screen_id,
            start_time: s.start_time.format("%Y-%m-%dT%H:%M:%S").to_string(),
            available_seats: available,
            total_seats: total,
            seconds_until_start: secs_until,
            booking_open: secs_until <= 0,
            status,
        }
    }).collect();

    let _ = set_cached(&state, &cache_key, &results, keys::TTL_MOVIE_SHOWTIMES);
    Ok(Json(results))
}

// ─── Seat map ─────────────────────────────────────────────────────────────────

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct SeatInfo {
    pub showtime_seat_id: i32,
    pub seat_id: i32,
    pub row_letter: String,
    pub seat_number: i32,
    pub seat_class: String,
    pub status: String,
    pub price: String,
}

pub async fn get_showtime_seats(
    Path(showtime_id_param): Path<i32>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<SeatInfo>>, AppError> {
    let cache_key = keys::showtime_seats(showtime_id_param);

    if let Some(cached) = get_cached::<Vec<SeatInfo>>(&state, &cache_key) {
        return Ok(Json(cached));
    }

    let mut conn = state.db_pool.get().map_err(|_| db_err())?;

    let seats_data: Vec<(ShowtimeSeat, Seat)> = ss::showtime_seats
        .inner_join(se::seats.on(bookit_db::schema::seats::id.eq(bookit_db::schema::showtime_seats::seat_id)))
        .filter(bookit_db::schema::showtime_seats::showtime_id.eq(showtime_id_param))
        .load::<(ShowtimeSeat, Seat)>(&mut conn)?;

    let result: Vec<SeatInfo> = seats_data.into_iter().map(|(ss_row, s)| SeatInfo {
        showtime_seat_id: ss_row.id,
        seat_id: s.id,
        row_letter: s.row_letter,
        seat_number: s.seat_number,
        seat_class: s.seat_class,
        status: format!("{:?}", ss_row.status),
        price: ss_row.price.to_string(),
    }).collect();

    let _ = set_cached(&state, &cache_key, &result, keys::TTL_SHOWTIME_SEATS);
    Ok(Json(result))
}
