DROP INDEX IF EXISTS idx_schedules_lifecycle_state;

ALTER TABLE schedules
    DROP COLUMN IF EXISTS lifecycle_state;

DROP TYPE IF EXISTS schedule_lifecycle_state;
