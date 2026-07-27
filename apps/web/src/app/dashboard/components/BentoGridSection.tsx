import React from "react";
import { motion } from "framer-motion";
import type { Show } from "@/types";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface BentoGridSectionProps {
  title: string;
  shows: Show[];
  onSelectShow: (show: Show) => void;
  css: (v: string) => string;
}

export function BentoGridSection({ title, shows, onSelectShow, css }: BentoGridSectionProps) {
  if (shows.length === 0) return null;

  return (
    <div style={{ marginBottom: "40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ fontFamily: css('font-display'), fontSize: "24px", fontWeight: 800, color: css('text-primary') }}>
          {title}
        </h2>
      </div>

      <div 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-[280px] grid-flow-row-dense"
      >
        {shows.map((show, idx) => {
          // Determine Bento Box Size dynamically (no tall vertical row-span-2 components)
          const isHero = show.weight && show.weight >= 10;
          const isWide = !isHero && (idx % 4 === 0);

          let spanClass = "col-span-1 row-span-1";
          if (isHero) spanClass = "sm:col-span-2 row-span-1 lg:col-span-2 row-span-1";
          else if (isWide) spanClass = "sm:col-span-2 row-span-1 lg:col-span-2 row-span-1";
          
          // Visual Anchor Classes for category styling
          let cardClass = "";
          let badgeClass = "";
          let typeLabel: string = show.show_type || "Event";

          switch (show.show_type) {
            case "Movie":
              cardClass = "border-blue-500/20 hover:border-blue-500/50 shadow-[0_4px_30px_rgba(59,130,246,0.1)]";
              badgeClass = "bg-blue-500/20 text-blue-400 border-blue-500/30";
              typeLabel = "🎬 Movie";
              break;
            case "Concert":
              cardClass = "border-purple-500/20 hover:border-purple-500/50 shadow-[0_4px_30px_rgba(168,85,247,0.1)]";
              badgeClass = "bg-purple-500/20 text-purple-400 border-purple-500/30";
              typeLabel = "🎵 Concert";
              break;
            case "GameEvent":
              cardClass = "border-emerald-500/20 hover:border-emerald-500/50 shadow-[0_4px_30px_rgba(16,185,129,0.1)]";
              badgeClass = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
              typeLabel = "🏟️ Game";
              break;
            case "Event":
              cardClass = "border-orange-500/20 hover:border-orange-500/50 shadow-[0_4px_30px_rgba(249,115,22,0.1)]";
              badgeClass = "bg-orange-500/20 text-orange-400 border-orange-500/30";
              typeLabel = "🎪 Event";
              break;
          }

          const key = typeof show.id === "string" ? show.id : (show as any)._id?.$oid || Math.random().toString();

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (idx % 10) * 0.05 }}
              className={`group relative bg-[var(--card-bg)] rounded-3xl overflow-hidden border transition-all flex flex-col h-full ${cardClass} ${spanClass} cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.15)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.3)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] dark:hover:shadow-[0_15px_40px_rgba(0,0,0,0.8)]`}
              onClick={() => onSelectShow(show)}
            >
              <div className="relative flex-1 overflow-hidden bg-[var(--bg-subtle)] w-full h-full">
                {show.backdrop_url || show.poster_url ? (
                  <img
                    src={isHero || isWide ? (show.backdrop_url || show.poster_url) : (show.poster_url || show.backdrop_url)}
                    alt={show.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                    No Image
                  </div>
                )}
                
                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0c18] via-[#0d0c18]/50 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100" />
                
                <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border tracking-wider backdrop-blur-md ${badgeClass}`}>
                    {typeLabel}
                  </span>
                </div>
                
                {/* Content anchored to bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 z-10 flex flex-col gap-3">
                  <div>
                    <h3 className={`${isHero ? "text-3xl md:text-5xl mb-3" : "text-xl md:text-2xl mb-2"} font-black text-white font-display leading-tight line-clamp-2`}>
                      {show.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/80">
                      {show.language && (
                        <span className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2 py-1 rounded-md border border-white/10">
                          {show.language}
                        </span>
                      )}
                      {show.venue && (
                        <span className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2 py-1 rounded-md border border-white/10">
                          📍 {show.venue}
                        </span>
                      )}
                      {show.next_start_time && (
                        <span className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2 py-1 rounded-md border border-white/10">
                          🕒 {new Date(show.next_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/shows/${key}`} className="block">
                      <button 
                        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-[var(--accent)] to-yellow-500 hover:to-yellow-400 text-[#12111a] shadow-[0_4px_14px_rgba(224,150,0,0.39)] hover:shadow-[0_6px_20px_rgba(224,150,0,0.6)] hover:-translate-y-0.5 border border-transparent`}
                      >
                        Book
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
