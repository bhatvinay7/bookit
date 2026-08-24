"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { UserNav } from "@/components/UserNav";
import { Clock, MapPin, ChevronRight, ArrowLeft } from "lucide-react";
import type { ScheduleV2 } from "@/types/schedule";

import type { Show } from "@/types";
import { ScheduleCalendar, type ScheduleSlot } from "@/components/schedules/ScheduleCalendar";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ShowDetailsPage() {
  const params = useParams();
  const showId = params.id as string;

  const [show, setShow] = useState<Show | null>(null);
  const [schedules, setSchedules] = useState<ScheduleV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dateFilter, setDateFilter] = useState("");
  const [slotFilter, setSlotFilter] = useState<ScheduleSlot>("All");
  const [venueFilter, setVenueFilter] = useState("");

  useEffect(() => {
    async function fetchShowAndSchedules() {
      try {
        const [showRes, schedulesRes] = await Promise.all([
          fetch(`${API_URL}/api/user/shows/${showId}`),
          fetch(`${API_URL}/api/user/schedules_v2/show/${showId}`)
        ]);

        if (!showRes.ok) throw new Error("Failed to fetch show details");
        const showData = await showRes.json();
        setShow(showData);

        if (schedulesRes.ok) {
          const schedData = await schedulesRes.json();
          setSchedules(schedData);
          if (schedData.length > 0) setDateFilter(schedData[0].date);
        }
      } catch (err: unknown) {
        setError((err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    }
    if (showId) {
      fetchShowAndSchedules();
    }
  }, [showId]);

  const filteredSchedules = schedules.filter(s => {
    if (dateFilter && s.date !== dateFilter) return false;
    if (slotFilter !== "All" && s.slot !== slotFilter) return false;
    if (venueFilter && (s.venue_name || "Main Venue") !== venueFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="w-12 h-12 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !show) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-center text-[var(--text-primary)]">
        <div>
          <h1 className="text-2xl font-bold text-red-500 mb-4">{error || "Show not found"}</h1>
          <Link href="/shows">
            <button className="px-6 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-all text-black dark:text-white">Go Back</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] font-sans text-[var(--text-primary)]">
      <nav className="sticky top-0 z-50 border-b border-[var(--divider)] bg-[var(--nav-bg)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link href="/shows" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-subtle)]" aria-label="Back to shows">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <span className="truncate font-display text-lg font-black tracking-tight text-[var(--text-primary)] sm:text-xl">Show Details</span>
          </div>
          <UserNav />
        </div>
      </nav>

      <main className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-8 px-4 py-5 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)] lg:gap-10 lg:px-8 lg:py-12 xl:gap-12">
        
        {/* Wide artwork with show details directly below it. */}
        <section className="w-full min-w-0 flex flex-col gap-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative aspect-[4/3] max-h-[560px] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] shadow-2xl sm:aspect-[16/9] md:aspect-[2/1] md:rounded-3xl"
          >
            {show.backdrop_url || show.poster_url ? (
              <img
                src={show.backdrop_url || show.poster_url || ""}
                alt={show.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">No Poster</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md sm:bottom-5 sm:left-5 sm:text-xs">
              {show.show_type === "GameEvent" ? "Sports" : show.show_type}
            </span>
          </motion.div>
          <div className="w-full max-w-4xl">
            <h1 className="mb-3 font-display text-3xl font-black leading-tight tracking-tight text-[var(--text-primary)] sm:text-4xl lg:text-5xl">{show.title}</h1>
            <div className="flex flex-wrap gap-2 mb-4">
              {show.language && <span className="rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-3 py-1 text-xs font-bold text-[var(--text-primary)]">{show.language}</span>}
              {show.duration_minutes && <span className="rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-3 py-1 text-xs font-bold text-[var(--text-primary)]">{show.duration_minutes} min</span>}
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed mb-6">{show.description}</p>
            {show.cast && show.cast.length > 0 && (
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Cast</h3>
                <div className="flex flex-wrap gap-2">
                  {show.cast.map(c => (
                    <span key={c.name} className="px-3 py-1 bg-[var(--card-bg)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)]">{c.name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Performers / Host */}
            {(show.host || (show.performers && show.performers.length > 0)) && (
              <div className="mt-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">Lineup & Host</h3>
                <div className="flex flex-wrap gap-4">
                  {show.host && (
                    <div className="flex items-center gap-3 bg-[var(--card-bg)] border border-[var(--border)] p-3 rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-purple-500 flex items-center justify-center shadow-lg">
                        <span className="text-white font-bold text-lg">{show.host.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider leading-none mb-1">Host</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] leading-none">{show.host}</p>
                      </div>
                    </div>
                  )}
                  {show.performers && show.performers.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 bg-[var(--card-bg)] border border-[var(--border)] p-3 rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] overflow-hidden flex items-center justify-center">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[var(--text-secondary)] font-bold text-lg">{p.name.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider leading-none mb-1">{p.role || "Performer"}</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] leading-none">{p.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Match / Sport details */}
            {(show.sport || (show.team_a && show.team_b)) && (
              <div className="mt-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Match Details {show.sport ? `• ${show.sport}` : ''}
                </h3>
                
                {show.team_a && show.team_b && (
                  <div className="flex items-center justify-between bg-[var(--card-bg)] border border-[var(--border)] p-6 rounded-2xl">
                    <div className="flex flex-col items-center flex-1">
                      {show.team_a.logo_url ? (
                        <img src={show.team_a.logo_url} className="w-16 h-16 object-contain mb-2" alt={show.team_a.name} />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-[var(--bg-subtle)] mb-2" />
                      )}
                      <span className="text-[var(--text-primary)] text-sm font-bold text-center leading-tight">{show.team_a.name}</span>
                    </div>
                    
                    <div className="px-4 flex flex-col items-center">
                      <span className="text-xl font-black text-[var(--text-muted)] mb-2">VS</span>
                      <div className="w-[1px] h-8 bg-[var(--border)]"></div>
                    </div>

                    <div className="flex flex-col items-center flex-1">
                      {show.team_b.logo_url ? (
                        <img src={show.team_b.logo_url} className="w-16 h-16 object-contain mb-2" alt={show.team_b.name} />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-[var(--bg-subtle)] mb-2" />
                      )}
                      <span className="text-[var(--text-primary)] text-sm font-bold text-center leading-tight">{show.team_b.name}</span>
                    </div>
                  </div>
                )}
                
                {show.venue && (
                  <div className="mt-4 flex items-center gap-2 text-[var(--text-secondary)] font-medium bg-[var(--bg-subtle)] p-3 rounded-lg border border-[var(--border)]">
                    <MapPin className="w-5 h-5 text-[var(--accent)]" />
                    <span>{show.venue}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Schedules */}
        <section className="w-full min-w-0 lg:sticky lg:top-24">
          <div className="mb-5">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)] sm:text-xs">Choose a session</p>
            <h2 className="font-display text-2xl font-black text-[var(--text-primary)] sm:text-3xl">Available Showtimes</h2>
          </div>
          
          {schedules.length > 0 && (
            <>
              <ScheduleCalendar
                schedules={schedules}
                selectedDate={dateFilter}
                selectedSlot={slotFilter}
                onDateChange={setDateFilter}
                onSlotChange={setSlotFilter}
              />
              <div className="mb-6 flex flex-wrap gap-4 sm:mb-8">
              <select 
                className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none sm:w-auto"
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
              >
                <option value="">All Venues</option>
                {Array.from(new Set(schedules.map(s => s.venue_name || "Main Venue"))).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              </div>
            </>
          )}

          {filteredSchedules.length === 0 ? (
            <div className="p-8 bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] text-center text-[var(--text-secondary)]">
              No upcoming schedules available for this show.
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:gap-4">
              {filteredSchedules.map(schedule => {
                const date = new Date(schedule.start_time);
                const isOpen = (schedule.seconds_until_booking_open ?? 0) <= 0;
                
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={schedule.id}
                    className="flex flex-col items-stretch gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:border-[var(--accent)]/50 hover:shadow-[var(--card-shadow-hover)] sm:flex-row sm:items-center sm:gap-6 sm:p-5"
                  >
                    <div className="flex-1 w-full sm:w-auto flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-bold text-[var(--text-primary)] sm:text-lg">
                          {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="font-bold text-[var(--accent)] sm:text-lg">
                          {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] sm:text-sm">
                        <span className="flex min-w-0 items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          <span className="truncate">{schedule.venue_name || "Main Venue"}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {schedule.show_type}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex w-full items-center justify-between gap-4 border-t border-[var(--divider)] pt-4 sm:w-auto sm:justify-end sm:gap-6 sm:border-0 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] sm:text-xs">Seats</div>
                        <div className="font-bold text-[var(--text-primary)]">
                          <span className="text-[var(--accent)]">{schedule.available_seats}</span> / {schedule.total_seats}
                        </div>
                      </div>
                      
                      {isOpen ? (
                        <Link
                          href={`/schedules/${schedule.id}`}
                          className="flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-yellow-500 px-4 py-2.5 text-sm font-bold text-[#12111a] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(224,150,0,0.4)] sm:px-5"
                        >
                          Select Seats
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <span className="flex min-h-11 cursor-not-allowed items-center rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5 text-sm font-bold text-[var(--text-muted)] sm:px-5">
                          Opens Soon
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
