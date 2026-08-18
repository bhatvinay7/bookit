"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { UserNav } from "@/components/UserNav";
import { Clock, Calendar, MapPin, ChevronRight, ArrowLeft } from "lucide-react";
import type { ScheduleV2 } from "@/types/schedule";
import { useTheme } from "next-themes";

import type { Show } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ShowDetailsPage() {
  const params = useParams();
  const showId = params.id as string;
  const router = useRouter();
  const { theme } = useTheme();
  const dark = theme === "dark";

  const [show, setShow] = useState<Show | null>(null);
  const [schedules, setSchedules] = useState<ScheduleV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dateFilter, setDateFilter] = useState("");
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
    if (dateFilter && new Date(s.start_time).toLocaleDateString() !== dateFilter) return false;
    if (venueFilter && (s.venue_name || "Main Venue") !== venueFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ background: dark ? 'var(--bg)' : 'linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)' }}
      >
        <div className="w-12 h-12 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !show) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center text-white p-6 text-center"
        style={{ background: dark ? 'var(--bg)' : 'linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)' }}
      >
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
    <div 
      className="min-h-screen text-[var(--text-primary)] font-sans"
      style={{ background: dark ? 'var(--bg)' : 'linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)' }}
    >
      <nav className="w-full px-4 sm:px-8 py-4 flex items-center justify-between z-50 bg-[var(--nav-bg)] backdrop-blur-xl border-b border-[var(--divider)] shadow-sm sticky top-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-xl font-black tracking-tight text-[var(--text-primary)] font-display">Show Details</span>
        </div>
        <UserNav />
      </nav>

      <main className="w-full lg:w-[90%] max-w-none mx-auto px-6 md:px-12 py-12 flex flex-col lg:flex-row gap-12">
        
        {/* Left Col: Poster & Details */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6 lg:sticky lg:top-24 h-fit">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full aspect-[2/3] rounded-3xl overflow-hidden shadow-2xl border border-[var(--border)] bg-[var(--bg-subtle)] relative"
          >
            {show.poster_url ? (
              <img src={show.poster_url} alt={show.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">No Poster</div>
            )}
          </motion.div>
          <div>
            <h1 className="text-4xl font-black font-display mb-2 text-[var(--text-primary)]">{show.title}</h1>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold text-[var(--text-primary)]">{show.language}</span>
              <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-bold text-[var(--text-primary)]">{show.duration_minutes} min</span>
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
        </div>

        {/* Right Col: Schedules */}
        <div className="w-full lg:w-2/3">
          <h2 className="text-2xl font-bold font-display mb-6 text-[var(--text-primary)]">Available Showtimes</h2>
          
          {schedules.length > 0 && (
            <div className="flex flex-wrap gap-4 mb-8">
              <select 
                className="bg-[var(--card-bg)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl px-4 py-2 focus:outline-none focus:border-[var(--accent)] transition-colors"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              >
                <option value="">All Dates</option>
                {Array.from(new Set(schedules.map(s => new Date(s.start_time).toLocaleDateString()))).map(date => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>

              <select 
                className="bg-[var(--card-bg)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl px-4 py-2 focus:outline-none focus:border-[var(--accent)] transition-colors"
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
              >
                <option value="">All Venues</option>
                {Array.from(new Set(schedules.map(s => s.venue_name || "Main Venue"))).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          )}

          {filteredSchedules.length === 0 ? (
            <div className="p-8 bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] text-center text-[var(--text-secondary)]">
              No upcoming schedules available for this show.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredSchedules.map(schedule => {
                const date = new Date(schedule.start_time);
                const isOpen = (schedule.seconds_until_booking_open ?? 0) <= 0;
                
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={schedule.id}
                    className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors shadow-sm"
                  >
                    <div className="flex-1 w-full sm:w-auto flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-[var(--text-primary)]">
                          {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-lg font-bold text-[var(--accent)]">
                          {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {schedule.venue_name || "Main Venue"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {schedule.show_type}
                        </span>
                      </div>
                    </div>
                    
                    <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-6">
                      <div className="text-right">
                        <div className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Seats</div>
                        <div className="font-bold text-[var(--text-primary)]">
                          <span className="text-[var(--accent)]">{schedule.available_seats}</span> / {schedule.total_seats}
                        </div>
                      </div>
                      
                      <Link href={`/schedules/${schedule.id}`}>
                        <button 
                          disabled={!isOpen}
                          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${
                            isOpen 
                              ? 'bg-gradient-to-r from-[var(--accent)] to-yellow-500 text-[#12111a] hover:shadow-[0_0_15px_rgba(224,150,0,0.4)] hover:-translate-y-0.5' 
                              : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border)]'
                          }`}
                        >
                          {isOpen ? "Select Seats" : "Opens Soon"}
                          {isOpen && <ChevronRight className="w-4 h-4" />}
                        </button>
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
