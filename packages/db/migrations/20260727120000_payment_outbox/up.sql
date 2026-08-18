CREATE TYPE payment_request_status AS ENUM ('pending', 'processing', 'succeeded', 'failed');

CREATE TABLE payment_requests (
    id UUID PRIMARY KEY,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    schedule_id INTEGER NOT NULL REFERENCES schedules(id),
    seat_ids JSONB NOT NULL,
    status payment_request_status NOT NULL DEFAULT 'pending',
    booking_id INTEGER REFERENCES bookings(id),
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX payment_requests_user_idempotency_idx ON payment_requests(user_id, idempotency_key);
CREATE INDEX outbox_events_unpublished_idx ON outbox_events(created_at) WHERE published_at IS NULL;
