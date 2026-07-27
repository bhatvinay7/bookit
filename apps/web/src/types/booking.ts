// ─── Booking ──────────────────────────────────────────────────────────────────

export type BookingStatus = "Pending" | "Confirmed" | "Cancelled";

export interface Ticket {
  booking_id: number;
  status: BookingStatus | string;
  total_amount: string;
  show_title: string;
  venue_name: string;
  show_time: string;
  seats: string[];
}

export interface BookingPayload {
  showtime_id: number;
  seat_ids: number[];
}
