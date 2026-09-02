ALTER TABLE schedule_seats
    ADD COLUMN IF NOT EXISTS seat_index INTEGER;

-- Preserve all existing global IDs while assigning a stable, contiguous
-- one-based index within each schedule.
WITH numbered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY schedule_id
            ORDER BY row_letter, seat_number, id
        )::INTEGER AS seat_index
    FROM schedule_seats
)
UPDATE schedule_seats AS seats
SET seat_index = numbered.seat_index
FROM numbered
WHERE seats.id = numbered.id
  AND seats.seat_index IS NULL;

-- Allow inserts that omit seat_index to receive the next value for their
-- schedule. The advisory transaction lock serializes allocation per schedule.
-- Updated application code still supplies deterministic values explicitly.
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
    FOR EACH ROW
    EXECUTE FUNCTION bookit_assign_schedule_seat_index();

ALTER TABLE schedule_seats
    ALTER COLUMN seat_index SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_seats_schedule_seat_index
    ON schedule_seats (schedule_id, seat_index);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'schedule_seats_seat_index_positive'
          AND conrelid = 'schedule_seats'::regclass
    ) THEN
        ALTER TABLE schedule_seats
            ADD CONSTRAINT schedule_seats_seat_index_positive
            CHECK (seat_index >= 1);
    END IF;
END $$;
