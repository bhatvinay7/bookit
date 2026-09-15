-- Multi-type show system base schema. This was previously kept as a standalone
-- SQL file, which Diesel's embedded migration runner does not execute.

DO $$ BEGIN
  CREATE TYPE show_type AS ENUM ('Movie', 'Concert', 'Event', 'GameEvent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE layout_seat_class AS ENUM ('Standard', 'Premium', 'VIP', 'GA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE seat_source AS ENUM ('base', 'extra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS seat_layouts (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    show_type   show_type NOT NULL,
    description TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS seat_layout_seats (
    id          SERIAL PRIMARY KEY,
    layout_id   INT NOT NULL REFERENCES seat_layouts(id) ON DELETE CASCADE,
    row_letter  VARCHAR(4) NOT NULL,
    seat_number INT NOT NULL,
    seat_class  layout_seat_class NOT NULL DEFAULT 'Standard',
    x_pos       INT,
    y_pos       INT,
    UNIQUE(layout_id, row_letter, seat_number)
);

CREATE TABLE IF NOT EXISTS schedules (
    id               SERIAL PRIMARY KEY,
    mongo_show_id    VARCHAR(24) NOT NULL,
    show_type        show_type NOT NULL,
    layout_id        INT NOT NULL REFERENCES seat_layouts(id),
    start_time       TIMESTAMPTZ NOT NULL,
    booking_open_at  TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_schedules_mongo_show_id ON schedules(mongo_show_id);
CREATE INDEX IF NOT EXISTS idx_schedules_start_time ON schedules(start_time);

CREATE TABLE IF NOT EXISTS schedule_seats (
    id             SERIAL PRIMARY KEY,
    schedule_id    INT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    layout_seat_id INT REFERENCES seat_layout_seats(id),
    source         seat_source NOT NULL DEFAULT 'base',
    row_letter     VARCHAR(4) NOT NULL,
    seat_number    INT NOT NULL,
    seat_class     layout_seat_class NOT NULL,
    price          NUMERIC(10,2) NOT NULL DEFAULT 0,
    status         seat_status NOT NULL DEFAULT 'available',
    booking_id     INT REFERENCES bookings(id),
    UNIQUE(schedule_id, row_letter, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_schedule_seats_schedule_id ON schedule_seats(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_seats_status ON schedule_seats(status);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS schedule_id INT REFERENCES schedules(id);
