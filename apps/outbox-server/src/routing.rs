#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Route {
    pub exchange: &'static str,
    pub routing_key: &'static str,
}

pub fn route_for(event_type: &str) -> Option<Route> {
    match event_type {
        "payment.requested" | "payment.cancellation_requested" => Some(Route {
            exchange: "",
            routing_key: "payment_processing",
        }),
        "OrderCompleted" | "TicketCancelled" => Some(Route {
            exchange: "booking_events_exchange",
            routing_key: "",
        }),
        _ => None,
    }
}
