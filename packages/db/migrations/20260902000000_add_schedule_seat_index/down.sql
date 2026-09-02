ALTER TABLE schedule_seats
    DROP CONSTRAINT IF EXISTS schedule_seats_seat_index_positive;

DROP INDEX IF EXISTS idx_schedule_seats_schedule_seat_index;

DROP TRIGGER IF EXISTS assign_schedule_seat_index ON schedule_seats;
DROP FUNCTION IF EXISTS bookit_assign_schedule_seat_index();

ALTER TABLE schedule_seats
    DROP COLUMN IF EXISTS seat_index;
