CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled');
CREATE TYPE seat_status AS ENUM ('available', 'locked', 'booked');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    role user_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    poster_url VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE screens (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL
);

CREATE TABLE seats (
    id SERIAL PRIMARY KEY,
    screen_id INTEGER NOT NULL REFERENCES screens(id),
    row_letter VARCHAR NOT NULL,
    seat_number INTEGER NOT NULL,
    seat_class VARCHAR NOT NULL DEFAULT 'standard',
    UNIQUE(screen_id, row_letter, seat_number)
);

CREATE TABLE showtimes (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER NOT NULL REFERENCES movies(id),
    screen_id INTEGER NOT NULL REFERENCES screens(id),
    start_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    showtime_id INTEGER NOT NULL REFERENCES showtimes(id),
    status booking_status NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE showtime_seats (
    id SERIAL PRIMARY KEY,
    showtime_id INTEGER NOT NULL REFERENCES showtimes(id),
    seat_id INTEGER NOT NULL REFERENCES seats(id),
    status seat_status NOT NULL DEFAULT 'available',
    price DECIMAL(10, 2) NOT NULL,
    booking_id INTEGER REFERENCES bookings(id),
    UNIQUE(showtime_id, seat_id)
);
