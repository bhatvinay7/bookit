use diesel::prelude::*;
use serde::{Deserialize, Serialize};

// ─── Existing insertables (unchanged) ────────────────────────────────────────

#[derive(Insertable, Deserialize, Serialize, Debug)]
#[diesel(table_name = crate::schema::users)]
pub struct NewUser {
    pub email: String,
    pub password_hash: String,
    pub role: crate::models::UserRole,
}

// ─── New insertables ──────────────────────────────────────────────────────────

#[derive(Insertable, Deserialize, Serialize, Debug)]
#[diesel(table_name = crate::schema::seat_layouts)]
pub struct NewSeatLayout {
    pub name: String,
    pub show_type: crate::models::ShowType,
    pub description: Option<String>,
    pub layout_shape: String,
}

#[derive(Insertable, Deserialize, Serialize, Debug)]
#[diesel(table_name = crate::schema::seat_layout_seats)]
pub struct NewSeatLayoutSeat {
    pub layout_id: i32,
    pub row_letter: String,
    pub seat_number: i32,
    pub seat_class: crate::models::LayoutSeatClass,
    pub x_pos: Option<i32>,
    pub y_pos: Option<i32>,
    pub block_name: Option<String>,
}

#[derive(Insertable, Deserialize, Serialize, Debug)]
#[diesel(table_name = crate::schema::schedules)]
pub struct NewSchedule {
    pub mongo_show_id: String,
    pub show_type: crate::models::ShowType,
    pub layout_id: Option<i32>,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: chrono::DateTime<chrono::Utc>,
    pub booking_open_at: chrono::DateTime<chrono::Utc>,
    pub date: chrono::NaiveDate,
    pub slot: crate::models::TimeSlot,
    pub venue_name: Option<String>,
    pub venue_address: Option<String>,
    pub venue_city: Option<String>,
    pub venue_state: Option<String>,
}

/// A seat row copied from the layout (source = 'base') or added by admin (source = 'extra')
#[derive(Insertable, Deserialize, Serialize, Debug)]
#[diesel(table_name = crate::schema::schedule_seats)]
pub struct NewScheduleSeat {
    pub schedule_id: i32,
    pub seat_index: i32,
    pub layout_seat_id: Option<i32>,
    pub source: crate::models::SeatSource,
    pub row_letter: String,
    pub seat_number: i32,
    pub seat_class: crate::models::LayoutSeatClass,
    pub price: bigdecimal::BigDecimal,
}

/// Extra seats added by admin to an existing schedule
#[derive(AsChangeset, Deserialize, Serialize, Debug)]
#[diesel(table_name = crate::schema::schedule_seats)]
pub struct UpdateScheduleSeatStatus {
    pub status: Option<crate::models::SeatStatus>,
    pub booking_id: Option<i32>,
}
