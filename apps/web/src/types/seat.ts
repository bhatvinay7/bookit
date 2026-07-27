// ─── Seat ─────────────────────────────────────────────────────────────────────

export type SeatStatus = "Available" | "Booked" | "Locked";
export type SeatClass  = "Standard" | "Premium" | "VIP";

/** Raw seat info returned from /api/user/showtimes/:id/seats */
export interface SeatInfo {
  showtime_seat_id: number;
  seat_id: number;
  row_letter: string;
  seat_number: number;
  seat_class: string;
  status: string;  // "Available" | "Booked" | "Locked"
  price: string;
}

/** Transformed seat used in the UI seat-map */
export interface Seat {
  id: number;
  label: string;
  col: number;
  status: "available" | "booked" | "locked";
  price: number;
}

/** Row in the seat-map grid */
export interface SeatRow {
  row: string;
  type: "standard" | "premium" | "vip";
  seats: Seat[];
}
