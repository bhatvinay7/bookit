use bson::oid::ObjectId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ─── Enum: ShowType ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum ShowType {
    Movie,
    Concert,
    Event,
    GameEvent,
}

// ─── Enum: ShowStatus ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ShowStatus {
    #[default]
    ComingSoon,
    NowShowing,
    Ended,
    Cancelled,
}

impl ShowStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ShowStatus::ComingSoon => "comingSoon",
            ShowStatus::NowShowing => "nowShowing",
            ShowStatus::Ended => "ended",
            ShowStatus::Cancelled => "cancelled",
        }
    }
}

// ─── Sub-documents ────────────────────────────────────────────────────────────

/// Cast member — used for Movies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CastMember {
    pub name: String,
    pub photo_url: String,
    pub role: Option<String>,
    pub display_order: Option<i32>,
}

/// Performer — used for Concerts & Events (singers, speakers, bands)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformerInfo {
    pub name: String,
    pub photo_url: Option<String>,
    /// e.g. "Vocalist", "Guitarist", "Speaker", "DJ"
    pub role: Option<String>,
    pub bio: Option<String>,
}

/// Team — used for GameEvents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamInfo {
    pub name: String,
    pub logo_url: Option<String>,
    pub city: Option<String>,
    pub captain: Option<String>,
}

// ─── Main Show document ───────────────────────────────────────────────────────

/// Universal show document stored in MongoDB.
/// Optional fields let each show type carry only relevant data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Show {
    /// MongoDB ObjectId — serialised as "_id"
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,

    pub show_type: ShowType,
    pub title: String,
    pub description: Option<String>,
    /// Searchable free-form tags: ["action", "ipl", "live-music"]
    #[serde(default)]
    pub tags: Vec<String>,
    /// Array of category ObjectIds (as strings)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_ids: Option<Vec<String>>,

    // ── Media ────────────────────────────────────────────────────────────────
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub trailer_url: Option<String>,
    pub teaser_url: Option<String>,

    // ── Common metadata ───────────────────────────────────────────────────────
    pub language: Option<String>,
    #[serde(default)]
    pub genre: Vec<String>,
    pub score: Option<f32>,
    #[serde(default)]
    pub weight: Option<i32>,
    pub next_start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub status: ShowStatus,
    /// Relevant for movies and structured shows (not required for GameEvent)
    pub duration_minutes: Option<i32>,

    // ── Movie-specific ────────────────────────────────────────────────────────
    pub director: Option<String>,
    pub director_photo_url: Option<String>,
    pub cast: Option<Vec<CastMember>>,

    // ── Concert / Event-specific ──────────────────────────────────────────────
    pub host: Option<String>,
    pub host_photo_url: Option<String>,
    pub performers: Option<Vec<PerformerInfo>>,

    // ── GameEvent-specific ────────────────────────────────────────────────────
    /// Sport name: "kabaddi", "cricket", "football"
    pub sport: Option<String>,
    pub team_a: Option<TeamInfo>,
    pub team_b: Option<TeamInfo>,
    pub venue: Option<String>,
    pub match_round: Option<String>,

    // ── Location ──────────────────────────────────────────────────────────────
    pub city: Option<String>,

    // ── Timestamps ────────────────────────────────────────────────────────────
    pub created_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Show {
    pub fn new(show_type: ShowType, title: String) -> Self {
        Show {
            id: None,
            show_type,
            title,
            description: None,
            tags: vec![],
            category_ids: None,
            poster_url: None,
            backdrop_url: None,
            thumbnail_url: None,
            trailer_url: None,
            teaser_url: None,
            language: None,
            genre: vec![],
            score: None,
            weight: Some(0),
            next_start_time: None,
            status: ShowStatus::default(),
            duration_minutes: None,
            director: None,
            director_photo_url: None,
            cast: None,
            host: None,
            host_photo_url: None,
            performers: None,
            sport: None,
            team_a: None,
            team_b: None,
            venue: None,
            match_round: None,
            city: None,
            created_at: Some(Utc::now()),
            deleted_at: None,
        }
    }
}

// ─── Request / Response DTOs ──────────────────────────────────────────────────

/// Used when admin POSTs a new show (id omitted — MongoDB generates it)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateShowRequest {
    pub show_type: ShowType,
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub trailer_url: Option<String>,
    pub teaser_url: Option<String>,
    pub language: Option<String>,
    pub genre: Option<Vec<String>>,
    pub category_ids: Option<Vec<String>>,
    pub score: Option<f32>,
    pub weight: Option<i32>,
    pub status: Option<ShowStatus>,
    pub duration_minutes: Option<i32>,
    // Movie
    pub director: Option<String>,
    pub director_photo_url: Option<String>,
    pub cast: Option<Vec<CastMember>>,
    // Concert / Event
    pub host: Option<String>,
    pub host_photo_url: Option<String>,
    pub performers: Option<Vec<PerformerInfo>>,
    // GameEvent
    pub sport: Option<String>,
    pub team_a: Option<TeamInfo>,
    pub team_b: Option<TeamInfo>,
    pub venue: Option<String>,
    pub match_round: Option<String>,
    pub city: Option<String>,
}

impl From<CreateShowRequest> for Show {
    fn from(r: CreateShowRequest) -> Self {
        Show {
            id: None,
            show_type: r.show_type,
            title: r.title,
            description: r.description,
            tags: r.tags.unwrap_or_default(),
            category_ids: r.category_ids,
            poster_url: r.poster_url,
            backdrop_url: r.backdrop_url,
            thumbnail_url: r.thumbnail_url,
            trailer_url: r.trailer_url,
            teaser_url: r.teaser_url,
            language: r.language,
            genre: r.genre.unwrap_or_default(),
            score: r.score,
            weight: Some(r.weight.unwrap_or(0)),
            next_start_time: None,
            status: r.status.unwrap_or_default(),
            duration_minutes: r.duration_minutes,
            director: r.director,
            director_photo_url: r.director_photo_url,
            cast: r.cast,
            host: r.host,
            host_photo_url: r.host_photo_url,
            performers: r.performers,
            sport: r.sport,
            team_a: r.team_a,
            team_b: r.team_b,
            venue: r.venue,
            match_round: r.match_round,
            city: r.city,
            created_at: Some(Utc::now()),
            deleted_at: None,
        }
    }
}
