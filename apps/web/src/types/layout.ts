// ─── Seat layout types (PostgreSQL master templates) ──────────────────────────

import type { ShowType } from './show';

export type LayoutSeatClass = 'Standard' | 'Premium' | 'VIP' | 'GA';

/** A seat row inside a master layout template */
export interface SeatLayoutSeat {
  id: number;
  layout_id: number;
  row_letter: string;
  seat_number: number;
  seat_class: LayoutSeatClass;
  /** Optional pixel position for react-seat-picker rendering */
  x_pos?: number | null;
  y_pos?: number | null;
  block_name?: string | null;
}

/** Master reusable seat layout template */
export interface SeatLayout {
  id: number;
  name: string;
  show_type: ShowType;
  description?: string | null;
  layout_shape: string;
  created_at: string;
  deleted_at?: string | null;
  /** Included when fetched with seats */
  seats?: SeatLayoutSeat[];
  total_seats?: number;
}

/** Input for adding seats when creating/editing a layout */
export interface SeatInput {
  row_letter: string;
  seat_number: number;
  seat_class: LayoutSeatClass;
  x_pos?: number;
  y_pos?: number;
  block_name?: string | null;
}

/** For react-seat-picker: a row of seats */
export interface SeatPickerRow {
  id: string;
  number: number;
  isReserved: boolean;
  isSelected: boolean;
  isEnabled: boolean;
  orientation?: 'north' | 'south' | 'east' | 'west';
}
