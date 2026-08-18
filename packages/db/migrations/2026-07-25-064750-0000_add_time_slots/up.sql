CREATE TYPE time_slot AS ENUM ('Morning', 'Afternoon', 'Evening', 'Night');

ALTER TABLE schedules ADD COLUMN date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE schedules ADD COLUMN slot time_slot NOT NULL DEFAULT 'Evening';
ALTER TABLE schedules ADD COLUMN end_time TIMESTAMPTZ;

-- Backfill data
UPDATE schedules SET date = start_time::date;
UPDATE schedules SET end_time = start_time + interval '3 hours';

ALTER TABLE schedules ALTER COLUMN end_time SET NOT NULL;

-- Enforce unique per day per show
ALTER TABLE schedules ADD CONSTRAINT unique_schedule_slot UNIQUE (mongo_show_id, date, slot);
