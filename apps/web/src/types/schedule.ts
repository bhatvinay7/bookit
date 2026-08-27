// ─── Schedule types (PostgreSQL) ─────────────────────────────────────────────

import type { ShowType } from './show';
import type { LayoutSeatClass } from './layout';

export type SeatSource = 'base' | 'extra';
export type ScheduleSeatStatus = 'Available' | 'Locked' | 'Booked';

/** A seat within a specific schedule (copied from layout + extras) */
export interface ScheduleSeat {
  id: number;
  schedule_id: number;
  layout_seat_id?: number | null;
  source: SeatSource;
  row_letter: string;
  seat_number: number;
  seat_class: LayoutSeatClass;
  price: string;
  status: ScheduleSeatStatus;
  booking_id?: number | null;
  locked_by_user_id?: number | null;
}

/** A scheduled event (links a MongoDB show to a seat layout at a time) */
export interface ScheduleV2 {
  id: number;
  mongo_show_id: string;
  show_type: ShowType;
  layout_id: number;
  date: string;
  slot: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  start_time: string;
  end_time: string;
  booking_open_at: string;
  created_at: string;
  deleted_at?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
  venue_city?: string | null;
  venue_state?: string | null;

  // Stats (aggregated by API)
  total_seats?: number;
  available_seats?: number;
  booked_seats?: number;
  seconds_until_booking_open?: number;
  booking_open?: boolean;

  // Joined from MongoDB (optional, when enriched)
  show?: import('./show').Show;
}

/** Request body for creating a schedule */
export interface CreateScheduleRequest {
  mongo_show_id: string;
  show_type: ShowType;
  layout_id: number;
  date: string;
  slot: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  start_time?: string;       // ISO-8601
  end_time: string;
  booking_open_at: string;  // ISO-8601
  /** Price per seat class key: { Standard: "150.00", Premium: "250.00" } */
  prices: Record<LayoutSeatClass, string>;
  venue_name?: string;
  venue_address?: string;
  venue_city: string;
  venue_state?: string;
}

/** Request body for adding extra seats to a schedule */
export interface ExtraSeatRequest {
  row_letter: string;
  seat_number: number;
  seat_class: LayoutSeatClass;
  price: string;
}

export interface AddExtraSeatsRequest {
  seats: ExtraSeatRequest[];
}
