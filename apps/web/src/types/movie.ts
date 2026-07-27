// ─── Movie & Cast ─────────────────────────────────────────────────────────────

export interface CastMember {
  name: string;
  photo_url: string;
  role: string;
  display_order?: number;
}

/** Public user-facing movie (from /api/user/movies) */
export interface Movie {
  id: number;
  title: string;
  tagline: string | null;
  genre: string[] | null;
  score: number | null;
  duration_minutes: number;
  director: string | null;
  director_photo_url: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  thumbnail_url: string | null;
  trailer_url: string | null;
  teaser_url: string | null;
  status: string | null;
  description: string | null;
  language: string | null;
  cast: CastMember[];
}

/** Admin movie (from /api/admin/movies — includes deleted_at) */
export interface AdminMovie {
  id: number;
  title: string;
  description: string | null;
  duration_minutes: number;
  poster_url: string | null;
  backdrop_url: string | null;
  thumbnail_url: string | null;
  trailer_url: string | null;
  teaser_url: string | null;
  genre: string[] | null;
  score: number | null;
  director: string | null;
  director_photo_url: string | null;
  language: string | null;
  tagline: string | null;
  status: string | null;
  created_at: string;
  deleted_at: string | null;
  cast: CastMember[];
}
