import re

with open("apps/search-server/src/stream.rs", "r") as f:
    content = f.read()

new_content = """use anyhow::{Result, anyhow};
use std::{sync::Arc, time::Duration};

use crate::{outbox, types::AppState};

const IDLE_POLL_INTERVAL: Duration = Duration::from_millis(250);

pub async fn watch_search_outbox(state: Arc<AppState>) {
    tracing::info!("Draining durable search outbox for Elasticsearch changes");

    loop {
        match outbox::ensure_collections(&state.mongo_database).await {
            Ok(()) => break,
            Err(error) => {
                tracing::error!(%error, "MongoDB search outbox setup failed; retrying");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }

    let mut consecutive_failures = 0;

    loop {
        let event = match outbox::claim_next(&state.mongo_database).await {
            Ok(event) => event,
            Err(error) => {
                tracing::error!(%error, "MongoDB search outbox claim failed; retrying");
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };

        let Some(event) = event else {
            consecutive_failures = 0; // reset on idle
            tokio::time::sleep(IDLE_POLL_INTERVAL).await;
            continue;
        };

        let carrier = bookit_telemetry::payload_carrier(&serde_json::json!({
            "_trace_context": event.trace_context,
        }));
        let span = bookit_telemetry::operation_span(
            "search outbox process",
            "consumer",
            Some(bookit_telemetry::extract_context(&carrier)),
        );
        let result = bookit_telemetry::in_result_span(span, apply_event(&state, &event)).await;

        match result {
            Ok(()) => {
                consecutive_failures = 0;
                if let Err(error) = outbox::mark_indexed(&state.mongo_database, &event).await {
                    tracing::error!(sequence = event.sequence, %error, "Elasticsearch write succeeded but search outbox acknowledgement failed; it will be safely replayed");
                }
            }
            Err(error) => {
                consecutive_failures += 1;
                let delay_seconds = 2_u64.pow(consecutive_failures.clamp(1, 8) as u32).min(300);
                tracing::warn!(sequence = event.sequence, show_id = %event.show_id, attempts = consecutive_failures, delay = delay_seconds, %error, "Elasticsearch unavailable; retaining search outbox event for replay");
                tokio::time::sleep(Duration::from_secs(delay_seconds)).await;
            }
        }
    }
}

async fn apply_event(state: &AppState, event: &outbox::ClaimedSearchEvent) -> Result<()> {
    let document_url = format!("{}/shows/_doc/{}", state.es_url, event.show_id);
    match event.operation.as_str() {
        "upsert" => {
            let document = event
                .document
                .as_ref()
                .ok_or_else(|| anyhow!("upsert search outbox event has no document"))?;
            state
                .es_client
                .put(&document_url)
                .json(document)
                .send()
                .await?
                .error_for_status()?;
            tracing::info!(sequence = event.sequence, show_id = %event.show_id, "Indexed search outbox event");
            Ok(())
        }
        "delete" => {
            let response = state.es_client.delete(&document_url).send().await?;
            // DELETE is idempotent: a 404 means a prior retry already removed
            // the document, so treating it as success cannot resurrect data.
            if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND
            {
                tracing::info!(sequence = event.sequence, show_id = %event.show_id, "Deleted search outbox document");
                Ok(())
            } else {
                Err(response.error_for_status().unwrap_err().into())
            }
        }
        other => Err(anyhow!("unsupported search outbox operation {other}")),
    }
}
"""

with open("apps/search-server/src/stream.rs", "w") as f:
    f.write(new_content)

