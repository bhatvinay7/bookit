pub mod categories;
pub mod movies;
pub mod payments;
pub mod schedules_v2;
pub mod shows;
pub mod tickets;

use crate::api::state::AppState;
use crate::middleware::rate_limit::rate_limiter;
use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use std::sync::Arc;

pub fn user_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/payments", post(payments::request_payment))
        .route("/payments/razorpay-order", post(payments::create_razorpay_order))
        .route(
            "/payments/checkout-summary",
            post(payments::get_checkout_summary),
        )
        .route("/orders/:id/cancel", post(payments::cancel_order))
        .route("/tickets/:id", get(tickets::get_ticket_details))
        .route("/tickets/:id/pdf", get(tickets::download_ticket_pdf))
        .route("/me/tickets", get(tickets::get_user_tickets))
        .route("/schedules_v2", get(schedules_v2::list_active_schedules))
        .route("/schedules_v2/:id", get(schedules_v2::get_schedule_details))
        .route(
            "/schedules_v2/:id/seats",
            get(schedules_v2::get_schedule_seats),
        )
        .route(
            "/schedules_v2/show/:show_id",
            get(schedules_v2::get_schedules_for_show),
        )
        .route("/shows", get(shows::list_shows))
        .route("/shows/grid", get(shows::list_shows_grid))
        .route("/shows/:id", get(shows::get_show_details))
        .route("/movies", get(movies::get_movies))
        .route("/categories", get(categories::list_categories))
        .route("/cities", get(shows::get_cities))
        .layer(middleware::from_fn(rate_limiter))
        .with_state(state)
}
