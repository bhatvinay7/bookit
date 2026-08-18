ALTER TABLE seat_layout_seats DROP CONSTRAINT IF EXISTS seat_layout_seats_layout_id_row_letter_seat_number_key;
ALTER TABLE seat_layout_seats ADD CONSTRAINT seat_layout_seats_unique_seat UNIQUE (layout_id, block_name, row_letter, seat_number);
