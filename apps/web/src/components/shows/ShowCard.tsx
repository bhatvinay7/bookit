import React from "react";
import type { Show } from "@/types";

interface ShowCardProps {
  show: Show;
  index: number;
  onSelect?: (show: Show) => void;
}

export default function ShowCard({ show, onSelect }: ShowCardProps) {
  return (
    <div 
      className="flex flex-col group cursor-pointer h-full bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] overflow-hidden hover:shadow-[var(--card-shadow-hover)] transition-all duration-300"
      onClick={() => onSelect && onSelect(show)}
    >
      <div className="relative w-full aspect-[4/5] bg-[var(--bg-subtle)] overflow-hidden">
        {/* Rating/Type Badge mimicking the yellow pill from design */}
        <div className="absolute top-3 left-3 z-10">
          <span className="bg-[#facc15] text-[#1a1a1a] text-[10px] sm:text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-sm">
            {show.score ? `Rating ${(show.score).toFixed(1)}/10` : show.show_type}
          </span>
        </div>
        
        <img
          src={show.poster_url || show.backdrop_url || '/placeholder.jpg'}
          alt={show.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
      </div>

      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-display font-bold text-base md:text-lg text-[var(--text-primary)] leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
          {show.title}
        </h3>
        {/* We explicitly drop venue and time per user request, and use description or fallback */}
        <p className="text-[var(--text-secondary)] text-xs md:text-sm leading-relaxed line-clamp-2">
          {show.description || `Experience this incredible ${show.show_type.toLowerCase()} event.`}
        </p>
      </div>
    </div>
  );
}
