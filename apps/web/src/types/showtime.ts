// ─── Showtime ─────────────────────────────────────────────────────────────────

export type ShowtimeStatus = "upcoming" | "in_progress" | "ended";

/** User-facing showtime with countdown (from /api/user/movies/:id/showtimes) */
export interface Showtime {
  id: number;
  movie_id: number;
  screen_id: number;
  start_time: string;
  available_seats: number;
  total_seats: number;
  /** Seconds remaining until the show starts. Negative when already started. */
  seconds_until_start: number;
  /** True once the show has started — booking is gated on this */
  booking_open: boolean;
  status: ShowtimeStatus;
  /** @deprecated use available_seats */
  available_seats_count?: number;
}

/** Admin showtime with full detail and seat counts */
export interface AdminShowtime {
  id: number;
  mongo_show_id: string;
  show_title?: string;
  layout_id: number;
  venue_name?: string;
  start_time: string;
  created_at: string;
  deleted_at: string | null;
  total_seats: number;
  available_seats: number;
  booked_seats: number;
}

export interface Screen {
  id: number;
  name: string;
}

export interface ScheduleData {
  movie_id: number;
  screen_id: number;
  start_date: string;  // YYYY-MM-DD
  end_date: string;    // YYYY-MM-DD
  price: string;
  time_slots?: string[]; // HH:MM
}
