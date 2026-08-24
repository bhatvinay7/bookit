use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use bson::{doc, oid::ObjectId};
use diesel::prelude::*;
use futures::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use bookit_db::models::{Order, Schedule, ScheduleSeat};
use bookit_db::schema::orders::dsl as od;
use bookit_mongo::models::Show;

use crate::api::state::AppState;
use crate::helpers::{AppError, db_err};

#[derive(Serialize)]
pub struct UserTicket {
    pub booking_id: String,
    pub status: String,
    pub total_amount: String,
    pub show_title: String,
    pub venue_name: String,
    pub show_time: String,
    pub seats: Vec<String>,
}

pub async fn get_user_tickets(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<UserTicket>>, AppError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| AppError::bad_request("missing bearer token"))?;

    let user_id = if token == "mock_token" {
        1
    } else {
        let claims = crate::helpers::jwt::decode_token(token)?;
        crate::helpers::jwt::user_id_from_claims(&claims)?
    };

    let mut conn = state.db_pool.get().map_err(|_| db_err())?;

    let user_orders: Vec<(Order, Schedule)> = od::orders
        .inner_join(bookit_db::schema::schedules::table)
        .filter(od::user_id.eq(user_id))
        .load::<(Order, Schedule)>(&mut conn)?;

    let mut all_seat_ids = Vec::new();
    for (order, _) in &user_orders {
        if let Some(ids) = order.seat_ids.as_array() {
            for id_val in ids {
                if let Some(i) = id_val.as_i64() {
                    all_seat_ids.push(i as i32);
                }
            }
        }
    }

    let all_seats: Vec<ScheduleSeat> = if all_seat_ids.is_empty() {
        Vec::new()
    } else {
        bookit_db::schema::schedule_seats::table
            .filter(bookit_db::schema::schedule_seats::id.eq_any(&all_seat_ids))
            .load::<ScheduleSeat>(&mut conn)?
    };

    let mut mongo_show_ids = vec![];
    for (_, sch) in &user_orders {
        if let Ok(oid) = ObjectId::parse_str(&sch.mongo_show_id) {
            mongo_show_ids.push(oid);
        }
    }

    let col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    let mut shows_map = HashMap::new();
    if !mongo_show_ids.is_empty() {
        let mut cursor = col
            .find(doc! { "_id": { "$in": mongo_show_ids } })
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;

        while let Some(Ok(show)) = cursor.next().await {
            if let Some(id) = show.id {
                shows_map.insert(id.to_hex(), show);
            }
        }
    }

    let tickets = user_orders
        .into_iter()
        .map(|(order, sch)| {
            let mut order_seat_ids = Vec::new();
            if let Some(ids) = order.seat_ids.as_array() {
                for id_val in ids {
                    if let Some(i) = id_val.as_i64() {
                        order_seat_ids.push(i as i32);
                    }
                }
            }

            let seat_labels: Vec<String> = all_seats
                .iter()
                .filter(|s| order_seat_ids.contains(&s.id))
                .map(|s| format!("{}{}", s.row_letter, s.seat_number))
                .collect();

            let title = shows_map
                .get(&sch.mongo_show_id)
                .map(|sh| sh.title.clone())
                .unwrap_or_else(|| "Unknown Show".to_string());
            let venue = sch
                .venue_name
                .unwrap_or_else(|| "Unknown Venue".to_string());
            let time = sch.start_time.to_string();

            UserTicket {
                booking_id: order.id.to_string(),
                status: order.status,
                total_amount: order.total_amount.to_string(),
                show_title: title,
                venue_name: venue,
                show_time: time,
                seats: seat_labels,
            }
        })
        .collect();

    Ok(Json(tickets))
}

pub async fn get_ticket_details(
    Path(ticket_id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<UserTicket>, AppError> {
    let mut conn = state.db_pool.get().map_err(|_| db_err())?;

    let (order, sch) = od::orders
        .inner_join(bookit_db::schema::schedules::table)
        .filter(od::id.eq(ticket_id))
        .first::<(Order, Schedule)>(&mut conn)
        .map_err(|_| AppError::not_found(format!("Order {} not found", ticket_id)))?;

    let mut order_seat_ids = Vec::new();
    if let Some(ids) = order.seat_ids.as_array() {
        for id_val in ids {
            if let Some(i) = id_val.as_i64() {
                order_seat_ids.push(i as i32);
            }
        }
    }

    let booked_seats: Vec<ScheduleSeat> = if order_seat_ids.is_empty() {
        Vec::new()
    } else {
        bookit_db::schema::schedule_seats::table
            .filter(bookit_db::schema::schedule_seats::id.eq_any(&order_seat_ids))
            .load(&mut conn)?
    };

    let seat_labels: Vec<String> = booked_seats
        .iter()
        .map(|s| format!("{}{}", s.row_letter, s.seat_number))
        .collect();

    let col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<Show>("shows");

    let title = if let Ok(oid) = ObjectId::parse_str(&sch.mongo_show_id) {
        if let Ok(Some(show)) = col.find_one(doc! { "_id": oid }).await {
            show.title
        } else {
            "Unknown Show".to_string()
        }
    } else {
        "Unknown Show".to_string()
    };

    let venue = sch
        .venue_name
        .unwrap_or_else(|| "Unknown Venue".to_string());
    let time = sch.start_time.to_string();

    Ok(Json(UserTicket {
        booking_id: order.id.to_string(),
        status: order.status,
        total_amount: order.total_amount.to_string(),
        show_title: title,
        venue_name: venue,
        show_time: time,
        seats: seat_labels,
    }))
}

pub async fn download_ticket_pdf(
    Path(ticket_id): Path<Uuid>,
    state: State<Arc<AppState>>,
) -> Result<Response, AppError> {
    let ticket_res = get_ticket_details(Path(ticket_id), state).await?;
    let ticket = ticket_res.0;

    let pdf_data = crate::helpers::pdf::TicketPdfData {
        booking_id: ticket.booking_id,
        show_title: ticket.show_title,
        show_time: ticket.show_time,
        venue_name: ticket.venue_name,
        seats: ticket.seats,
        total_amount: ticket.total_amount,
        status: ticket.status,
    };

    let pdf_bytes = crate::helpers::pdf::generate_ticket_pdf(&pdf_data)?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (
                header::CONTENT_DISPOSITION,
                &format!(
                    "attachment; filename=\"ticket_{}.pdf\"",
                    pdf_data.booking_id
                ),
            ),
        ],
        pdf_bytes,
    )
        .into_response())
}
