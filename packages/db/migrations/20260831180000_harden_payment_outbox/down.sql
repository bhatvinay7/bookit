DROP INDEX IF EXISTS outbox_events_dispatch_idx;

ALTER TABLE outbox_events
    DROP COLUMN IF EXISTS dead_lettered_at,
    DROP COLUMN IF EXISTS last_error,
    DROP COLUMN IF EXISTS next_attempt_at,
    DROP COLUMN IF EXISTS processing_at;

DROP INDEX IF EXISTS orders_payment_request_id_unique;
DROP INDEX IF EXISTS payment_requests_user_idempotency_unique;

ALTER TABLE payment_requests
    ADD CONSTRAINT payment_requests_idempotency_key_key UNIQUE (idempotency_key);
