import React from "react";
import type { Show } from "@/types";
import { formatDistanceToNow } from "date-fns";

interface MovieCardProps {
  show: Show;
  index: number;
  onSelect?: (show: Show) => void;
}

const GENRE_COLORS: Record<string, string> = {
  'Sci-Fi': 'rgba(14,165,233,0.15)',
  Action: 'rgba(239,68,68,0.12)',
  Drama: 'rgba(168,85,247,0.15)',
  Thriller: 'rgba(245,158,11,0.15)',
  Mythology: 'rgba(16,185,129,0.15)',
  'Period Action': 'rgba(249,115,22,0.15)',
  Crime: 'rgba(239,68,68,0.12)',
};
const GENRE_TEXT: Record<string, string> = {
  'Sci-Fi': '#0284c7',
  Action: '#dc2626',
  Drama: '#9333ea',
  Thriller: '#d97706',
  Mythology: '#059669',
  'Period Action': '#ea580c',
  Crime: '#dc2626',
};

export default function MovieCard({ show, onSelect }: MovieCardProps) {
  const rating = show.score || 0;
  const ratingColor = rating >= 8.5 ? '#10b981' : rating >= 7 ? '#f59e0b' : '#ef4444';

  const content = (
    <div
      className="glass card-shadow card-hover-lift rounded-2xl overflow-hidden flex flex-col"
      style={{ width: 164, minWidth: 164, background: 'rgba(255, 255, 255, 0.85)' }}
    >
      {/* Poster */}
      <div className="relative overflow-hidden" style={{ height: 230, background: '#1e1b4b' }}>
        <img
          src={show.poster_url || show.thumbnail_url || '/placeholder.jpg'}
          alt={show.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Status badge */}
        <div className="absolute top-2.5 left-2.5">
          <span
            className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: show.status === 'nowShowing' ? 'rgba(16,185,129,0.9)' : 'rgba(245,158,11,0.9)',
              backdropFilter: 'blur(4px)',
            }}
          >
            {show.status === 'nowShowing' ? 'NOW SHOWING' : 'UPCOMING'}
          </span>
        </div>
        {/* Rating */}
        {show.score && (
          <div
            className="absolute top-2.5 right-2.5 flex items-center gap-0.5 rounded-full px-2 py-0.5"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill={ratingColor}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="text-white text-[11px] font-bold">{show.score}</span>
          </div>
        )}
        {/* Bottom gradient for title */}
        <div
          className="absolute bottom-0 left-0 right-0 h-20"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}
        />
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <h3
          className="font-display font-700 text-ink leading-tight line-clamp-2"
          style={{ fontSize: 13, fontWeight: 700 }}
        >
          {show.title}
        </h3>
        <div className="flex justify-between items-center text-xs text-slate-500">
          <p>
            {show.duration_minutes ? `${show.duration_minutes}m` : ''} 
            {show.duration_minutes && show.language ? ' · ' : ''}
            {show.language}
          </p>
          {show.next_start_time && (
            <p className="font-semibold text-primary" style={{ fontSize: 10 }}>
              {new Date(show.next_start_time) > new Date() 
                ? `Starts ${formatDistanceToNow(new Date(show.next_start_time), { addSuffix: true })}` 
                : 'Started'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          {(show.genre || []).slice(0, 2).map((g) => (
            <span
              key={g}
              className="genre-pill"
              style={{
                background: GENRE_COLORS[g] || 'rgba(109,40,217,0.1)',
                color: GENRE_TEXT[g] || '#6d28d9',
                fontSize: 9,
                padding: '2px 7px',
              }}
            >
              {g}
            </span>
          ))}
        </div>
        <button
          className="btn-primary w-full mt-2 py-2 text-xs rounded-lg"
          onClick={(e) => { e.stopPropagation(); onSelect && onSelect(show); }}
        >
          Book Ticket
        </button>
      </div>
    </div>
  );

  return (
    <div onClick={() => onSelect && onSelect(show)}>
      {content}
    </div>
  );
}
