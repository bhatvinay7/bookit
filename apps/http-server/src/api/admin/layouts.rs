use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::state::AppState;
use crate::helpers::errors::AppError;
use bookit_db::{
    insertables::{NewSeatLayout, NewSeatLayoutSeat},
    models::{LayoutSeatClass, SeatLayout, SeatLayoutSeat, ShowType},
    schema::{seat_layout_seats, seat_layouts},
};

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListLayoutsQuery {
    pub show_type: Option<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct CreateLayoutRequest {
    pub name: String,
    pub show_type: ShowType,
    pub description: Option<String>,
    pub layout_shape: String,
}

#[derive(Deserialize)]
pub struct UpdateLayoutRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub seats: Option<Vec<SeatInput>>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SeatInput {
    pub row_letter: String,
    pub seat_number: i32,
    pub seat_class: LayoutSeatClass,
    pub x_pos: Option<i32>,
    pub y_pos: Option<i32>,
    pub block_name: Option<String>,
}

#[derive(Deserialize)]
pub struct AddSeatsRequest {
    pub seats: Vec<SeatInput>,
}

// ─── List layouts ─────────────────────────────────────────────────────────────

pub async fn list_layouts(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListLayoutsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut query = seat_layouts::table
        .filter(seat_layouts::deleted_at.is_null())
        .into_boxed();

    if let Some(st) = &q.show_type {
        let parsed: ShowType = serde_json::from_value(serde_json::Value::String(st.clone()))
            .map_err(|_| AppError::bad_request("Invalid show_type"))?;
        query = query.filter(seat_layouts::show_type.eq(parsed));
    }

    let layouts: Vec<SeatLayout> = query
        .order(seat_layouts::created_at.desc())
        .load(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(layouts))
}

// ─── Get layout (metadata only) ────────────────────────────────────────────────

pub async fn get_layout(
    State(state): State<Arc<AppState>>,
    Path(layout_id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let layout: SeatLayout = seat_layouts::table
        .find(layout_id)
        .first(&mut conn)
        .map_err(|_| AppError::not_found("Layout not found"))?;

    Ok(Json(layout))
}

// ─── Get layout with seats ────────────────────────────────────────────────────

pub async fn get_layout_seats(
    State(state): State<Arc<AppState>>,
    Path(layout_id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let layout: SeatLayout = seat_layouts::table
        .find(layout_id)
        .first(&mut conn)
        .map_err(|_| AppError::not_found("Layout not found"))?;

    let seats: Vec<SeatLayoutSeat> = seat_layout_seats::table
        .filter(seat_layout_seats::layout_id.eq(layout_id))
        .order((
            seat_layout_seats::row_letter.asc(),
            seat_layout_seats::seat_number.asc(),
        ))
        .load(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "layout": layout,
        "seats": seats,
        "total_seats": seats.len(),
    })))
}

// ─── Create layout ────────────────────────────────────────────────────────────

pub async fn create_layout(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateLayoutRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::bad_request("name is required"));
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    let new_layout = NewSeatLayout {
        name: body.name,
        show_type: body.show_type,
        description: body.description,
        layout_shape: body.layout_shape,
    };

    let layout: SeatLayout = diesel::insert_into(seat_layouts::table)
        .values(&new_layout)
        .get_result(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok((StatusCode::CREATED, Json(layout)))
}

// ─── Add seats to layout ──────────────────────────────────────────────────────

pub async fn add_seats_to_layout(
    State(state): State<Arc<AppState>>,
    Path(layout_id): Path<i32>,
    Json(body): Json<AddSeatsRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.seats.is_empty() {
        return Err(AppError::bad_request("seats array must not be empty"));
    }

    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Verify layout exists
    seat_layouts::table
        .find(layout_id)
        .first::<SeatLayout>(&mut conn)
        .map_err(|_| AppError::not_found("Layout not found"))?;

    // Deduplicate seats to prevent UNIQUE constraint errors within the batch
    let mut unique_seats = std::collections::HashMap::new();
    for s in &body.seats {
        unique_seats.insert(
            (s.block_name.clone(), s.row_letter.clone(), s.seat_number),
            s,
        );
    }

    let new_seats: Vec<NewSeatLayoutSeat> = unique_seats
        .into_values()
        .map(|s| NewSeatLayoutSeat {
            layout_id: layout_id,
            row_letter: s.row_letter.clone(),
            seat_number: s.seat_number,
            seat_class: s.seat_class.clone(),
            x_pos: s.x_pos,
            y_pos: s.y_pos,
            block_name: s.block_name.clone(),
        })
        .collect();

    let inserted: Vec<SeatLayoutSeat> = diesel::insert_into(seat_layout_seats::table)
        .values(&new_seats)
        .on_conflict_do_nothing()
        .get_results(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "inserted": inserted.len(),
            "seats": inserted,
        })),
    ))
}

// ─── Delete layout (soft) ─────────────────────────────────────────────────────

pub async fn delete_layout(
    State(state): State<Arc<AppState>>,
    Path(layout_id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    diesel::update(seat_layouts::table.find(layout_id))
        .set(seat_layouts::deleted_at.eq(Some(chrono::Utc::now())))
        .execute(&mut conn)
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ─── Update layout ────────────────────────────────────────────────────────────

pub async fn update_layout(
    State(state): State<Arc<AppState>>,
    Path(layout_id): Path<i32>,
    Json(body): Json<UpdateLayoutRequest>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::internal(e.to_string()))?;

    // 1. Update layout info if provided
    if let Some(name) = body.name {
        diesel::update(seat_layouts::table.find(layout_id))
            .set(seat_layouts::name.eq(name))
            .execute(&mut conn)
            .map_err(|e| AppError::internal(e.to_string()))?;
    }

    if let Some(desc) = body.description {
        diesel::update(seat_layouts::table.find(layout_id))
            .set(seat_layouts::description.eq(desc))
            .execute(&mut conn)
            .map_err(|e| AppError::internal(e.to_string()))?;
    }

    // 2. If seats are provided, completely replace the existing layout seats
    if let Some(seats) = body.seats {
        conn.transaction::<_, AppError, _>(|conn| {
            // Delete all existing seats for this layout
            diesel::delete(
                seat_layout_seats::table.filter(seat_layout_seats::layout_id.eq(layout_id)),
            )
            .execute(conn)
            .map_err(|e| AppError::internal(e.to_string()))?;

            // Deduplicate seats on the backend to prevent UNIQUE constraint errors
            let mut unique_seats = std::collections::HashMap::new();
            for s in seats {
                unique_seats.insert(
                    (s.block_name.clone(), s.row_letter.clone(), s.seat_number),
                    s,
                );
            }

            let new_seats: Vec<NewSeatLayoutSeat> = unique_seats
                .into_values()
                .map(|s| NewSeatLayoutSeat {
                    layout_id: layout_id,
                    row_letter: s.row_letter.clone(),
                    seat_number: s.seat_number,
                    seat_class: s.seat_class.clone(),
                    x_pos: s.x_pos,
                    y_pos: s.y_pos,
                    block_name: s.block_name.clone(),
                })
                .collect();

            if !new_seats.is_empty() {
                diesel::insert_into(seat_layout_seats::table)
                    .values(&new_seats)
                    .on_conflict_do_nothing()
                    .execute(conn)
                    .map_err(|e| AppError::internal(e.to_string()))?;
            }
            Ok(())
        })?;
    }

    Ok(Json(serde_json::json!({ "updated": true })))
}
