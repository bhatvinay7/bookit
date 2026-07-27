/**
 * Central type barrel — import everything from '@/types'
 *
 * Domain files:
 *   '@/types/movie'    — Movie, AdminMovie, CastMember
 *   '@/types/showtime' — Showtime, AdminShowtime, Screen, ScheduleData
 *   '@/types/seat'     — SeatInfo, Seat, SeatRow
 *   '@/types/auth'     — UserPublic, AuthResponse, LoginCredentials, SignupCredentials
 *   '@/types/booking'  — Ticket, BookingPayload
 *   '@/types/admin'    — AdminStats
 */

export type { CastMember, Movie, AdminMovie } from './movie';
export type { ShowtimeStatus, Showtime, AdminShowtime, Screen, ScheduleData } from './showtime';
export type { SeatStatus, SeatClass, SeatInfo, Seat, SeatRow } from './seat';
export type { UserRole, UserPublic, AuthResponse, LoginCredentials, SignupCredentials } from './auth';
export type { BookingStatus, Ticket, BookingPayload } from './booking';
export type { AdminStats } from './admin';

// ─── New multi-type show system ────────────────────────────────────────────────
export type { ShowType, ShowStatus, Show, CreateShowRequest, PerformerInfo, TeamInfo } from './show';
export type { LayoutSeatClass, SeatLayout, SeatLayoutSeat, SeatInput, SeatPickerRow } from './layout';
export type {
  SeatSource, ScheduleSeatStatus, ScheduleSeat,
  ScheduleV2, CreateScheduleRequest, ExtraSeatRequest, AddExtraSeatsRequest,
} from './schedule';
