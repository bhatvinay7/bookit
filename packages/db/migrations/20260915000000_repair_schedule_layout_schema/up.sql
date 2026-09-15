-- Repair databases that were initialized while the schedule/layout SQL lived
-- outside Diesel's migration directory. Every statement is idempotent so this
-- is safe for databases where the tables were created manually.

DO $$ BEGIN
  CREATE TYPE show_type AS ENUM ('Movie', 'Concert', 'Event', 'GameEvent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE layout_seat_class AS ENUM ('Standard', 'Premium', 'VIP', 'GA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE seat_source AS ENUM ('base', 'extra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE time_slot AS ENUM ('Morning', 'Afternoon', 'Evening', 'Night');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE schedule_lifecycle_state AS ENUM ('scheduled', 'open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS seat_layouts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    show_type show_type NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    layout_shape VARCHAR(50) NOT NULL DEFAULT 'rectangular'
);
ALTER TABLE seat_layouts
    ADD COLUMN IF NOT EXISTS layout_shape VARCHAR(50) NOT NULL DEFAULT 'rectangular';

CREATE TABLE IF NOT EXISTS seat_layout_seats (
    id SERIAL PRIMARY KEY,
    layout_id INT NOT NULL REFERENCES seat_layouts(id) ON DELETE CASCADE,
    row_letter VARCHAR(4) NOT NULL,
    seat_number INT NOT NULL,
    seat_class layout_seat_class NOT NULL DEFAULT 'Standard',
    x_pos INT,
    y_pos INT,
    block_name VARCHAR(100)
);
ALTER TABLE seat_layout_seats ADD COLUMN IF NOT EXISTS block_name VARCHAR(100);

CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    mongo_show_id VARCHAR(24) NOT NULL,
    show_type show_type NOT NULL,
    layout_id INT REFERENCES seat_layouts(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    booking_open_at TIMESTAMPTZ NOT NULL,
    lifecycle_state schedule_lifecycle_state NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    venue_name VARCHAR(255),
    venue_address TEXT,
    venue_city VARCHAR(100),
    venue_state VARCHAR(100),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    slot time_slot NOT NULL DEFAULT 'Evening',
    end_time TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '3 hours'
);
ALTER TABLE schedules
    ADD COLUMN IF NOT EXISTS venue_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS venue_address TEXT,
    ADD COLUMN IF NOT EXISTS venue_city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS venue_state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS slot time_slot NOT NULL DEFAULT 'Evening',
    ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lifecycle_state schedule_lifecycle_state NOT NULL DEFAULT 'scheduled';
UPDATE schedules SET date = start_time::date WHERE date IS NULL;
UPDATE schedules SET end_time = start_time + INTERVAL '3 hours' WHERE end_time IS NULL;
ALTER TABLE schedules ALTER COLUMN end_time SET NOT NULL;

CREATE TABLE IF NOT EXISTS schedule_seats (
    id SERIAL PRIMARY KEY,
    schedule_id INT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    seat_index INT NOT NULL,
    layout_seat_id INT REFERENCES seat_layout_seats(id) ON DELETE SET NULL,
    source seat_source NOT NULL DEFAULT 'base',
    row_letter VARCHAR(4) NOT NULL,
    seat_number INT NOT NULL,
    seat_class layout_seat_class NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    status seat_status NOT NULL DEFAULT 'available',
    booking_id INT REFERENCES bookings(id),
    UNIQUE(schedule_id, row_letter, seat_number)
);
ALTER TABLE schedule_seats ADD COLUMN IF NOT EXISTS seat_index INT;
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY schedule_id ORDER BY row_letter, seat_number, id
    )::INTEGER AS next_index
    FROM schedule_seats
)
UPDATE schedule_seats AS seat
SET seat_index = numbered.next_index
FROM numbered
WHERE seat.id = numbered.id AND seat.seat_index IS NULL;
ALTER TABLE schedule_seats ALTER COLUMN seat_index SET NOT NULL;

CREATE OR REPLACE FUNCTION bookit_assign_schedule_seat_index()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(20260902, NEW.schedule_id);
    IF NEW.seat_index IS NULL THEN
        SELECT COALESCE(MAX(seat_index), 0) + 1
        INTO NEW.seat_index
        FROM schedule_seats
        WHERE schedule_id = NEW.schedule_id;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assign_schedule_seat_index ON schedule_seats;
CREATE TRIGGER assign_schedule_seat_index
    BEFORE INSERT ON schedule_seats
    FOR EACH ROW EXECUTE FUNCTION bookit_assign_schedule_seat_index();

CREATE INDEX IF NOT EXISTS idx_schedules_mongo_show_id ON schedules(mongo_show_id);
CREATE INDEX IF NOT EXISTS idx_schedules_start_time ON schedules(start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_seats_schedule_id ON schedule_seats(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_seats_status ON schedule_seats(status);
CREATE INDEX IF NOT EXISTS idx_schedule_seats_schedule_seat_index
    ON schedule_seats(schedule_id, seat_index);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS schedule_id INT REFERENCES schedules(id);
