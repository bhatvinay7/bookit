-- Migration: Add Venue fields and Layout block/shape fields

ALTER TABLE seat_layouts 
ADD COLUMN IF NOT EXISTS layout_shape VARCHAR(50) NOT NULL DEFAULT 'rectangular';

ALTER TABLE seat_layout_seats 
ADD COLUMN IF NOT EXISTS block_name VARCHAR(100);

ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS venue_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS venue_address TEXT,
ADD COLUMN IF NOT EXISTS venue_city VARCHAR(100),
ADD COLUMN IF NOT EXISTS venue_state VARCHAR(100);
