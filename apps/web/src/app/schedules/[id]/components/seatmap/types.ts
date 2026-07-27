import type { ScheduleSeat } from "@/types/schedule";

export type SeatMapStatus = "available" | "booked" | "locked" | "my_booked" | "my_locked";
export type SeatToggleStatus = "available" | "booked" | "locked";

export interface SeatItem {
  id: number;
  label: string;
  col: string;
  status: SeatMapStatus;
  price: number;
  seat: ScheduleSeat;
}

export interface SeatRow {
  row: string;
  classType: string;
  seats: SeatItem[];
}

export interface SeatTier {
  name: string;
  id: string;
  rows: SeatRow[];
  color: string;
}
