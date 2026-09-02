DO $$
BEGIN
    CREATE TYPE schedule_lifecycle_state AS ENUM ('scheduled', 'open', 'closed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE schedules
    ADD COLUMN IF NOT EXISTS lifecycle_state schedule_lifecycle_state
    NOT NULL DEFAULT 'scheduled';

UPDATE schedules
SET lifecycle_state = CASE
    WHEN deleted_at IS NOT NULL OR end_time <= NOW() THEN 'closed'::schedule_lifecycle_state
    WHEN booking_open_at <= NOW() THEN 'open'::schedule_lifecycle_state
    ELSE 'scheduled'::schedule_lifecycle_state
END;

CREATE INDEX IF NOT EXISTS idx_schedules_lifecycle_state
    ON schedules (lifecycle_state);
