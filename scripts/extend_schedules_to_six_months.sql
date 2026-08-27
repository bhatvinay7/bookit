\set ON_ERROR_STOP on

-- Shift the complete active schedule window so that its latest end_time is
-- exactly six months from the transaction date. The same offset is applied to
-- every timestamp, preserving schedule duration, relative spacing, and booking
-- lead time. Soft-deleted schedules are intentionally left unchanged.
--
-- Run with:
--   psql "$DATABASE_URL" -f scripts/extend_schedules_to_six_months.sql

BEGIN;

-- Prevent two copies of this maintenance script from running concurrently.
SELECT pg_advisory_xact_lock(hashtext('bookit:extend-schedules-to-six-months'));

DO $$
DECLARE
    schedule_count bigint;
    schedule_span interval;
BEGIN
    SELECT count(*), max(end_time) - min(start_time)
      INTO schedule_count, schedule_span
      FROM schedules
     WHERE deleted_at IS NULL;

    IF schedule_count = 0 THEN
        RAISE EXCEPTION 'No non-deleted schedules were found; nothing was updated';
    END IF;

    -- A window this large cannot be moved wholly into the next six months.
    IF schedule_span >= interval '6 months' THEN
        RAISE EXCEPTION
            'Schedule window is % and cannot fit within six months; no rows were updated',
            schedule_span;
    END IF;
END $$;

CREATE TEMP TABLE schedule_shift_plan ON COMMIT DROP AS
WITH schedule_window AS (
    SELECT (CURRENT_TIMESTAMP + interval '6 months') - max(end_time) AS shift_by
      FROM schedules
     WHERE deleted_at IS NULL
)
SELECT schedule.id,
       schedule.start_time + schedule_window.shift_by AS new_start_time,
       schedule.end_time + schedule_window.shift_by AS new_end_time,
       schedule.booking_open_at + schedule_window.shift_by AS new_booking_open_at,
       (schedule.start_time + schedule_window.shift_by)::date AS new_date
  FROM schedules AS schedule
 CROSS JOIN schedule_window
 WHERE schedule.deleted_at IS NULL;

-- Move rows to distinct temporary dates first. This avoids transient conflicts
-- with UNIQUE (mongo_show_id, date, slot) while dates are being shifted.
UPDATE schedules AS schedule
   SET start_time      = TIMESTAMPTZ '5000-01-01 00:00:00+00'
                         + schedule.id * interval '1 day',
       end_time        = TIMESTAMPTZ '5000-01-01 01:00:00+00'
                         + schedule.id * interval '1 day',
       booking_open_at = TIMESTAMPTZ '4999-12-31 00:00:00+00'
                         + schedule.id * interval '1 day',
       date            = (DATE '5000-01-01' + schedule.id)
 WHERE schedule.deleted_at IS NULL;

WITH updated AS (
    UPDATE schedules AS schedule
       SET start_time      = plan.new_start_time,
           end_time        = plan.new_end_time,
           booking_open_at = plan.new_booking_open_at,
           date            = plan.new_date
      FROM schedule_shift_plan AS plan
     WHERE schedule.id = plan.id
    RETURNING schedule.id
)
SELECT count(*) AS updated_schedule_count FROM updated;

SELECT min(start_time) AS first_start_time,
       max(end_time) AS final_end_time,
       CURRENT_TIMESTAMP + interval '6 months' AS expected_final_end_time
  FROM schedules
 WHERE deleted_at IS NULL;

COMMIT;
