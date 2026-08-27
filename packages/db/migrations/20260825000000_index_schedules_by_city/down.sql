DROP INDEX IF EXISTS unique_active_schedule_venue_start;
ALTER TABLE schedules
    ADD CONSTRAINT unique_schedule_slot UNIQUE (mongo_show_id, date, slot);

DROP INDEX IF EXISTS idx_schedules_city_start_show_active;
DROP INDEX IF EXISTS idx_schedules_show_city_start_active;

ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_venue_city_required;
