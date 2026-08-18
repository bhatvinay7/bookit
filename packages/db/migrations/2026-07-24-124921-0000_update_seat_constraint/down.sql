ALTER TABLE seat_layout_seats DROP CONSTRAINT IF EXISTS seat_layout_seats_unique_seat;
ALTER TABLE seat_layout_seats ADD CONSTRAINT seat_layout_seats_layout_id_row_letter_seat_number_key UNIQUE (layout_id, row_letter, seat_number);
