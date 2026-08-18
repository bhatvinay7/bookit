CREATE TABLE orders (
    id UUID PRIMARY KEY,
    payment_request_id UUID NOT NULL REFERENCES payment_requests(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    schedule_id INTEGER NOT NULL REFERENCES schedules(id),
    seat_ids JSONB NOT NULL,
    total_amount NUMERIC NOT NULL,
    razorpay_order_id VARCHAR(128) NOT NULL,
    razorpay_payment_id VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    schedule_id INTEGER NOT NULL REFERENCES schedules(id),
    seat_ids JSONB NOT NULL,
    pdf_url VARCHAR(512) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_audits (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    order_id UUID NOT NULL REFERENCES orders(id),
    amount NUMERIC NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX orders_user_id_idx ON orders(user_id);
CREATE INDEX orders_schedule_id_idx ON orders(schedule_id);
CREATE INDEX tickets_user_id_idx ON tickets(user_id);
CREATE INDEX tickets_order_id_idx ON tickets(order_id);
CREATE INDEX user_audits_user_id_idx ON user_audits(user_id);
