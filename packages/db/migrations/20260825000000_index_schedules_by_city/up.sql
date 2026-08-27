-- Preserve legacy rows for migration, while requiring city on every new or
-- updated schedule. Existing NULL rows can be corrected by the admin editor.
ALTER TABLE schedules
    ADD CONSTRAINT schedules_venue_city_required
    CHECK (venue_city IS NOT NULL AND BTRIM(venue_city) <> '') NOT VALID;

-- Show-details lookup: one Mongo show, selected city, upcoming schedules.
CREATE INDEX idx_schedules_show_city_start_active
    ON schedules (mongo_show_id, venue_city, start_time)
    WHERE deleted_at IS NULL;

-- Dashboard/search lookup: active shows available in the selected city.
CREATE INDEX idx_schedules_city_start_show_active
    ON schedules (venue_city, start_time, mongo_show_id)
    WHERE deleted_at IS NULL;

-- The old constraint blocked the same show/date/slot in different cities.
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS unique_schedule_slot;
CREATE UNIQUE INDEX unique_active_schedule_venue_start
    ON schedules (
        mongo_show_id,
        venue_city,
        COALESCE(venue_name, ''),
        start_time
    )
    WHERE deleted_at IS NULL;
