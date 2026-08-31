use std::str::FromStr;

use bigdecimal::BigDecimal;
use bookit_db::{
    db::DbPool,
    models::{NewOrder, NewOutboxEvent, NewUserAudit, SeatStatus},
    schema::{
        orders::dsl as od, outbox_events::dsl as oe, schedule_seats::dsl as ss, tickets::dsl as tk,
        user_audits::dsl as ua,
    },
};
use chrono::Utc;
use diesel::prelude::*;
use serde_json::json;
use uuid::Uuid;

pub struct CheckoutCommit {
    pub order_id: Uuid,
    pub payment_request_id: Uuid,
    pub user_id: i32,
    pub schedule_id: i32,
    pub seat_ids: Vec<i32>,
    pub total_amount: String,
    pub razorpay_order_id: String,
    pub razorpay_payment_id: Option<String>,
}

pub struct CancellationCommit {
    pub order_id: Uuid,
    pub user_id: i32,
    pub schedule_id: i32,
    pub seat_ids: Vec<i32>,
    pub amount: String,
}

pub fn order_exists(pool: &DbPool, payment_request_id: Uuid) -> bool {
    pool.get()
        .ok()
        .and_then(|mut conn| {
            od::orders
                .filter(od::payment_request_id.eq(payment_request_id))
                .select(od::id)
                .first::<Uuid>(&mut conn)
                .optional()
                .ok()
                .flatten()
        })
        .is_some()
}

pub fn commit_checkout(pool: &DbPool, command: CheckoutCommit) -> QueryResult<()> {
    let mut conn = pool
        .get()
        .map_err(|error| diesel::result::Error::QueryBuilderError(Box::new(error)))?;
    conn.transaction(|conn| {
        diesel::update(ss::schedule_seats.filter(ss::id.eq_any(&command.seat_ids)))
            .set(ss::status.eq(SeatStatus::Booked))
            .execute(conn)?;

        let amount = BigDecimal::from_str(&command.total_amount).unwrap_or_default();
        diesel::insert_into(od::orders)
            .values(&NewOrder {
                id: command.order_id,
                payment_request_id: command.payment_request_id,
                user_id: command.user_id,
                schedule_id: command.schedule_id,
                seat_ids: json!(command.seat_ids),
                total_amount: amount.clone(),
                razorpay_order_id: command.razorpay_order_id,
                razorpay_payment_id: command.razorpay_payment_id,
                status: "completed".into(),
            })
            .execute(conn)?;

        diesel::sql_query("UPDATE payment_requests SET status = CAST('succeeded' AS payment_request_status), failure_reason = NULL, updated_at = NOW() WHERE id = $1")
            .bind::<diesel::sql_types::Uuid, _>(command.payment_request_id)
            .execute(conn)?;

        diesel::insert_into(ua::user_audits)
            .values(&NewUserAudit {
                id: Uuid::new_v4(),
                user_id: command.user_id,
                action: "order_completed".into(),
                order_id: command.order_id,
                amount,
                details: json!({ "seat_ids": command.seat_ids }),
            })
            .execute(conn)?;

        diesel::insert_into(oe::outbox_events)
            .values(&NewOutboxEvent {
                id: Uuid::new_v4(),
                aggregate_type: "Order".into(),
                aggregate_id: command.order_id,
                event_type: "OrderCompleted".into(),
                payload: json!({
                    "order_id": command.order_id.to_string(),
                    "user_id": command.user_id,
                    "schedule_id": command.schedule_id,
                    "seat_ids": command.seat_ids,
                    "amount": command.total_amount,
                }),
                created_at: Utc::now(),
                published_at: None,
                attempts: 0,
                processing_at: None,
                next_attempt_at: Utc::now(),
                last_error: None,
                dead_lettered_at: None,
            })
            .execute(conn)?;
        Ok(())
    })
}

pub fn commit_cancellation(pool: &DbPool, command: CancellationCommit) -> QueryResult<()> {
    let mut conn = pool
        .get()
        .map_err(|error| diesel::result::Error::QueryBuilderError(Box::new(error)))?;
    conn.transaction(|conn| {
        diesel::update(ss::schedule_seats.filter(ss::id.eq_any(&command.seat_ids)))
            .set(ss::status.eq(SeatStatus::Available))
            .execute(conn)?;
        diesel::update(od::orders.filter(od::id.eq(command.order_id)))
            .set(od::status.eq("refunded"))
            .execute(conn)?;
        diesel::update(tk::tickets.filter(tk::order_id.eq(command.order_id)))
            .set(tk::status.eq("cancelled"))
            .execute(conn)?;

        let amount = BigDecimal::from_str(&command.amount).unwrap_or_default();
        diesel::insert_into(ua::user_audits)
            .values(&NewUserAudit {
                id: Uuid::new_v4(),
                user_id: command.user_id,
                action: "ticket_cancelled".into(),
                order_id: command.order_id,
                amount,
                details: json!({ "seat_ids": command.seat_ids }),
            })
            .execute(conn)?;

        diesel::insert_into(oe::outbox_events)
            .values(&NewOutboxEvent {
                id: Uuid::new_v4(),
                aggregate_type: "Order".into(),
                aggregate_id: command.order_id,
                event_type: "TicketCancelled".into(),
                payload: json!({
                    "order_id": command.order_id.to_string(),
                    "user_id": command.user_id,
                    "schedule_id": command.schedule_id,
                    "seat_ids": command.seat_ids,
                    "amount": command.amount,
                }),
                created_at: Utc::now(),
                published_at: None,
                attempts: 0,
                processing_at: None,
                next_attempt_at: Utc::now(),
                last_error: None,
                dead_lettered_at: None,
            })
            .execute(conn)?;
        Ok(())
    })
}
