import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, Clock } from "lucide-react";
import type { Show, ScheduleV2 } from "@/types";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface ShowDetailModalProps {
  show: Show | null;
  onClose: () => void;
  css: (v: string) => string;
}

export function ShowDetailModal({ show, onClose, css }: ShowDetailModalProps) {
  const router = useRouter();
  
  const [schedules, setSchedules] = useState<ScheduleV2[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  if (!show) return null;
  const showId = typeof show.id === "string" ? show.id : (show as any)._id?.$oid;
  const ratingColor = show.score && show.score >= 8.5 ? '#10b981' : show.score && show.score >= 7 ? '#f59e0b' : '#ef4444';

  useEffect(() => {
    if (showId) {
      fetch(`${API_URL}/api/user/schedules_v2/show/${showId}`)
        .then(r => r.json())
        .then(data => {
          setSchedules(data);
          if (data.length > 0) {
            setSelectedDate(data[0].date);
          }
        })
        .catch(console.error);
    }
  }, [showId]);

  const availableDates = useMemo(() => {
    return Array.from(new Set(schedules.map(s => s.date))).sort();
  }, [schedules]);

  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];
    return schedules.filter(s => s.date === selectedDate);
  }, [schedules, selectedDate]);

  const selectedSchedule = useMemo(() => {
    if (!selectedDate || !selectedSlot) return null;
    return availableSlots.find(s => s.slot === selectedSlot) || null;
  }, [availableSlots, selectedDate, selectedSlot]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 md:p-12 bg-[#020617]/90 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl bg-[var(--bg-raised)] rounded-3xl overflow-hidden border border-[var(--border)] shadow-[var(--card-shadow)] flex flex-col max-h-[90vh] overflow-y-auto hide-scrollbar"
        >
          {/* Hero Area */}
          <div className="relative overflow-hidden shrink-0" style={{ height: 400, background: '#0f172a' }}>
            <img
              src={show.poster_url || show.thumbnail_url || '/placeholder.jpg'}
              alt={show.title}
              className="w-full h-full object-cover opacity-50"
              style={{ objectPosition: 'center top' }}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, var(--bg-raised) 100%)' }}
            />
            
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 flex items-center justify-center p-2 text-white/80 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%' }}
            >
              <X size={20} strokeWidth={2.5} />
            </button>

            {/* Title area */}
            <div className="absolute bottom-0 left-0 right-0 px-8 pb-8 flex items-end gap-6">
              <img
                src={show.poster_url || show.thumbnail_url || '/placeholder.jpg'}
                alt={show.title}
                className="hidden sm:block w-32 h-44 object-cover rounded-xl flex-shrink-0"
                style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.6)', marginBottom: -32, border: '2px solid rgba(255,255,255,0.1)' }}
              />
              <div className="pb-2">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {(show.genre || []).map((g) => (
                    <span key={g} className="text-[var(--text-primary)]/90 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(124, 58, 237, 0.12)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                      {g}
                    </span>
                  ))}
                  {show.language && (
                     <span className="text-[var(--text-primary)]/80 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                       style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                       {show.language}
                     </span>
                  )}
                </div>
                <h1 className="text-[var(--text-primary)] font-display font-black mb-1 drop-shadow-md"
                  style={{ fontSize: 34, lineHeight: 1.1 }}>
                  {show.title}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-[var(--text-secondary)] text-sm font-semibold mt-2">
                  <span className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded backdrop-blur-md">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={ratingColor}>
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <strong style={{ color: ratingColor }}>{show.score ? show.score.toFixed(1) : "N/A"}</strong>
                  </span>
                  {show.duration_minutes && <span>⏱ {show.duration_minutes}m</span>}
                  <span className="px-2 py-0.5 rounded text-xs font-bold uppercase"
                    style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    {show.show_type}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="px-8 pt-12 pb-10 flex flex-col md:flex-row gap-8">
            <div className="flex-1 space-y-8 md:pl-[152px]">
              <div>
                <h2 className="font-display font-bold text-[var(--text-primary)] mb-3" style={{ fontSize: 18 }}>About</h2>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-4">{show.description || "No description available."}</p>
                
                {show.director && (
                  <div className="flex items-center gap-3 mt-4 p-3 glass rounded-xl inline-flex border border-white/5">
                     <img src={show.director_photo_url || "/avatar-placeholder.png"} className="w-10 h-10 rounded-full object-cover bg-black/20" alt={show.director} />
                     <div>
                       <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold">Director</p>
                       <p className="text-sm font-semibold text-[var(--text-primary)]">{show.director}</p>
                     </div>
                  </div>
                )}
                
                {show.host && (
                  <div className="flex items-center gap-3 mt-4 p-3 glass rounded-xl inline-flex border border-white/5">
                     <img src={show.host_photo_url || "/avatar-placeholder.png"} className="w-10 h-10 rounded-full object-cover bg-black/20" alt={show.host} />
                     <div>
                       <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold">Host</p>
                       <p className="text-sm font-semibold text-[var(--text-primary)]">{show.host}</p>
                     </div>
                  </div>
                )}
              </div>

              {show.cast && show.cast.length > 0 && (
                <div>
                  <h2 className="font-display font-bold text-[var(--text-primary)] mb-3" style={{ fontSize: 18 }}>Cast</h2>
                  <div className="flex flex-wrap gap-3">
                    {show.cast.map((actor, idx) => (
                      <div key={idx} className="glass rounded-xl px-3 py-2 text-center flex flex-col items-center" style={{ minWidth: 90 }}>
                        <img 
                          src={actor.photo_url || "/avatar-placeholder.png"} 
                          alt={actor.name}
                          className="w-12 h-12 rounded-full mb-2 object-cover bg-[var(--border)] border-2 border-[var(--bg-raised)]"
                        />
                        <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">{actor.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {show.performers && show.performers.length > 0 && (
                <div>
                  <h2 className="font-display font-bold text-[var(--text-primary)] mb-3" style={{ fontSize: 18 }}>Performers</h2>
                  <div className="flex flex-wrap gap-3">
                    {show.performers.map((performer, idx) => (
                      <div key={idx} className="glass rounded-xl px-3 py-2 text-center flex flex-col items-center" style={{ minWidth: 90 }}>
                        <img 
                          src={performer.photo_url || "/avatar-placeholder.png"} 
                          alt={performer.name}
                          className="w-12 h-12 rounded-full mb-2 object-cover bg-[var(--border)] border-2 border-[var(--bg-raised)]"
                        />
                        <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">{performer.name}</p>
                        {performer.role && <p className="text-[10px] text-[var(--text-secondary)]">{performer.role}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(show.team_a || show.team_b) && (
                <div>
                  <h2 className="font-display font-bold text-[var(--text-primary)] mb-4" style={{ fontSize: 18 }}>Matchup</h2>
                  <div className="flex items-center justify-center gap-8 glass rounded-2xl p-6">
                    {show.team_a && (
                      <div className="flex flex-col items-center">
                        <img src={show.team_a.logo_url || "/placeholder.jpg"} alt={show.team_a.name} className="w-16 h-16 object-contain mb-3 drop-shadow-md" />
                        <span className="font-bold text-[var(--text-primary)]">{show.team_a.name}</span>
                      </div>
                    )}
                    <span className="text-2xl font-black text-[var(--text-muted)] italic">VS</span>
                    {show.team_b && (
                      <div className="flex flex-col items-center">
                        <img src={show.team_b.logo_url || "/placeholder.jpg"} alt={show.team_b.name} className="w-16 h-16 object-contain mb-3 drop-shadow-md" />
                        <span className="font-bold text-[var(--text-primary)]">{show.team_b.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="w-full md:w-80 shrink-0 flex flex-col gap-4">
               <div className="glass rounded-2xl p-5 border border-white/20">
                 <h3 className="font-display font-bold text-[var(--text-primary)] text-lg mb-4 flex items-center gap-2">
                   <Calendar size={18} className="text-[var(--accent)]" /> 
                   Select Date
                 </h3>
                 
                 {availableDates.length === 0 ? (
                   <p className="text-sm text-[var(--text-muted)]">No schedules available.</p>
                 ) : (
                   <div className="flex flex-wrap gap-2 mb-6">
                     {availableDates.map(date => (
                       <button
                         key={date}
                         onClick={() => { setSelectedDate(date); setSelectedSlot(null); }}
                         className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                           selectedDate === date 
                             ? 'bg-[var(--accent)] text-white shadow-md border-transparent' 
                             : 'bg-black/20 text-[var(--text-secondary)] border border-white/10 hover:bg-black/40 hover:text-white'
                         }`}
                       >
                         {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                       </button>
                     ))}
                   </div>
                 )}

                 {selectedDate && availableSlots.length > 0 && (
                   <>
                     <h3 className="font-display font-bold text-[var(--text-primary)] text-lg mb-4 flex items-center gap-2">
                       <Clock size={18} className="text-[var(--accent)]" />
                       Select Time Slot
                     </h3>
                     <div className="flex flex-col gap-2 mb-6">
                       {availableSlots.map(s => (
                         <button
                           key={s.id}
                           onClick={() => setSelectedSlot(s.slot)}
                           className={`p-3 rounded-xl flex items-center justify-between transition-all ${
                             selectedSlot === s.slot 
                               ? 'bg-[var(--accent)] text-white shadow-lg border-transparent' 
                               : 'bg-black/20 text-[var(--text-secondary)] border border-white/10 hover:bg-black/40 hover:text-white'
                           }`}
                         >
                           <span className="font-bold">{s.slot}</span>
                           <span className="text-xs opacity-80 bg-black/20 px-2 py-1 rounded-md">
                             {new Date(s.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                           </span>
                         </button>
                       ))}
                     </div>
                   </>
                 )}

                 <button
                   disabled={!selectedSchedule}
                   onClick={() => {
                     if (selectedSchedule) {
                       onClose();
                       router.push(`/schedules/${selectedSchedule.id}`);
                     }
                   }}
                   className={`w-full py-3 text-sm rounded-xl shadow-lg transition-all ${
                     selectedSchedule 
                       ? 'btn-primary' 
                       : 'bg-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border)]'
                   }`}
                 >
                   {selectedSchedule ? 'Select Seats →' : 'Pick a Time'}
                 </button>
               </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
