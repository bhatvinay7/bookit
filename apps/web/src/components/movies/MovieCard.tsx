import type { Movie, Seat, SeatRow } from "@/types";
import { useState } from "react";
export function Star() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

const GENRE_KEYS: Record<string, string> = {
  'Sci-Fi': 'scifi',
  'Action': 'action',
  'Drama': 'drama',
  'Romance': 'romance',
  'Comedy': 'comedy',
  'Biography': 'bio',
  'Adventure': 'scifi',
}

// ─── Seat map ────────────────────────────────────────────────────────────────

function GenrePill({ genre }: { genre: string }) {
  const key = GENRE_KEYS[genre] ?? 'other'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.02em',
        background: `var(--genre-${key})`,
        color: `var(--genre-${key}-t)`,
        whiteSpace: 'nowrap',
      }}
    >
      {genre}
    </span>
  )
}

// ─── Movie Card (Front Card) ──────────────────────────────────────────────────

export function MovieCard({ movie, onBook }: { movie: Movie; onBook: () => void }) {
  const [hov, setHov] = useState(false)

  return (
    <article
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--card-bg)',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid var(--card-border)',
        boxShadow: hov ? 'var(--card-shadow-hover)' : 'var(--card-shadow)',
        transform: hov ? 'translateY(-6px)' : 'translateY(0)',
        transition: 'box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.34,1.5,0.64,1)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Poster ── */}
      <div style={{ position: 'relative', paddingBottom: '138%', flexShrink: 0 }}>
        <img
          src={movie.poster_url || ""}
          alt={movie.title}
          loading="lazy"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: hov ? 'scale(1.06)' : 'scale(1)',
            transition: 'transform 0.5s ease',
          }}
        />

        {/* Gradient fade bottom of poster into card body */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '72px',
            background: 'linear-gradient(to bottom, transparent, var(--card-bg))',
            pointerEvents: 'none',
          }}
        />

        {/* Score badge */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--accent)',
            color: '#12111a',
            fontWeight: 700,
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '7px',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.01em',
            lineHeight: 1,
          }}
        >
          <Star />
          {movie.score ? movie.score.toFixed(1) : "0.0"}
        </div>

        {/* Rating badge */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(0,0,0,0.62)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: '6px',
            letterSpacing: '0.06em',
          }}
        >
          {movie.language || "PG-13"}
        </div>

        {/* Coming soon band */}
        {movie.status === 'comingSoon' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.42)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                background: 'var(--accent)',
                color: '#12111a',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '5px 14px',
                borderRadius: '6px',
              }}
            >
              Coming Soon
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {movie.status || "TBA"}
            </span>
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div
        style={{
          padding: '4px 16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flex: 1,
        }}
      >
        {/* Genre pills */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {(movie.genre || []).map(g => (
            <GenrePill key={g} genre={g} />
          ))}
        </div>

        {/* Title */}
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '17px',
            lineHeight: 1.2,
            color: 'var(--text-primary)',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {movie.title}
        </h3>

        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          <span>{movie.duration_minutes} min</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {movie.director}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* CTA */}
        <button
          onClick={e => { e.stopPropagation(); if (movie.status === 'nowShowing') onBook() }}
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: '9px',
            border: movie.status === 'nowShowing' ? 'none' : '1.5px solid var(--border)',
            background: movie.status === 'nowShowing' ? 'var(--accent)' : 'transparent',
            color: movie.status === 'nowShowing' ? '#12111a' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '13px',
            cursor: movie.status === 'nowShowing' ? 'pointer' : 'default',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.02em',
            transition: 'opacity 0.18s',
          }}
          onMouseEnter={e => movie.status === 'nowShowing' && (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          {movie.status === 'nowShowing' ? 'Book Tickets' : `Opens ${movie.status}`}
        </button>
      </div>
    </article>
  )
}

// ─── Booking Modal ───────────────────────────────────────────────────────────
