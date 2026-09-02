pub mod categories;
pub mod cities;
pub mod layouts;
pub mod password_reset;
pub mod schedules_v2;
pub mod shows;
pub mod stats;
pub mod upload;

use crate::api::state::AppState;
use axum::{
    Router,
    routing::{get, post},
};
use std::sync::Arc;

pub fn admin_routes(state: Arc<AppState>) -> Router {
    Router::new()
        // ── Upload ──────────────────────────────────────────────────────────
        .route("/upload", post(upload::upload_file))
        // ── Stats ──────────────────────────────────────────────────────────
        .route("/stats", get(stats::get_stats))
        // ── Categories (MongoDB) ─────────────────────────────────────────────
        .route(
            "/categories",
            get(categories::list_categories).post(categories::create_category),
        )
        .route(
            "/categories/:id",
            get(categories::get_category)
                .put(categories::update_category)
                .delete(categories::delete_category),
        )
        // ── Cities (Derived from Mongo & Postgres) ───────────────────────────
        .route("/cities", get(cities::list_distinct_cities))
        // ── Shows (MongoDB — new multi-type) ─────────────────────────────────
        .route("/shows", get(shows::list_shows).post(shows::create_show))
        .route(
            "/shows/:id",
            get(shows::get_show)
                .put(shows::update_show)
                .delete(shows::delete_show),
        )
        // ── Seat layouts (master templates) ──────────────────────────────────
        .route(
            "/layouts",
            get(layouts::list_layouts).post(layouts::create_layout),
        )
        .route(
            "/layouts/:id",
            get(layouts::get_layout)
                .put(layouts::update_layout)
                .delete(layouts::delete_layout),
        )
        .route(
            "/layouts/:id/seats",
            get(layouts::get_layout_seats).post(layouts::add_seats_to_layout),
        )
        // ── Schedules v2 (multi-type) ─────────────────────────────────────────
        .route(
            "/schedules",
            get(schedules_v2::list_schedules).post(schedules_v2::create_schedule),
        )
        .route(
            "/schedules/:id",
            get(schedules_v2::get_schedule)
                .put(schedules_v2::update_schedule)
                .delete(schedules_v2::delete_schedule),
        )
        .route(
            "/schedules/:id/seats",
            get(schedules_v2::get_schedule_seats)
                .post(schedules_v2::add_extra_seats)
                .put(schedules_v2::update_schedule_seats),
        )
        .route("/schedules/:id/start", post(schedules_v2::start_schedule))
        .route("/schedules/:id/close", post(schedules_v2::close_schedule))
        .with_state(state)
}
