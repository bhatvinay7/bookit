// @generated automatically by Diesel CLI.

pub mod sql_types {
    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "booking_status"))]
    pub struct BookingStatus;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "layout_seat_class"))]
    pub struct LayoutSeatClass;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "payment_request_status"))]
    pub struct PaymentRequestStatus;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "seat_source"))]
    pub struct SeatSource;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "seat_status"))]
    pub struct SeatStatus;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "show_type"))]
    pub struct ShowType;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "time_slot"))]
    pub struct TimeSlot;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "user_role"))]
    pub struct UserRole;
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::BookingStatus;

    bookings (id) {
        id -> Int4,
        user_id -> Int4,
        status -> BookingStatus,
        total_amount -> Numeric,
        created_at -> Timestamp,
        schedule_id -> Nullable<Int4>,
    }
}

diesel::table! {
    orders (id) {
        id -> Uuid,
        payment_request_id -> Uuid,
        user_id -> Int4,
        schedule_id -> Int4,
        seat_ids -> Jsonb,
        total_amount -> Numeric,
        #[max_length = 128]
        razorpay_order_id -> Varchar,
        #[max_length = 128]
        razorpay_payment_id -> Nullable<Varchar>,
        #[max_length = 32]
        status -> Varchar,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    outbox_events (id) {
        id -> Uuid,
        #[max_length = 64]
        aggregate_type -> Varchar,
        aggregate_id -> Uuid,
        #[max_length = 128]
        event_type -> Varchar,
        payload -> Jsonb,
        created_at -> Timestamptz,
        published_at -> Nullable<Timestamptz>,
        attempts -> Int4,
        processing_at -> Nullable<Timestamptz>,
        next_attempt_at -> Timestamptz,
        last_error -> Nullable<Text>,
        dead_lettered_at -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::PaymentRequestStatus;

    payment_requests (id) {
        id -> Uuid,
        #[max_length = 128]
        idempotency_key -> Varchar,
        user_id -> Int4,
        schedule_id -> Int4,
        seat_ids -> Jsonb,
        status -> PaymentRequestStatus,
        booking_id -> Nullable<Int4>,
        failure_reason -> Nullable<Text>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::SeatSource;
    use super::sql_types::LayoutSeatClass;
    use super::sql_types::SeatStatus;

    schedule_seats (id) {
        id -> Int4,
        schedule_id -> Int4,
        layout_seat_id -> Nullable<Int4>,
        source -> SeatSource,
        #[max_length = 4]
        row_letter -> Varchar,
        seat_number -> Int4,
        seat_class -> LayoutSeatClass,
        price -> Numeric,
        status -> SeatStatus,
        booking_id -> Nullable<Int4>,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::ShowType;
    use super::sql_types::TimeSlot;

    schedules (id) {
        id -> Int4,
        #[max_length = 24]
        mongo_show_id -> Varchar,
        show_type -> ShowType,
        layout_id -> Nullable<Int4>,
        start_time -> Timestamptz,
        booking_open_at -> Timestamptz,
        created_at -> Timestamptz,
        deleted_at -> Nullable<Timestamptz>,
        #[max_length = 255]
        venue_name -> Nullable<Varchar>,
        venue_address -> Nullable<Text>,
        #[max_length = 100]
        venue_city -> Nullable<Varchar>,
        #[max_length = 100]
        venue_state -> Nullable<Varchar>,
        date -> Date,
        slot -> TimeSlot,
        end_time -> Timestamptz,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::LayoutSeatClass;

    seat_layout_seats (id) {
        id -> Int4,
        layout_id -> Int4,
        #[max_length = 4]
        row_letter -> Varchar,
        seat_number -> Int4,
        seat_class -> LayoutSeatClass,
        x_pos -> Nullable<Int4>,
        y_pos -> Nullable<Int4>,
        #[max_length = 100]
        block_name -> Nullable<Varchar>,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::ShowType;

    seat_layouts (id) {
        id -> Int4,
        #[max_length = 120]
        name -> Varchar,
        show_type -> ShowType,
        description -> Nullable<Text>,
        created_at -> Timestamp,
        deleted_at -> Nullable<Timestamptz>,
        #[max_length = 50]
        layout_shape -> Varchar,
    }
}

diesel::table! {
    tickets (id) {
        id -> Uuid,
        order_id -> Uuid,
        user_id -> Int4,
        schedule_id -> Int4,
        seat_ids -> Jsonb,
        #[max_length = 512]
        pdf_url -> Varchar,
        #[max_length = 32]
        status -> Varchar,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    user_audits (id) {
        id -> Uuid,
        user_id -> Int4,
        #[max_length = 64]
        action -> Varchar,
        order_id -> Uuid,
        amount -> Numeric,
        details -> Jsonb,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::UserRole;

    users (id) {
        id -> Int4,
        email -> Varchar,
        password_hash -> Varchar,
        role -> UserRole,
        created_at -> Timestamp,
    }
}

diesel::joinable!(bookings -> schedules (schedule_id));
diesel::joinable!(bookings -> users (user_id));
diesel::joinable!(orders -> payment_requests (payment_request_id));
diesel::joinable!(orders -> schedules (schedule_id));
diesel::joinable!(orders -> users (user_id));
diesel::joinable!(payment_requests -> bookings (booking_id));
diesel::joinable!(payment_requests -> schedules (schedule_id));
diesel::joinable!(payment_requests -> users (user_id));
diesel::joinable!(schedule_seats -> bookings (booking_id));
diesel::joinable!(schedule_seats -> schedules (schedule_id));
diesel::joinable!(schedule_seats -> seat_layout_seats (layout_seat_id));
diesel::joinable!(schedules -> seat_layouts (layout_id));
diesel::joinable!(seat_layout_seats -> seat_layouts (layout_id));
diesel::joinable!(tickets -> orders (order_id));
diesel::joinable!(tickets -> schedules (schedule_id));
diesel::joinable!(tickets -> users (user_id));
diesel::joinable!(user_audits -> orders (order_id));
diesel::joinable!(user_audits -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    bookings,
    orders,
    outbox_events,
    payment_requests,
    schedule_seats,
    schedules,
    seat_layout_seats,
    seat_layouts,
    tickets,
    user_audits,
    users,
);
