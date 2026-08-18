import React, { useState, useEffect } from "react";
import type { Show, CastMember, PerformerInfo, TeamInfo } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Calendar, Clock, Clapperboard, Monitor, Sparkles, PlayCircle, Bookmark, Share2, Ticket, MapPin, Trophy, Globe, Music } from "lucide-react";

// MAIN COMPONENT
export function HeroBanner({ shows, onSelect }: { shows: Show[], onSelect: (s: Show) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!shows || shows.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % shows.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [shows]);

  if (!shows || shows.length === 0) return null;

  const activeShow = shows[currentIndex];
  const activeKey = typeof activeShow.id === "string" ? activeShow.id : (activeShow as any)._id?.$oid || Math.random().toString();

  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % shows.length);
  const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + shows.length) % shows.length);

  return (
    <div className="w-full relative overflow-hidden rounded-[2.5rem] flex flex-col md:flex-row h-auto md:h-[550px] group shadow-lg border border-slate-200/80 dark:border-white/10">
      
      {/* ════ BACKGROUND GRADIENT & BLUR ════ */}
      <div className="absolute inset-0 pointer-events-none bg-slate-100 overflow-hidden">
        {/* Soft Mesh Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-blue-50 opacity-90" />
        
        {/* Blurry Clouds (Light Gray & Blue) */}
        <div className="absolute -top-[10%] -left-[10%] w-[60vw] h-[60vh] rounded-full bg-slate-300/60 blur-[100px]" />
        <div className="absolute top-[10%] right-[-10%] w-[50vw] h-[60vh] rounded-full bg-blue-200/50 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[10%] w-[70vw] h-[50vh] rounded-full bg-slate-200/70 blur-[100px]" />
      </div>

      {/* ════ LEFT SIDE: POSTER (35%) ════ */}
      <HeroPoster 
        activeShow={activeShow} 
        activeKey={activeKey} 
        onNext={handleNext} 
        onPrev={handlePrev} 
        showsCount={shows.length}
        currentIndex={currentIndex}
        onDotClick={setCurrentIndex}
      />

      {/* ════ RIGHT SIDE: INFO (65%) ════ */}
      <div className="w-full md:w-[65%] p-6 md:px-12 md:py-8 flex flex-col justify-center relative z-10 text-slate-900 dark:text-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeKey}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col h-full justify-center max-w-3xl"
          >
            {/* Title & Description */}
            <HeroContent activeShow={activeShow} />
            
            {/* Tags / Badges */}
            <HeroTags activeShow={activeShow} />
            
            {/* Lineup / Cast / Matchup */}
            <HeroLineup show={activeShow} />

            {/* Bottom Actions & Links */}
            <HeroActions activeShow={activeShow} />

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function HeroPoster({ activeShow, activeKey, onNext, onPrev, showsCount, currentIndex, onDotClick }: any) {
  return (
    <div className="w-full md:w-[35%] h-[400px] md:h-full relative overflow-hidden shrink-0 z-20 flex items-center justify-center p-6 md:p-8">
      {/* ARROWS */}
      <button 
        onClick={onPrev}
        className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/40 dark:bg-black/40 backdrop-blur-md border border-white/50 dark:border-white/10 flex items-center justify-center text-slate-800 dark:text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-white/70 dark:hover:bg-black/70 z-50 shadow-md"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <button 
        onClick={onNext}
        className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/40 dark:bg-black/40 backdrop-blur-md border border-white/50 dark:border-white/10 flex items-center justify-center text-slate-800 dark:text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-white/70 dark:hover:bg-black/70 z-50 shadow-md"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeKey}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full h-full relative rounded-3xl overflow-hidden shadow-2xl dark:shadow-black/60 border border-black/5 dark:border-white/10"
        >
          <img
            src={activeShow.poster_url || activeShow.thumbnail_url || "/placeholder.jpg"}
            alt={activeShow.title}
            className="w-full h-full object-cover"
          />
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
        {Array.from({ length: showsCount }).map((_, i) => (
          <button
            key={i}
            onClick={() => onDotClick(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 shadow-md ${i === currentIndex ? "w-6 bg-blue-500" : "bg-white hover:bg-gray-200"}`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function HeroContent({ activeShow }: { activeShow: Show }) {
  return (
    <div className="mt-2 mb-6 space-y-4">
      <h1 className="text-4xl md:text-5xl lg:text-5xl font-black text-slate-900 leading-[1.1] tracking-tight uppercase">
        {activeShow.title}
      </h1>
    </div>
  );
}

function HeroTags({ activeShow }: { activeShow: Show }) {
  const showType = activeShow.show_type || "Movie";
  
  return (
    <div className="flex flex-wrap items-center gap-3 mb-8">
      {activeShow.next_start_time && (
        <Badge icon={Calendar} text={new Date(activeShow.next_start_time).getFullYear().toString()} />
      )}
      <DotSeparator />
      {activeShow.duration_minutes && (
        <Badge icon={Clock} text={`${activeShow.duration_minutes}m`} />
      )}
      <DotSeparator />
      {showType === "Movie" && <Badge icon={Clapperboard} text="Movie" />}
      {showType === "Concert" && <Badge icon={Music} text="Concert" />}
      {showType === "Event" && <Badge icon={Sparkles} text="Event" />}
      {showType === "GameEvent" && <Badge icon={Trophy} text="Game" />}
      <DotSeparator />
      {activeShow.venue && <Badge icon={MapPin} text={activeShow.venue} />}
    </div>
  );
}

function Badge({ icon: Icon, text }: { icon: any, text: string }) {
  return (
    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-200/80 border border-slate-300 text-xs font-semibold text-slate-700 shadow-sm">
      <Icon className="w-3.5 h-3.5" />
      {text}
    </span>
  );
}

function DotSeparator() {
  return <span className="w-1 h-1 rounded-full bg-slate-400" />;
}

function HeroDescription({ description }: { description?: string }) {
  return (
    <p className="text-slate-700 text-sm md:text-base leading-relaxed line-clamp-3 mb-6 max-w-2xl font-medium">
      {description || 'Experience the best of entertainment. Book your tickets now and enjoy exclusive access to the most anticipated events.'}
    </p>
  );
}

function HeroLineup({ show }: { show: Show }) {
  if (show.show_type === 'Movie' && show.cast && show.cast.length > 0) {
    return (
      <div className="mb-6 border-t border-slate-300 pt-4">
        <h3 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3">Cast</h3>
        <div className="flex items-start gap-6 overflow-x-auto custom-scrollbar pb-2">
          {show.cast.slice(0, 4).map(c => (
            <div key={c.name} className="flex flex-col items-center shrink-0 w-20 text-center">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-200 shadow-md mb-2 border border-slate-300">
                {c.photo_url ? (
                  <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full font-bold text-slate-500 text-lg">
                    {c.name.charAt(0)}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold text-slate-800 leading-tight">{c.name}</span>
              {c.role && <span className="text-[9px] text-blue-600 mt-0.5 line-clamp-1">as {c.role}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if ((show.show_type === 'Concert' || show.show_type === 'Event') && (show.performers || show.host)) {
    const list = [...(show.performers || [])];
    if (show.host) {
      list.unshift({ name: show.host, role: 'Host', photo_url: (show as any).host_photo_url });
    }
    
    if (list.length === 0) return null;

    return (
      <div className="mb-6 border-t border-slate-300 pt-4">
        <h3 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3">Lineup</h3>
        <div className="flex items-start gap-6 overflow-x-auto custom-scrollbar pb-2">
          {list.slice(0, 4).map(p => (
            <div key={p.name} className="flex flex-col items-center shrink-0 w-20 text-center">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-200 shadow-md mb-2 border border-slate-300">
                {p.photo_url ? (
                  <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full font-bold text-slate-500 text-lg">
                    {p.name.charAt(0)}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold text-slate-800 leading-tight">{p.name}</span>
              {p.role && <span className="text-[9px] text-blue-600 mt-0.5 line-clamp-1">{p.role}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (show.show_type === 'GameEvent' && show.team_a && show.team_b) {
    return (
      <div className="mb-6 border-t border-slate-300 pt-4">
        <h3 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-4">MATCHUP</h3>
        <div className="flex items-center gap-8">
          <TeamCard team={show.team_a} />
          <div className="flex flex-col items-center justify-center">
            <span className="text-xs font-bold text-slate-500 italic">VS</span>
          </div>
          <TeamCard team={show.team_b} />
        </div>
      </div>
    );
  }
  return null;
}

function TeamCard({ team }: { team: TeamInfo }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-slate-300 shadow-md">
        {team.logo_url ? (
          <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-slate-200" />
        )}
      </div>
    </div>
  );
}

function HeroActions({ activeShow }: { activeShow: Show }) {
  const activeKey = typeof activeShow.id === "string" ? activeShow.id : (activeShow as any)._id?.$oid || Math.random().toString();
  
  return (
    <div className="mt-auto">
      <div className="mb-6 border-t border-slate-300 pt-4">
        <h3 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3">Links</h3>
        <div className="flex items-center gap-8 text-sm font-semibold">
          <button 
            disabled={!activeShow.trailer_url}
            className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:hover:text-slate-500"
          >
            <PlayCircle className="w-5 h-5" />
            <span className="text-[10px]">Play Trailer</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-blue-600 transition-colors">
            <Monitor className="w-5 h-5" />
            <span className="text-[10px]">Watch Now</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-blue-600 transition-colors">
            <Bookmark className="w-5 h-5" />
            <span className="text-[10px]">Add to Watchlist</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-blue-600 transition-colors">
            <Share2 className="w-5 h-5" />
            <span className="text-[10px]">Share</span>
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <Link href={`/shows/${activeKey}`}>
          <button className="px-6 py-2.5 rounded-full font-bold flex items-center justify-center gap-2 transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Watch Now
          </button>
        </Link>
        
        <Link href={`/shows/${activeKey}`}>
          <button className="px-6 py-2.5 rounded-full font-bold flex items-center justify-center transition-all bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm">
            More Details
          </button>
        </Link>
      </div>
    </div>
  );
}
