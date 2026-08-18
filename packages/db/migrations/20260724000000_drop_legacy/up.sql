-- Drop legacy tables that are no longer used
ALTER TABLE bookings DROP COLUMN showtime_id;
DROP TABLE showtime_seats CASCADE;
DROP TABLE showtimes CASCADE;
DROP TABLE seats CASCADE;
DROP TABLE screens CASCADE;
DROP TABLE movie_cast CASCADE;
DROP TABLE movies CASCADE;

-- Update schedules layout_id constraint to ON DELETE SET NULL
ALTER TABLE schedules ALTER COLUMN layout_id DROP NOT NULL;
ALTER TABLE schedules DROP CONSTRAINT schedules_layout_id_fkey;
ALTER TABLE schedules ADD CONSTRAINT schedules_layout_id_fkey FOREIGN KEY (layout_id) REFERENCES seat_layouts(id) ON DELETE SET NULL;
