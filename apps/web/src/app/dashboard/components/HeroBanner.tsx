import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin, Star, Ticket } from "lucide-react";
import type { Show } from "@/types";

interface HeroBannerProps {
  shows: Show[];
  onSelect: (show: Show) => void;
}

export function HeroBanner({ shows, onSelect }: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (shows.length <= 1) return;
    const interval = window.setInterval(() => {
      setCurrentIndex((current) => (current + 1) % shows.length);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [shows.length]);

  if (shows.length === 0) return null;

  const safeIndex = currentIndex % shows.length;
  const activeShow = shows[safeIndex];
  const showId = typeof activeShow.id === "string" ? activeShow.id : activeShow._id?.$oid;
  const activeKey = showId || activeShow.title;
  const heroImage = activeShow.backdrop_url || activeShow.poster_url || "/placeholder.jpg";
  const next = () => setCurrentIndex((current) => (current + 1) % shows.length);
  const previous = () => setCurrentIndex((current) => (current - 1 + shows.length) % shows.length);
  const releaseYear = activeShow.next_start_time
    ? new Date(activeShow.next_start_time).getFullYear()
    : null;

  return (
    <section className="group relative isolate h-[470px] w-full overflow-hidden border-y border-white/10 bg-slate-950 shadow-2xl sm:h-[520px] lg:h-[570px]">
      <AnimatePresence mode="wait">
        <motion.img
          key={`${activeKey}-image`}
          src={heroImage}
          alt=""
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/75 to-slate-950/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_35%,transparent_0%,rgba(2,6,23,0.2)_42%,rgba(2,6,23,0.72)_100%)]" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl items-end px-4 pb-16 pt-12 sm:px-6 sm:pb-20 lg:items-center lg:px-8 lg:pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeKey}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="max-w-2xl text-white"
          >
            <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-5">
              <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 sm:text-xs">
                Featured
              </span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-md sm:text-xs">
                {activeShow.show_type === "GameEvent" ? "Sports" : activeShow.show_type}
              </span>
              {typeof activeShow.score === "number" && (
                <span className="flex items-center gap-1 rounded-full border border-white/20 bg-black/25 px-3 py-1 text-xs font-bold backdrop-blur-md">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {activeShow.score.toFixed(1)}
                </span>
              )}
            </div>

            <h1 className="max-w-2xl font-display text-4xl font-black leading-[0.98] tracking-[-0.04em] drop-shadow-xl sm:text-5xl lg:text-7xl">
              {activeShow.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-white/75 sm:mt-5 sm:text-sm">
              {releaseYear && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-[var(--accent)]" />
                  {releaseYear}
                </span>
              )}
              {activeShow.duration_minutes && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-[var(--accent)]" />
                  {activeShow.duration_minutes} min
                </span>
              )}
              {(activeShow.venue || activeShow.city) && (
                <span className="flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{activeShow.venue || activeShow.city}</span>
                </span>
              )}
            </div>

            <p className="mt-4 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/70 sm:mt-5 sm:line-clamp-3 sm:text-base">
              {activeShow.description || "Discover an unforgettable experience and reserve the best seats before they are gone."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3 sm:mt-7">
              <Link
                href={`/shows/${showId}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 sm:px-6"
              >
                <Ticket className="h-4 w-4" />
                View showtimes
              </Link>
              <button
                type="button"
                onClick={() => onSelect(activeShow)}
                className="min-h-11 rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:px-6"
              >
                More details
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {shows.length > 1 && (
        <>
          <div className="absolute bottom-5 left-4 z-20 flex items-center gap-2 sm:bottom-7 sm:left-6 lg:left-auto lg:right-8">
            {shows.map((show, index) => (
              <button
                key={typeof show.id === "string" ? show.id : show._id?.$oid || index}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`h-1.5 rounded-full transition-all ${index === safeIndex ? "w-8 bg-[var(--accent)]" : "w-2 bg-white/40 hover:bg-white/70"}`}
                aria-label={`Show featured item ${index + 1}`}
              />
            ))}
          </div>

          <div className="absolute bottom-4 right-4 z-20 flex gap-2 sm:bottom-6 sm:right-6 lg:bottom-24 lg:right-8">
            <button
              type="button"
              onClick={previous}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-white hover:text-slate-950"
              aria-label="Previous featured show"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-white hover:text-slate-950"
              aria-label="Next featured show"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
