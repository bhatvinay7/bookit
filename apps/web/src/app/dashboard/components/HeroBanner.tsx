import React, { useState, useEffect } from "react";
import type { Show } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface HeroBannerProps {
  shows: Show[];
  onSelect: (show: Show) => void;
}

export function HeroBanner({ shows, onSelect }: HeroBannerProps) {
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
    <div className="w-full relative overflow-hidden rounded-3xl shadow-2xl flex flex-col md:flex-row h-auto md:h-[500px] group">
      
      {/* ════ BLURRED BACKDROP BACKGROUND ════ */}
      <AnimatePresence mode="wait">
        <motion.img
          key={`bg-${activeKey}`}
          src={activeShow.backdrop_url || activeShow.poster_url || activeShow.thumbnail_url || "/placeholder.jpg"}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-40 dark:opacity-30"
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent dark:from-black/90 dark:via-black/70 pointer-events-none" />

      {/* ════ CAROUSEL ARROWS ════ */}
      <button 
        onClick={handlePrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-white/20 z-50 shadow-lg"
      >
        <ChevronLeft className="w-8 h-8" />
      </button>

      <button 
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-white/20 z-50 shadow-lg"
      >
        <ChevronRight className="w-8 h-8" />
      </button>

      {/* ════ LEFT SIDE: POSTER (40%) ════ */}
      <div className="w-full md:w-[40%] h-[300px] md:h-full relative overflow-hidden shrink-0 z-10 p-6 md:p-8 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeKey}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full h-full relative rounded-2xl overflow-hidden shadow-2xl border border-white/10"
          >
            <img
              src={activeShow.poster_url || activeShow.thumbnail_url || "/placeholder.jpg"}
              alt={activeShow.title}
              className="w-full h-full object-cover"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ════ RIGHT SIDE: INFO (60%) ════ */}
      <div className="w-full md:w-[60%] p-6 md:p-12 flex flex-col justify-center relative z-10 text-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeKey}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col h-full justify-center max-w-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 rounded-md text-[11px] font-black tracking-widest uppercase bg-[var(--accent)] text-[#12111a] shadow-sm">
                {activeShow.status === 'nowShowing' ? 'Now Showing' : 'Upcoming'}
              </span>
              <span className="text-white/80 text-sm font-bold flex items-center gap-2">
                {activeShow.score && `⭐ ${activeShow.score}`}
                {activeShow.duration_minutes && ` • ${activeShow.duration_minutes}m`}
                <span className="text-[var(--accent)] border-l border-white/20 pl-2 ml-1">
                  {activeShow.show_type}
                </span>
              </span>
            </div>
            
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black font-display leading-[1.1] mb-4 drop-shadow-lg line-clamp-2">
              {activeShow.title}
            </h1>
            
            <p className="text-white/70 text-base md:text-lg leading-relaxed line-clamp-3 mb-6 font-medium max-w-xl shrink-0">
              {activeShow.description || 'Experience the best of entertainment. Book your tickets now and enjoy exclusive VIP access to the most anticipated events.'}
            </p>

            <div className="flex items-center gap-4 mt-2">
              <Link href={`/shows/${activeKey}`}>
                <button className="px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-[var(--accent)] text-[#12111a] shadow-[0_4px_20px_rgba(224,150,0,0.3)] hover:shadow-[0_8px_30px_rgba(224,150,0,0.5)] hover:-translate-y-1">
                  Book tickets
                </button>
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Carousel Dots */}
        <div className="absolute bottom-6 left-12 flex items-center gap-2">
          {shows.map((show, idx) => (
            <button
              key={typeof show.id === "string" ? show.id : (show as any)._id?.$oid || idx}
              onClick={() => setCurrentIndex(idx)}
              className={`transition-all rounded-full ${
                idx === currentIndex 
                  ? "w-8 h-1.5 bg-[var(--accent)] shadow-[0_0_10px_rgba(224,150,0,0.5)]" 
                  : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
