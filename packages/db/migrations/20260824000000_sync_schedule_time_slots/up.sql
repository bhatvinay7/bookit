-- Keep existing schedule slot labels aligned with their local start time.
-- BookIt currently operates in Asia/Kolkata for schedule administration.
UPDATE schedules
SET slot = CASE
    WHEN EXTRACT(HOUR FROM start_time AT TIME ZONE 'Asia/Kolkata') < 12
        THEN 'Morning'::time_slot
    WHEN EXTRACT(HOUR FROM start_time AT TIME ZONE 'Asia/Kolkata') < 17
        THEN 'Afternoon'::time_slot
    WHEN EXTRACT(HOUR FROM start_time AT TIME ZONE 'Asia/Kolkata') < 21
        THEN 'Evening'::time_slot
    ELSE 'Night'::time_slot
END
WHERE deleted_at IS NULL;
