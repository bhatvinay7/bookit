use crate::helpers::errors::AppError;
use axum::{extract::Request, middleware::Next, response::IntoResponse};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

static RATE_LIMITER: Mutex<Option<HashMap<String, (u32, Instant)>>> = Mutex::new(None);

pub async fn rate_limiter(req: Request, next: Next) -> Result<impl IntoResponse, AppError> {
    let ip = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    {
        let mut map_guard = RATE_LIMITER.lock().unwrap();
        if map_guard.is_none() {
            *map_guard = Some(HashMap::new());
        }
        let map = map_guard.as_mut().unwrap();

        let now = Instant::now();
        let (count, timestamp) = map.entry(ip.clone()).or_insert((0, now));

        if now.duration_since(*timestamp) > Duration::from_secs(3600) {
            *count = 0;
            *timestamp = now;
        }

        *count += 1;

        if *count > 500 {
            return Err(AppError::TooManyRequests(
                "Rate limit exceeded (500 requests per hour)".to_string(),
            ));
        }
    }

    Ok(next.run(req).await)
}
