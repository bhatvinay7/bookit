use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use redis_conn::RedisPool;
use serde_json::json;
use tracing::{info, warn};

#[derive(Clone)]
pub struct RedisCircuitBreaker {
    pub redis_pool: RedisPool,
    pub failure_threshold: u32,
    pub open_ttl_secs: i64,
}

impl RedisCircuitBreaker {
    pub fn new(redis_pool: RedisPool, failure_threshold: u32, open_ttl_secs: i64) -> Self {
        Self {
            redis_pool,
            failure_threshold,
            open_ttl_secs,
        }
    }

    /// Checks if a request is allowed to proceed for the given service.
    /// Returns `false` if the circuit breaker is OPEN and the open period has not elapsed.
    /// If the open period has elapsed, transitions to HALF_OPEN to allow a test probe request.
    pub async fn allow_request(&self, service: &str) -> bool {
        let mut cli = match self.redis_pool.get().await {
            Ok(c) => c,
            Err(e) => {
                warn!(
                    service = %service,
                    error = %e,
                    "Redis connection error in allow_request; defaulting to allow"
                );
                return true;
            }
        };

        let state_key = format!("cb:{}:state", service);
        let until_key = format!("cb:{}:open_until", service);

        let current_state: Option<String> = redis::cmd("GET")
            .arg(&state_key)
            .query_async(&mut *cli)
            .await
            .unwrap_or(None);

        let state_str = current_state.as_deref().unwrap_or("CLOSED");

        if state_str == "OPEN" {
            let open_until: i64 = redis::cmd("GET")
                .arg(&until_key)
                .query_async(&mut *cli)
                .await
                .unwrap_or(Some(0))
                .unwrap_or(0);

            let now = chrono::Utc::now().timestamp();
            if now < open_until {
                return false; // Fast fail without calling downstream server
            } else {
                // Open TTL expired, allow one probe request in HALF_OPEN state
                let _: () = redis::cmd("SET")
                    .arg(&state_key)
                    .arg("HALF_OPEN")
                    .query_async(&mut *cli)
                    .await
                    .unwrap_or(());
                info!(
                    service = %service,
                    "Circuit breaker open period elapsed; transitioned to HALF_OPEN for probe request"
                );
                return true;
            }
        }

        true
    }

    /// Records a successful request to the downstream service.
    /// Resets the failure counter to 0 and transitions HALF_OPEN or OPEN to CLOSED.
    pub async fn record_success(&self, service: &str) {
        let mut cli = match self.redis_pool.get().await {
            Ok(c) => c,
            Err(_) => return,
        };

        let state_key = format!("cb:{}:state", service);
        let failures_key = format!("cb:{}:failures", service);

        let current_state: Option<String> = redis::cmd("GET")
            .arg(&state_key)
            .query_async(&mut *cli)
            .await
            .unwrap_or(None);

        let state_str = current_state.as_deref().unwrap_or("CLOSED");
        if state_str != "CLOSED" {
            info!(
                service = %service,
                previous_state = %state_str,
                "Downstream service succeeded; resetting circuit breaker to CLOSED"
            );
        }

        let _: () = redis::cmd("DEL")
            .arg(&failures_key)
            .query_async(&mut *cli)
            .await
            .unwrap_or(());
        let _: () = redis::cmd("SET")
            .arg(&state_key)
            .arg("CLOSED")
            .query_async(&mut *cli)
            .await
            .unwrap_or(());
    }

    /// Records a failed request (network error or 5xx response) to the downstream service.
    /// Increments the failure counter. If failure threshold is reached or if in HALF_OPEN,
    /// trips the circuit breaker to OPEN for `open_ttl_secs`.
    pub async fn record_failure(&self, service: &str) {
        let mut cli = match self.redis_pool.get().await {
            Ok(c) => c,
            Err(_) => return,
        };

        let state_key = format!("cb:{}:state", service);
        let failures_key = format!("cb:{}:failures", service);
        let until_key = format!("cb:{}:open_until", service);

        let current_state: Option<String> = redis::cmd("GET")
            .arg(&state_key)
            .query_async(&mut *cli)
            .await
            .unwrap_or(None);
        let state_str = current_state.as_deref().unwrap_or("CLOSED");

        let failures: u32 = redis::cmd("INCR")
            .arg(&failures_key)
            .query_async(&mut *cli)
            .await
            .unwrap_or(1);

        if failures >= self.failure_threshold || state_str == "HALF_OPEN" {
            let open_until = chrono::Utc::now().timestamp() + self.open_ttl_secs;
            let _: () = redis::cmd("SET")
                .arg(&state_key)
                .arg("OPEN")
                .query_async(&mut *cli)
                .await
                .unwrap_or(());
            let _: () = redis::cmd("SET")
                .arg(&until_key)
                .arg(open_until)
                .query_async(&mut *cli)
                .await
                .unwrap_or(());
            warn!(
                service = %service,
                failures = failures,
                open_ttl_secs = self.open_ttl_secs,
                "Circuit breaker tripped to OPEN state"
            );
        }
    }

    /// Returns a standard 503 Service Unavailable response when the circuit breaker is OPEN
    /// or when a downstream server is unreachable/failing.
    pub fn service_busy_response() -> Response {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "message": "Service Not Available",
                "code": "CIRCUIT_OPEN"
            })),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use redis_conn::establish_pool;

    #[test]
    fn test_service_busy_response_status() {
        let response = RedisCircuitBreaker::service_busy_response();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn test_circuit_breaker_transitions() {
        let Ok(pool) = establish_pool().await else {
            return;
        };

        let cb = RedisCircuitBreaker::new(pool, 2, 60);
        let service = "test-service-unit";

        // Reset state
        cb.record_success(service).await;
        assert!(cb.allow_request(service).await);

        // Record failures to trip breaker
        cb.record_failure(service).await;
        assert!(cb.allow_request(service).await);

        cb.record_failure(service).await;
        // Breaker should now be OPEN
        assert!(!cb.allow_request(service).await);

        // Recording success resets breaker back to CLOSED
        cb.record_success(service).await;
        assert!(cb.allow_request(service).await);
    }
}
