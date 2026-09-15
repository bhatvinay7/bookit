-- Repairing a partially initialized production schema is intentionally
-- irreversible; dropping schedule data during rollback would be unsafe.
SELECT 1;
