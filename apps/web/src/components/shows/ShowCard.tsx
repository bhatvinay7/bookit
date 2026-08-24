import Link from "next/link";
import { ArrowUpRight, Clock, Star } from "lucide-react";
import type { Show } from "@/types";

interface ShowCardProps {
  show: Show;
  index?: number;
  onSelect?: (show: Show) => void;
}

export default function ShowCard({ show, onSelect }: ShowCardProps) {
  const showId = typeof show.id === "string" ? show.id : show._id?.$oid;
  const imageUrl = show.poster_url || show.backdrop_url || "/placeholder.jpg";
  const showType = show.show_type || "Event";

  return (
    <Link
      href={`/shows/${showId}`}
      onClick={() => onSelect?.(show)}
      className="group flex h-full min-w-0 flex-col rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--bg-subtle)] shadow-[var(--card-shadow)] transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[var(--card-shadow-hover)]">
        <img
          src={imageUrl}
          alt={show.title}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          loading="lazy"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/5 to-black/15" />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
          <span className="max-w-[72%] truncate rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md sm:px-3 sm:text-[11px]">
            {showType === "GameEvent" ? "Sports" : showType}
          </span>
          {typeof show.score === "number" && (
            <span className="flex items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-[10px] font-black text-slate-950 shadow-sm sm:text-[11px]">
              <Star className="h-3 w-3 fill-current" />
              {show.score.toFixed(1)}
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="mb-1 hidden text-[10px] font-bold uppercase tracking-[0.16em] text-white/65 sm:block">
                {show.status === "comingSoon" ? "Coming soon" : "Book now"}
              </p>
              <h3 className="line-clamp-2 font-display text-sm font-extrabold leading-tight drop-shadow-md sm:text-lg">
                {show.title}
              </h3>
            </div>
            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur-md transition-colors group-hover:bg-white group-hover:text-slate-950 sm:flex">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1 px-0.5 pt-3 sm:gap-1.5 sm:pt-4">
        <h3 className="line-clamp-1 font-display text-sm font-bold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)] sm:hidden">
          {show.title}
        </h3>
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-[var(--text-muted)] sm:text-xs">
          {show.language && <span className="truncate">{show.language}</span>}
          {show.language && show.duration_minutes && <span aria-hidden="true">•</span>}
          {show.duration_minutes && (
            <span className="flex shrink-0 items-center gap-1">
              <Clock className="h-3 w-3" />
              {show.duration_minutes}m
            </span>
          )}
          {!show.language && !show.duration_minutes && (
            <span>{show.status === "comingSoon" ? "Releasing soon" : "Tickets available"}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
