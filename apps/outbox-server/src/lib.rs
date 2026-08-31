pub mod publisher;
pub mod routing;
pub mod store;

use std::time::Duration;

use anyhow::Result;
use bookit_db::db::DbPool;
use lapin::Channel;
use tracing::warn;

pub const MAX_ATTEMPTS: i32 = 10;
const POLL_INTERVAL: Duration = Duration::from_millis(500);

pub fn retry_delay_seconds(attempts: i32) -> i64 {
    2_i64.pow(attempts.clamp(1, 8) as u32).min(300)
}

pub fn should_dead_letter(attempts: i32, permanent_failure: bool) -> bool {
    permanent_failure && attempts >= MAX_ATTEMPTS
}

pub fn parse_payment_message_ttl(value: Option<&str>) -> u64 {
    value
        .and_then(|value| value.parse().ok())
        .filter(|value| *value >= 1_000)
        .unwrap_or(300_000)
}

pub async fn run(pool: DbPool, channel: Channel) -> Result<()> {
    loop {
        let claim_pool = pool.clone();
        let event = tokio::task::spawn_blocking(move || store::claim_next(&claim_pool)).await??;
        let Some(event) = event else {
            tokio::time::sleep(POLL_INTERVAL).await;
            continue;
        };

        match publisher::publish(&channel, &event).await {
            Ok(()) => {
                let update_pool = pool.clone();
                tokio::task::spawn_blocking(move || store::mark_published(&update_pool, &event))
                    .await??;
            }
            Err(error) => {
                warn!(event_id = %event.id, attempts = event.attempts, %error, "outbox publish failed");
                let update_pool = pool.clone();
                let message = error.to_string();
                let permanent_failure = routing::route_for(&event.event_type).is_none();
                tokio::task::spawn_blocking(move || {
                    store::mark_failed(&update_pool, &event, &message, permanent_failure)
                })
                .await??;
                return Err(error);
            }
        }
    }
}
