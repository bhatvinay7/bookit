import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Movie, Showtime, SeatInfo,
  AdminMovie, AdminShowtime, AdminStats,
  Screen, ScheduleData, Show,
} from '@/types';
import { useEffect } from 'react';

// ─── Typed error ─────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Base URL (from .env.local → NEXT_PUBLIC_API_URL) ────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/** Full public user API root */
const USER_API  = `${API_URL}/api/user`;
/** Full admin API root */
const ADMIN_API = `${API_URL}/api/admin`;
/** Full auth API root */
const AUTH_API  = `${API_URL}/api/auth`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

function adminHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ─── Token validator ──────────────────────────────────────────────────────────
export function useTokenValidator() {
  useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (!token) return;
    fetch(`${AUTH_API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) {
          localStorage.removeItem('user_token');
          localStorage.removeItem('user_email');
        } else {
          res.json()
            .then(data => { if (data?.email) localStorage.setItem('user_email', data.email); })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);
}

// ─── User: Cities ─────────────────────────────────────────────────────────────
export function useCities() {
  return useQuery<string[], ApiError>({
    queryKey: ['cities'],
    queryFn: () => apiFetch<string[]>(`${USER_API}/cities`),
    retry: false,
  });
}

// ─── User: Shows ─────────────────────────────────────────────────────────────
export function useMovies(category: string = "All", city: string = "All") {
  return useQuery<Show[], ApiError>({
    queryKey: ['movies', category, city],
    queryFn: () => {
      const url = new URL(`${USER_API}/movies`);
      if (category !== "All") url.searchParams.append("show_type", category);
      if (city !== "All") url.searchParams.append("city", city);
      return apiFetch<Show[]>(url.toString());
    },
    retry: false,
  });
}

// ─── User: Search ─────────────────────────────────────────────────────────────
const SEARCH_API_URL = (process.env.NEXT_PUBLIC_SEARCH_API_URL ?? API_URL).replace(/\/$/, '');

export function useSearchShows(query: string, city: string = "All") {
  const normalizedQuery = query.trim();
  return useQuery<Show[], ApiError>({
    queryKey: ['searchShows', normalizedQuery, city],
    queryFn: ({ signal }) => {
      const url = new URL(`${SEARCH_API_URL}/api/search`);
      url.searchParams.set('q', normalizedQuery);
      if (city !== "All") url.searchParams.append('city', city);
      return apiFetch<Show[]>(url.toString(), { signal });
    },
    enabled: normalizedQuery.length > 1,
    retry: false,
    staleTime: 30_000,
  });
}

// ─── User: Showtimes ─────────────────────────────────────────────────────────
export function useShowtimes(movieId: number | null) {
  return useQuery<Showtime[], ApiError>({
    queryKey: ['showtimes', movieId],
    queryFn: () => apiFetch<Showtime[]>(`${USER_API}/schedules_v2/show/${movieId}`),
    enabled: !!movieId,
    // Refetch every 30s to keep countdown data fresh
    refetchInterval: 30_000,
  });
}

// ─── User: Seats ─────────────────────────────────────────────────────────────
export function useSeats(showtimeId: number | null) {
  return useQuery<SeatInfo[], ApiError>({
    queryKey: ['seats', showtimeId],
    queryFn: () => apiFetch<SeatInfo[]>(`${USER_API}/schedules_v2/${showtimeId}/seats`),
    enabled: !!showtimeId,
    refetchInterval: 10_000,
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export function useLogin() {
  return useMutation<{ token: string; user: { email: string; role: string } }, ApiError, { email: string; password: string }>({
    mutationFn: creds =>
      apiFetch(`${AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      }),
  });
}

export function useSignup() {
  return useMutation<{ token: string; user: { email: string } }, ApiError, { email: string; password: string; role?: string }>({
    mutationFn: creds =>
      apiFetch(`${AUTH_API}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      }),
  });
}

// ─── Admin: Stats ─────────────────────────────────────────────────────────────
export function useAdminStats(token: string) {
  return useQuery<AdminStats, ApiError>({
    queryKey: ['adminStats'],
    queryFn: () => apiFetch<AdminStats>(`${ADMIN_API}/stats`, { headers: adminHeaders(token) }),
    enabled: !!token,
    refetchInterval: 60_000,
  });
}

// ─── Admin: Movies ────────────────────────────────────────────────────────────
export function useAdminMovies(token: string) {
  return useQuery<AdminMovie[], ApiError>({
    queryKey: ['adminMovies'],
    queryFn: () => apiFetch<AdminMovie[]>(`${ADMIN_API}/shows`, { headers: adminHeaders(token) }),
    enabled: !!token,
  });
}

export function useAddMovie(token: string) {
  const qc = useQueryClient();
  return useMutation<AdminMovie, ApiError, Partial<AdminMovie>>({
    mutationFn: data =>
      apiFetch<AdminMovie>(`${ADMIN_API}/shows`, {
        method: 'POST', headers: adminHeaders(token), body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminMovies'] }),
  });
}

export function useUpdateMovie(token: string) {
  const qc = useQueryClient();
  return useMutation<AdminMovie, ApiError, { id: number; data: Partial<AdminMovie> }>({
    mutationFn: ({ id, data }) =>
      apiFetch<AdminMovie>(`${ADMIN_API}/shows/${id}`, {
        method: 'PUT', headers: adminHeaders(token), body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminMovies'] }),
  });
}

export function useDeleteMovie(token: string) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: id =>
      apiFetch<void>(`${ADMIN_API}/shows/${id}`, { method: 'DELETE', headers: adminHeaders(token) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminMovies'] }),
  });
}

// ─── Admin: Showtimes ─────────────────────────────────────────────────────────
export function useAdminShowtimes(token: string) {
  return useQuery<AdminShowtime[], ApiError>({
    queryKey: ['adminShowtimes'],
    queryFn: () => apiFetch<AdminShowtime[]>(`${ADMIN_API}/schedules`, { headers: adminHeaders(token) }),
    enabled: !!token,
  });
}

export function useCancelShowtime(token: string) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: id =>
      apiFetch<void>(`${ADMIN_API}/schedules/${id}`, { method: 'DELETE', headers: adminHeaders(token) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminShowtimes'] }),
  });
}

export function useScheduleMovie(token: string) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, ScheduleData>({
    mutationFn: data =>
      apiFetch(`${ADMIN_API}/schedules`, {
        method: 'POST', headers: adminHeaders(token), body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminShowtimes'] }),
  });
}

// ─── Admin: Screens ───────────────────────────────────────────────────────────
export function useScreens(token: string) {
  return useQuery<Screen[], ApiError>({
    queryKey: ['screens'],
    queryFn: () => apiFetch<Screen[]>(`${ADMIN_API}/layouts`, { headers: adminHeaders(token) }),
    enabled: !!token,
  });
}

// ─── Admin: Upload ────────────────────────────────────────────────────────────
export function useUploadFile(token: string) {
  return useMutation<{ url: string; key: string }, ApiError, FormData>({
    mutationFn: formData =>
      apiFetch<{ url: string; key: string }>(`${ADMIN_API}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets multipart boundary
        body: formData,
      }),
  });
}
