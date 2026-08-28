/* eslint-disable react-hooks/set-state-in-effect */
import { useState, Fragment, useEffect, useMemo } from "react";
import { useShowtimes, useSeats } from "@/hooks/useApi";
import type { Movie, SeatRow, SeatInfo } from "@/types";
import { Star } from "../movies/MovieCard";
import { useSocket } from "../SocketProvider";
import ShowtimeCard from "@/app/dashboard/components/ShowtimeCard";

const DATES = Array.from({ length: 7 }, (_, i) => { const d = new Date(2024, 2, 15 + i); return { date: d.getDate(), day: d.toLocaleDateString('en-US', { weekday: 'short' }), month: d.toLocaleDateString('en-US', { month: 'short' }), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } });

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
      {children}
    </p>
  )
}

export function BookingModal({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  const { data: realShowtimes, isLoading } = useShowtimes(movie.id);
  const [dateIdx, setDateIdx] = useState(0)
  const [selectedShowtimeId, setSelectedShowtimeId] = useState<number | null>(null)

  const { subscribe, unsubscribe, lockSeats, unlockSeats, lastMessage } = useSocket();
  const [lockedSeatIds, setLockedSeatIds] = useState<number[]>([]);
  const { data: realSeats, isLoading: seatsLoading, refetch } = useSeats(selectedShowtimeId);

  const [picked, setPicked] = useState<number[]>([])
  const [done, setDone] = useState(false)

  // Subscriptions
  useEffect(() => {
    if (selectedShowtimeId) {
      subscribe(selectedShowtimeId);
    }
    return () => {
      if (selectedShowtimeId) unsubscribe(selectedShowtimeId);
    }
  }, [selectedShowtimeId, subscribe, unsubscribe]);

  // Real-time events
  useEffect(() => {
    const msg = lastMessage as any;
    if (msg?.event === "lock_slot" && msg.seat_id) {
      setLockedSeatIds(prev => [...prev, msg.seat_id]);
    }
    if ((msg?.event === "SeatUnlocked" || msg?.event === "unlock_slot") && msg.seat_id) {
      setLockedSeatIds(prev => prev.filter(id => id !== msg.seat_id));
    }
    if (msg?.event === "lock_slots_response") {
      const locked: number[] = msg.locked_seat_ids || [];
      const failed: number[] = msg.failed_seat_ids || [];
      if (locked.length > 0) {
        setLockedSeatIds(prev => [...new Set([...prev, ...locked])]);
      }
      if (failed.length > 0) {
        setPicked(prev => prev.filter(id => !failed.includes(id)));
        alert(msg.message || "Failed to lock seat.");
      }
    }
    if (msg?.event === "unlock_slots_response") {
      const unlocked: number[] = msg.unlocked_seat_ids || [];
      if (unlocked.length > 0) {
        setLockedSeatIds(prev => prev.filter(id => !unlocked.includes(id)));
      }
    }
  }, [lastMessage]);

  // Transform SeatInfo[] into SeatRow[]
  const seatRows = useMemo(() => {
    if (!realSeats) return [];
    const rows = new Map<string, SeatInfo[]>();
    for (const s of realSeats) {
      if (!rows.has(s.row_letter)) rows.set(s.row_letter, []);
      rows.get(s.row_letter)!.push(s);
    }
    const sortedRowLetters = Array.from(rows.keys()).sort();
    return sortedRowLetters.map(row => ({
      row,
      type: rows.get(row)![0].seat_class.toLowerCase() as 'standard' | 'premium',
      seats: rows.get(row)!.sort((a, b) => a.seat_number - b.seat_number).map(s => ({
        id: s.seat_id,
        label: `${s.row_letter}${s.seat_number}`,
        col: s.seat_number,
        status: lockedSeatIds.includes(s.seat_id) || s.status === 'Booked' ? 'locked' : s.status === 'Available' ? 'available' : 'booked',
        price: parseFloat(s.price),
      }))
    }));
  }, [realSeats, lockedSeatIds]);

  const toggle = (id: number, status: 'available' | 'booked' | 'locked') => {
    if (status === 'booked' || status === 'locked') return
    setPicked(p => {
      if (p.includes(id)) {
        if (selectedShowtimeId) unlockSeats(selectedShowtimeId, [id]);
        return p.filter(s => s !== id);
      }
      if (selectedShowtimeId) lockSeats(selectedShowtimeId, [id]);
      return [...p, id];
    })
  }

  const pickedSeatsInfo = useMemo(() => {
    let sum = 0;
    let labels: string[] = [];
    seatRows.forEach(r => r.seats.forEach(s => {
      if (picked.includes(s.id)) {
        sum += s.price;
        labels.push(s.label);
      }
    }));
    return { sum, labels };
  }, [picked, seatRows]);

  if (done) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-6" style={{ backdropFilter: 'blur(16px)' }}>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-10 max-w-[420px] w-full text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--accent)] mx-auto mb-6 flex items-center justify-center text-4xl">🎬</div>
          <h2 className="font-display font-extrabold text-2xl text-[var(--text-primary)] mb-2">Booking Confirmed!</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-7 leading-relaxed">
            You're all set for <strong className="text-[var(--text-primary)]">{movie.title}</strong> on {DATES[dateIdx].label}.
          </p>
          <div className="bg-[var(--accent-bg)] border border-[var(--accent)] rounded-xl p-4 mb-5">
            <div className="text-xs text-[var(--accent-text)] font-semibold mb-1">
              Seats: {pickedSeatsInfo.labels.sort().join(', ')}
            </div>
            <div className="text-2xl font-black font-display text-[var(--text-primary)]">
              ${pickedSeatsInfo.sum.toFixed(2)}
            </div>
          </div>
          <button onClick={onClose} className="w-full p-3 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border)] font-semibold text-sm transition hover:bg-white/5">
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      className="fixed inset-0 z-[200] bg-black/80 flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      style={{ backdropFilter: 'blur(14px)' }}
    >
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] w-full max-w-[780px] sm:rounded-2xl overflow-hidden shadow-2xl relative min-h-screen sm:min-h-0 mx-auto">
        {/* Modal header */}
        <div className="relative h-[240px] sm:h-[200px] overflow-hidden">
          <img src={movie.backdrop_url || ""} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/20 flex items-center px-5 sm:px-7 gap-5">
            <img src={movie.poster_url || ""} alt={movie.title} className="w-[76px] h-[114px] object-cover rounded-lg shrink-0 shadow-lg hidden sm:block" />
            <div>
              <div className="flex gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-1 bg-[var(--accent)] text-[#12111a] font-bold text-xs px-2 py-1 rounded-md">
                  <Star /> {movie.score ? movie.score.toFixed(1) : "0.0"}
                </div>
                <span className="bg-white/15 text-white text-[11px] font-bold px-2 py-1 rounded-md tracking-wider">
                  {movie.language || "PG-13"}
                </span>
                <span className="bg-white/10 text-white/90 text-[11px] font-semibold px-2 py-1 rounded-md">
                  {movie.duration_minutes} min
                </span>
              </div>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white mb-1 leading-tight">{movie.title}</h2>
              <p className="text-white/60 text-xs sm:text-sm m-0">Dir. {movie.director} · {movie.language}</p>
            </div>
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/50 border border-white/20 text-white flex items-center justify-center text-xl hover:bg-black/70">
            ×
          </button>
        </div>

        {/* Form */}
        <div className="p-5 sm:p-7 flex flex-col gap-5 sm:gap-6">
          {/* Date */}
          <div>
            <Label>Select Date</Label>
            <div className="no-scroll-bar flex gap-2 overflow-x-auto pb-2">
              {DATES.map((d, i) => (
                <button
                  key={i}
                  onClick={() => setDateIdx(i)}
                  className={`flex flex-col items-center p-2 rounded-xl border shrink-0 transition-all ${dateIdx === i ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-transparent border-[var(--border)] hover:bg-white/5'}`}
                  style={{ minWidth: '60px' }}
                >
                  <span className={`text-[10px] font-bold uppercase mb-1 ${dateIdx === i ? 'text-[#12111a]' : 'text-[var(--text-muted)]'}`}>{d.month}</span>
                  <span className={`text-xl font-display font-black leading-none mb-1 ${dateIdx === i ? 'text-[#12111a]' : 'text-[var(--text-primary)]'}`}>{d.date}</span>
                  <span className={`text-[10px] font-semibold ${dateIdx === i ? 'text-[#12111a]' : 'text-[var(--text-muted)]'}`}>{d.day}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Showtime */}
          <div>
            <Label>Showtime & Seats</Label>
            {isLoading ? (
              <p className="text-[var(--text-muted)] text-sm">Loading showtimes...</p>
            ) : realShowtimes && realShowtimes.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                {realShowtimes.map(st => (
                  <div
                    key={st.id}
                    style={{ outline: selectedShowtimeId === st.id ? "2px solid var(--accent, #6366f1)" : "none", borderRadius: 14, cursor: st.booking_open ? "pointer" : "default" }}
                    onClick={() => { if (st.booking_open) setSelectedShowtimeId(st.id); }}
                  >
                    <ShowtimeCard
                      showtime={{
                        id: st.id,
                        start_time: st.start_time,
                        seconds_until_start: st.seconds_until_start,
                        booking_open: st.booking_open,
                        status: st.status as "upcoming" | "in_progress" | "ended",
                        available_seats: st.available_seats,
                        total_seats: st.total_seats,
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-sm">No showtimes available.</p>
            )}
          </div>

          {/* Seat map */}
          {selectedShowtimeId && (
            <div>
              <div className="flex justify-between items-end mb-3">
                <Label>Screen</Label>
                <div className="flex gap-3 text-[10px] font-semibold text-[var(--text-muted)]">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-[var(--card-bg)] border border-[var(--card-border)]"></div>Available</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-white/5 border border-transparent"></div>Booked</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-[var(--accent)] border border-[var(--accent)]"></div>Selected</div>
                </div>
              </div>

              {seatsLoading ? (
                <p className="text-[var(--text-muted)] text-sm">Loading seats...</p>
              ) : seatRows.length > 0 ? (
                <div className="bg-[var(--bg-subtle)] rounded-2xl p-4 sm:p-7 border border-[var(--border)] flex flex-col items-center w-full overflow-hidden">
                  <svg viewBox="0 0 400 30" style={{ width: '100%', maxWidth: '300px', margin: '0 auto 30px' }}>
                    <path d="M 0 30 Q 200 0 400 30" fill="none" stroke="var(--accent)" strokeWidth="4" opacity="0.4" />
                    <path d="M 0 30 Q 200 0 400 30" fill="none" stroke="url(#glow)" strokeWidth="12" opacity="0.1" />
                    <defs>
                      <linearGradient id="glow"><stop stopColor="var(--accent)" /><stop offset="1" stopColor="transparent" /></linearGradient>
                    </defs>
                  </svg>

                  <div className="w-full overflow-x-auto pb-4 no-scroll-bar">
                    <div className="min-w-max mx-auto flex flex-col gap-2">
                      {seatRows.map(r => (
                        <div key={r.row} className="flex items-center gap-3 sm:gap-5">
                          <div className="w-4 sm:w-5 font-extrabold text-[var(--text-muted)] text-xs sm:text-sm text-center">
                            {r.row}
                          </div>
                          <div className="flex gap-1 sm:gap-2">
                            {r.seats.map(s => {
                              const isPicked = picked.includes(s.id)
                              const isAvail = s.status === 'available'
                              const isLocked = s.status === 'locked'

                              let bg = isPicked ? 'var(--accent)' : 'var(--card-bg)'
                              if (!isAvail && !isPicked) bg = 'rgba(255,255,255,0.05)'
                              if (isLocked) bg = 'var(--text-muted)'

                              let border = isPicked ? `1px solid var(--accent)` : `1px solid var(--card-border)`
                              if (!isAvail && !isPicked) border = `1px solid transparent`

                              return (
                                <button
                                  key={s.id}
                                  disabled={!isAvail}
                                  onClick={() => toggle(s.id, s.status as 'available' | 'booked' | 'locked')}
                                  className="w-7 h-7 sm:w-8 sm:h-8 rounded sm:rounded-md flex items-center justify-center text-[10px] sm:text-[11px] font-extrabold transition-all"
                                  style={{
                                    background: bg, border,
                                    cursor: isAvail ? 'pointer' : 'not-allowed',
                                    color: isPicked ? '#12111a' : (isAvail ? 'var(--text-primary)' : 'rgba(255,255,255,0.1)'),
                                    opacity: isLocked ? 0.5 : 1
                                  }}
                                >
                                  {s.col}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[var(--text-muted)] text-sm">No seats available.</p>
              )}
            </div>
          )}

          <div className="flex justify-between items-center mt-2">
            <div>
              <p className="text-[var(--text-muted)] text-[11px] font-bold uppercase mb-1">Total Amount</p>
              <p className="font-display text-2xl sm:text-3xl font-black text-[var(--text-primary)] m-0">
                ${pickedSeatsInfo.sum.toFixed(2)}
              </p>
            </div>
            <button
              onClick={async () => {
                if (picked.length > 0) {
                  // Refetch seats from API to ensure we have the freshest data, 
                  // while relying on our 'picked' state for our own successful locks.
                  await refetch();
                  setDone(true);
                }
              }}
              disabled={picked.length === 0}
              className={`px-6 sm:px-8 py-3 rounded-xl font-bold transition-all ${picked.length > 0 ? 'bg-[var(--accent)] text-[#12111a] hover:opacity-90' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border)]'
                }`}
            >
              Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
