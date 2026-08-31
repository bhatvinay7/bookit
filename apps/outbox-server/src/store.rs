use anyhow::{Context, Result};
use bookit_db::db::DbPool;
use diesel::{
    Connection, OptionalExtension, RunQueryDsl, sql_query,
    sql_types::{Integer, Jsonb, Text, Uuid as SqlUuid},
};
use serde_json::Value;
use uuid::Uuid;

use crate::{retry_delay_seconds, should_dead_letter};

#[derive(Debug, diesel::QueryableByName)]
pub struct ClaimedEvent {
    #[diesel(sql_type = SqlUuid)]
    pub id: Uuid,
    #[diesel(sql_type = SqlUuid)]
    pub aggregate_id: Uuid,
    #[diesel(sql_type = Text)]
    pub event_type: String,
    #[diesel(sql_type = Jsonb)]
    pub payload: Value,
    #[diesel(sql_type = Integer)]
    pub attempts: i32,
}

pub fn claim_next(pool: &DbPool) -> Result<Option<ClaimedEvent>> {
    let mut conn = pool.get().context("database pool unavailable")?;
    sql_query(
        "WITH candidate AS (
            SELECT id FROM outbox_events
            WHERE published_at IS NULL
              AND dead_lettered_at IS NULL
              AND next_attempt_at <= NOW()
              AND (processing_at IS NULL OR processing_at < NOW() - INTERVAL '5 minutes')
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        UPDATE outbox_events o
        SET processing_at = NOW(), attempts = attempts + 1
        FROM candidate
        WHERE o.id = candidate.id
        RETURNING o.id, o.aggregate_id, o.event_type, o.payload, o.attempts",
    )
    .get_result::<ClaimedEvent>(&mut conn)
    .optional()
    .context("failed to claim outbox event")
}

pub fn mark_published(pool: &DbPool, event: &ClaimedEvent) -> Result<()> {
    let mut conn = pool.get().context("database pool unavailable")?;
    conn.transaction::<_, diesel::result::Error, _>(|conn| {
        sql_query("UPDATE outbox_events SET published_at = NOW(), processing_at = NULL, last_error = NULL WHERE id = $1")
            .bind::<SqlUuid, _>(event.id)
            .execute(conn)?;
        if event.event_type == "payment.requested" {
            sql_query("UPDATE payment_requests SET status = CAST('processing' AS payment_request_status), updated_at = NOW() WHERE id = $1 AND status = CAST('pending' AS payment_request_status)")
                .bind::<SqlUuid, _>(event.aggregate_id)
                .execute(conn)?;
        }
        Ok(())
    })?;
    Ok(())
}

pub fn mark_failed(
    pool: &DbPool,
    event: &ClaimedEvent,
    message: &str,
    permanent_failure: bool,
) -> Result<()> {
    let mut conn = pool.get().context("database pool unavailable")?;
    conn.transaction::<_, diesel::result::Error, _>(|conn| {
        if should_dead_letter(event.attempts, permanent_failure) {
            sql_query("UPDATE outbox_events SET dead_lettered_at = NOW(), processing_at = NULL, last_error = $2 WHERE id = $1")
                .bind::<SqlUuid, _>(event.id)
                .bind::<Text, _>(message)
                .execute(conn)?;
            if event.event_type == "payment.requested" {
                sql_query("UPDATE payment_requests SET status = CAST('failed' AS payment_request_status), failure_reason = $2, updated_at = NOW() WHERE id = $1 AND status <> CAST('succeeded' AS payment_request_status)")
                    .bind::<SqlUuid, _>(event.aggregate_id)
                    .bind::<Text, _>(message)
                    .execute(conn)?;
            }
        } else {
            let delay = retry_delay_seconds(event.attempts);
            sql_query("UPDATE outbox_events SET processing_at = NULL, next_attempt_at = NOW() + ($2 * INTERVAL '1 second'), last_error = $3 WHERE id = $1")
                .bind::<SqlUuid, _>(event.id)
                .bind::<diesel::sql_types::BigInt, _>(delay)
                .bind::<Text, _>(message)
                .execute(conn)?;
        }
        Ok(())
    })?;
    Ok(())
}
