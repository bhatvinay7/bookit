"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { UserNav } from "@/components/UserNav";
import { Clock, MapPin, ChevronRight, ArrowLeft, X } from "lucide-react";
import type { ScheduleV2 } from "@/types/schedule";

import type { Show } from "@/types";
import { ScheduleCalendar, type ScheduleSlot } from "@/components/schedules/ScheduleCalendar";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function ScheduleCards({ schedules }: { schedules: ScheduleV2[] }) {
  if (schedules.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-8 text-center text-[var(--text-secondary)]">
        No schedules match these filters.
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {schedules.map((schedule) => {
        const date = new Date(schedule.start_time);
        const isOpen = schedule.booking_open === true;
        const opensAt = new Date(schedule.booking_open_at);

        return (
          <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            key={schedule.id}
            className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:border-[var(--accent)]/50 hover:shadow-[var(--card-shadow-hover)] sm:flex-row sm:items-center sm:p-5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold text-[var(--text-primary)] sm:text-lg">
                  {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="font-bold text-[var(--accent)] sm:text-lg">
                  {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] sm:text-sm">
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">{schedule.venue_name || "Main Venue"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {schedule.show_type}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[var(--divider)] pt-4 sm:w-auto sm:border-0 sm:pt-0">
              <div className="text-left sm:text-right">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Seats</div>
                <div className="font-bold text-[var(--text-primary)]">
                  <span className="text-[var(--accent)]">{schedule.available_seats}</span> / {schedule.total_seats}
                </div>
              </div>
              {isOpen ? (
                <Link
                  href={`/schedules/${schedule.id}`}
                  className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-yellow-500 px-4 py-2.5 text-sm font-bold text-[#12111a] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(224,150,0,0.4)]"
                >
                  Select Seats <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <div className="max-w-40 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-right text-xs font-semibold text-[var(--text-muted)]">
                  <span className="block">Reservations not open</span>
                  <span className="block font-normal">
                    Opens {opensAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              )}
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}

export default function ShowDetailsPage() {
  const params = useParams();
  const showId = params.id as string;

  const [show, setShow] = useState<Show | null>(null);
  const [schedules, setSchedules] = useState<ScheduleV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);

  const [dateFilter, setDateFilter] = useState("");
  const [slotFilter, setSlotFilter] = useState<ScheduleSlot>("All");
  const [venueFilter, setVenueFilter] = useState("");

  useEffect(() => {
    async function fetchShowAndSchedules() {
      try {
        const schedulesUrl = new URL(`${API_URL}/api/user/schedules_v2/show/${showId}`);
        const selectedCity = sessionStorage.getItem("bookit_city");
        if (selectedCity && selectedCity !== "All") {
          schedulesUrl.searchParams.set("city", selectedCity);
        }

        const [showRes, schedulesRes] = await Promise.all([
          fetch(`${API_URL}/api/user/shows/${showId}`),
          fetch(schedulesUrl)
        ]);

        if (!showRes.ok) throw new Error("Failed to fetch show details");
        const showData = await showRes.json();
        setShow(showData);

        if (schedulesRes.ok) {
          const schedData = await schedulesRes.json();
          setSchedules(schedData);
          setSchedulePickerOpen(schedData.length > 0);
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

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        
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

        <section className="mt-10 rounded-3xl border border-[var(--border)] bg-[var(--card-bg)] p-5 shadow-[var(--card-shadow)] sm:mt-12 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-7">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)] sm:text-xs">Choose a session</p>
            <h2 className="font-display text-2xl font-black text-[var(--text-primary)]">Available Showtimes</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {schedules.length ? `${schedules.length} schedules are available for this show.` : "No upcoming schedules are available for this show."}
            </p>
          </div>
          <button
            type="button"
            disabled={schedules.length === 0}
            onClick={() => setSchedulePickerOpen(true)}
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-yellow-500 px-5 py-2.5 text-sm font-bold text-[#12111a] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0"
          >
            View all schedules <ChevronRight className="h-4 w-4" />
          </button>
        </section>

      </main>

      {schedulePickerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Available showtimes"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSchedulePickerOpen(false); }}
        >
          <section className="flex h-[90vh] w-[92vw] max-w-[1500px] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--card-bg)] px-5 py-5 sm:px-7">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">Choose a session</p>
                <h2 className="mt-1 font-display text-2xl font-black text-[var(--text-primary)] sm:text-3xl">All available showtimes</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{filteredSchedules.length} of {schedules.length} schedules shown</p>
              </div>
              <button
                type="button"
                onClick={() => setSchedulePickerOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                aria-label="Close schedules"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(300px,0.7fr)_minmax(0,1.8fr)]">
              <aside className="overflow-y-auto border-b border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-6 lg:border-b-0 lg:border-r">
                <ScheduleCalendar
                  schedules={schedules}
                  selectedDate={dateFilter}
                  selectedSlot={slotFilter}
                  onDateChange={setDateFilter}
                  onSlotChange={setSlotFilter}
                />
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Venue
                  <select
                    className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    value={venueFilter}
                    onChange={(event) => setVenueFilter(event.target.value)}
                  >
                    <option value="">All venues</option>
                    {Array.from(new Set(schedules.map((schedule) => schedule.venue_name || "Main Venue"))).map((venue) => (
                      <option key={venue} value={venue}>{venue}</option>
                    ))}
                  </select>
                </label>
              </aside>
              <div className="min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-7">
                <ScheduleCards schedules={filteredSchedules} />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
