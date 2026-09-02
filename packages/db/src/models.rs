use crate::schema::{
    bookings, orders, outbox_events, payment_requests, schedule_seats, schedules,
    seat_layout_seats, seat_layouts, tickets, user_audits, users,
};
use bigdecimal::BigDecimal;
use chrono::{DateTime, NaiveDateTime, Utc};
use diesel::prelude::*;
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use uuid::Uuid;

// ─── Existing enums (unchanged) ───────────────────────────────────────────────

#[derive(DbEnum, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::UserRole"]
pub enum UserRole {
    User,
    Admin,
}

#[derive(DbEnum, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::BookingStatus"]
pub enum BookingStatus {
    Pending,
    Confirmed,
    Cancelled,
}

#[derive(DbEnum, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::SeatStatus"]
pub enum SeatStatus {
    Available,
    Locked,
    Booked,
}

// ─── New enums ────────────────────────────────────────────────────────────────

#[derive(DbEnum, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::ShowType"]
pub enum ShowType {
    #[db_rename = "Movie"]
    Movie,
    #[db_rename = "Concert"]
    Concert,
    #[db_rename = "Event"]
    Event,
    #[db_rename = "GameEvent"]
    GameEvent,
}

#[derive(DbEnum, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::LayoutSeatClass"]
pub enum LayoutSeatClass {
    #[db_rename = "Standard"]
    Standard,
    #[db_rename = "Premium"]
    Premium,
    #[db_rename = "VIP"]
    #[serde(rename = "VIP")]
    Vip,
    #[db_rename = "GA"]
    #[serde(rename = "GA")]
    Ga,
}

#[derive(DbEnum, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::SeatSource"]
#[serde(rename_all = "lowercase")]
pub enum SeatSource {
    Base,
    Extra,
}

#[derive(DbEnum, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::TimeSlot"]
pub enum TimeSlot {
    #[db_rename = "Morning"]
    Morning,
    #[db_rename = "Afternoon"]
    Afternoon,
    #[db_rename = "Evening"]
    Evening,
    #[db_rename = "Night"]
    Night,
}

// ─── Existing models (unchanged) ──────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = users)]
pub struct User {
    pub id: i32,
    pub email: String,
    pub password_hash: String,
    pub role: UserRole,
    pub created_at: NaiveDateTime,
}

#[derive(
    Queryable, Selectable, Identifiable, Associations, Debug, Clone, Serialize, Deserialize,
)]
#[diesel(belongs_to(User))]
#[diesel(table_name = bookings)]
pub struct Booking {
    pub id: i32,
    pub user_id: i32,
    pub status: BookingStatus,
    pub total_amount: BigDecimal,
    pub created_at: NaiveDateTime,
    pub schedule_id: Option<i32>,
}

// ─── New models ───────────────────────────────────────────────────────────────

/// Master reusable seat layout template (admin designs once, reused per schedule)
#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = seat_layouts)]
pub struct SeatLayout {
    pub id: i32,
    pub name: String,
    pub show_type: ShowType,
    pub description: Option<String>,
    pub created_at: NaiveDateTime,
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    pub layout_shape: String,
}

/// Individual seat definition inside a layout template
#[derive(
    Queryable, Selectable, Identifiable, Associations, Debug, Clone, Serialize, Deserialize,
)]
#[diesel(belongs_to(SeatLayout, foreign_key = layout_id))]
#[diesel(table_name = seat_layout_seats)]
pub struct SeatLayoutSeat {
    pub id: i32,
    pub layout_id: i32,
    pub row_letter: String,
    pub seat_number: i32,
    pub seat_class: LayoutSeatClass,
    pub x_pos: Option<i32>,
    pub y_pos: Option<i32>,
    pub block_name: Option<String>,
}

/// A specific scheduled showing of an event mapping to a Mongo document
#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = schedules)]
pub struct Schedule {
    pub id: i32,
    pub mongo_show_id: String,
    pub show_type: ShowType,
    pub layout_id: Option<i32>,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub booking_open_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    pub venue_name: Option<String>,
    pub venue_address: Option<String>,
    pub venue_city: Option<String>,
    pub venue_state: Option<String>,
    pub date: chrono::NaiveDate,
    pub slot: TimeSlot,
    pub end_time: chrono::DateTime<chrono::Utc>,
}

/// A seat instance for a specific schedule (copied from layout + admin extras)
#[derive(
    Queryable, Selectable, Identifiable, Associations, Debug, Clone, Serialize, Deserialize,
)]
#[diesel(belongs_to(Schedule))]
#[diesel(table_name = schedule_seats)]
pub struct ScheduleSeat {
    pub id: i32,
    pub schedule_id: i32,
    pub seat_index: i32,
    pub layout_seat_id: Option<i32>,
    pub source: SeatSource,
    pub row_letter: String,
    pub seat_number: i32,
    pub seat_class: LayoutSeatClass,
    pub price: BigDecimal,
    pub status: SeatStatus,
    pub booking_id: Option<i32>,
}

// ─── Rich response types (not mapped to tables) ───────────────────────────────

/// Schedule + aggregated seat stats (returned to API callers)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleWithStats {
    pub id: i32,
    pub mongo_show_id: String,
    pub show_type: ShowType,
    pub layout_id: i32,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub booking_open_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    pub venue_name: Option<String>,
    pub venue_address: Option<String>,
    pub venue_city: Option<String>,
    pub venue_state: Option<String>,
    pub total_seats: i64,
    pub available_seats: i64,
    pub booked_seats: i64,
    /// Seconds until booking opens (negative = already open)
    pub seconds_until_booking_open: i64,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = orders)]
pub struct Order {
    pub id: Uuid,
    pub payment_request_id: Uuid,
    pub user_id: i32,
    pub schedule_id: i32,
    pub seat_ids: JsonValue,
    pub total_amount: BigDecimal,
    pub razorpay_order_id: String,
    pub razorpay_payment_id: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = orders)]
pub struct NewOrder {
    pub id: Uuid,
    pub payment_request_id: Uuid,
    pub user_id: i32,
    pub schedule_id: i32,
    pub seat_ids: JsonValue,
    pub total_amount: BigDecimal,
    pub razorpay_order_id: String,
    pub razorpay_payment_id: Option<String>,
    pub status: String,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = tickets)]
pub struct Ticket {
    pub id: Uuid,
    pub order_id: Uuid,
    pub user_id: i32,
    pub schedule_id: i32,
    pub seat_ids: JsonValue,
    pub pdf_url: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = tickets)]
pub struct NewTicket {
    pub id: Uuid,
    pub order_id: Uuid,
    pub user_id: i32,
    pub schedule_id: i32,
    pub seat_ids: JsonValue,
    pub pdf_url: String,
    pub status: String,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = user_audits)]
pub struct UserAudit {
    pub id: Uuid,
    pub user_id: i32,
    pub action: String,
    pub order_id: Uuid,
    pub amount: BigDecimal,
    pub details: JsonValue,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = user_audits)]
pub struct NewUserAudit {
    pub id: Uuid,
    pub user_id: i32,
    pub action: String,
    pub order_id: Uuid,
    pub amount: BigDecimal,
    pub details: JsonValue,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = payment_requests)]
pub struct PaymentRequest {
    pub id: Uuid,
    pub idempotency_key: String,
    pub user_id: i32,
    pub schedule_id: i32,
    pub seat_ids: JsonValue,
    pub status: String,
    pub booking_id: Option<i32>,
    pub failure_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = outbox_events)]
pub struct OutboxEvent {
    pub id: Uuid,
    pub aggregate_type: String,
    pub aggregate_id: Uuid,
    pub event_type: String,
    pub payload: JsonValue,
    pub created_at: DateTime<Utc>,
    pub published_at: Option<DateTime<Utc>>,
    pub attempts: i32,
    pub processing_at: Option<DateTime<Utc>>,
    pub next_attempt_at: DateTime<Utc>,
    pub last_error: Option<String>,
    pub dead_lettered_at: Option<DateTime<Utc>>,
}

#[derive(Insertable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = outbox_events)]
pub struct NewOutboxEvent {
    pub id: Uuid,
    pub aggregate_type: String,
    pub aggregate_id: Uuid,
    pub event_type: String,
    pub payload: JsonValue,
    pub created_at: DateTime<Utc>,
    pub published_at: Option<DateTime<Utc>>,
    pub attempts: i32,
    pub processing_at: Option<DateTime<Utc>>,
    pub next_attempt_at: DateTime<Utc>,
    pub last_error: Option<String>,
    pub dead_lettered_at: Option<DateTime<Utc>>,
}
