ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_idempotency_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_user_idempotency_unique
    ON payment_requests(user_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_request_id_unique
    ON orders(payment_request_id);

ALTER TABLE outbox_events
    ADD COLUMN processing_at TIMESTAMPTZ,
    ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN last_error TEXT,
    ADD COLUMN dead_lettered_at TIMESTAMPTZ;

CREATE INDEX outbox_events_dispatch_idx
    ON outbox_events(next_attempt_at, created_at)
    WHERE published_at IS NULL AND dead_lettered_at IS NULL;
