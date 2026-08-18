-- ============================================================
-- BookIt — Multi-type show system migration
-- Adds: seat_layouts, seat_layout_seats, schedules,
--       schedule_seats and alters bookings.
-- PostgreSQL (Neon) — run once.
-- ============================================================

-- ─── New ENUM types ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE show_type AS ENUM ('Movie','Concert','Event','GameEvent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE layout_seat_class AS ENUM ('Standard','Premium','VIP','GA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE seat_source AS ENUM ('base','extra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── seat_layouts ────────────────────────────────────────────
-- Master seat layout templates (reusable across shows)
CREATE TABLE IF NOT EXISTS seat_layouts (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120)  NOT NULL,
    show_type   show_type     NOT NULL,
    description TEXT,
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

-- ─── seat_layout_seats ───────────────────────────────────────
-- Individual seat rows inside a template
CREATE TABLE IF NOT EXISTS seat_layout_seats (
    id          SERIAL PRIMARY KEY,
    layout_id   INT              NOT NULL REFERENCES seat_layouts(id) ON DELETE CASCADE,
    row_letter  VARCHAR(4)       NOT NULL,
    seat_number INT              NOT NULL,
    seat_class  layout_seat_class NOT NULL DEFAULT 'Standard',
    x_pos       INT,             -- pixel x for seat-picker (optional)
    y_pos       INT,             -- pixel y for seat-picker (optional)
    UNIQUE(layout_id, row_letter, seat_number)
);

-- ─── schedules ───────────────────────────────────────────────
-- One schedule = one show event with a chosen seat layout.
-- mongo_show_id references the Show document in MongoDB.
CREATE TABLE IF NOT EXISTS schedules (
    id               SERIAL PRIMARY KEY,
    mongo_show_id    VARCHAR(24)  NOT NULL,   -- MongoDB ObjectId hex string
    show_type        show_type    NOT NULL,
    layout_id        INT          NOT NULL REFERENCES seat_layouts(id),
    start_time       TIMESTAMPTZ  NOT NULL,
    booking_open_at  TIMESTAMPTZ  NOT NULL,   -- when users can start booking
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_schedules_mongo_show_id ON schedules(mongo_show_id);
CREATE INDEX IF NOT EXISTS idx_schedules_start_time ON schedules(start_time);

-- ─── schedule_seats ──────────────────────────────────────────
-- Seats for a specific schedule (copied from layout + extras).
-- layout_seat_id is NULL for admin-added extra seats.
CREATE TABLE IF NOT EXISTS schedule_seats (
    id             SERIAL PRIMARY KEY,
    schedule_id    INT               NOT NULL REFERENCES schedules(id)           ON DELETE CASCADE,
    layout_seat_id INT               REFERENCES seat_layout_seats(id),           -- NULL for extras
    source         seat_source       NOT NULL DEFAULT 'base',
    row_letter     VARCHAR(4)        NOT NULL,
    seat_number    INT               NOT NULL,
    seat_class     layout_seat_class NOT NULL,
    price          NUMERIC(10,2)     NOT NULL DEFAULT 0,
    status         seat_status       NOT NULL DEFAULT 'available',               -- reuses existing PG enum (lowercase values)
    booking_id     INT               REFERENCES bookings(id),
    UNIQUE(schedule_id, row_letter, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_schedule_seats_schedule_id ON schedule_seats(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_seats_status ON schedule_seats(status);

-- ─── bookings — allow schedule_id ────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS schedule_id INT REFERENCES schedules(id);
-- schedule_id nullable: existing movie bookings use showtime_id, new ones use schedule_id
