// ─── Show types (MongoDB documents) ──────────────────────────────────────────

export type ShowType = 'Movie' | 'Concert' | 'Event' | 'GameEvent';
export type ShowStatus = 'comingSoon' | 'nowShowing' | 'ended' | 'cancelled';

export interface CastMember {
  name: string;
  photo_url: string;
  role?: string;
  display_order?: number;
}

export interface PerformerInfo {
  name: string;
  photo_url?: string;
  /** e.g. "Vocalist", "Guitarist", "Speaker", "DJ" */
  role?: string;
  bio?: string;
}

export interface TeamInfo {
  name: string;
  logo_url?: string;
  city?: string;
  captain?: string;
}

/** Universal show document from MongoDB.
 *  Optional fields are present only for the relevant show type. */
export interface Show {
  /** MongoDB ObjectId hex string */
  id: string;
  show_type: ShowType;
  title: string;
  description?: string;
  tags: string[];
  status: ShowStatus | string;
  duration_minutes?: number;

  // Media
  poster_url?: string;
  backdrop_url?: string;
  thumbnail_url?: string;
  trailer_url?: string;
  teaser_url?: string;

  // Common metadata
  language?: string;
  genre?: string[];
  category_ids?: string[];
  score?: number;
  weight?: number;
  next_start_time?: string;

  // Movie-specific
  director?: string;
  director_photo_url?: string;
  cast?: CastMember[];

  // Concert / Event-specific
  host?: string;
  host_photo_url?: string;
  performers?: PerformerInfo[];

  // GameEvent-specific
  sport?: string;
  team_a?: TeamInfo;
  team_b?: TeamInfo;
  venue?: string;
  match_round?: string;
  
  // Location
  city?: string;

  created_at?: string;
  deleted_at?: string;
}

/** Request body for create/update show */
export type CreateShowRequest = Omit<Show, 'id' | 'created_at' | 'deleted_at'>;
