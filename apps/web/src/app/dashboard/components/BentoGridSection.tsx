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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
        {shows.map((show, idx) => {
          const key = typeof show.id === "string" ? show.id : show._id?.$oid || Math.random().toString();
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (idx % 10) * 0.05 }}
              className="group relative flex flex-col"
            >
              <Link href={`/shows/${key}`} className="flex flex-col h-full">
                {/* Image Container */}
                <div className="relative aspect-square overflow-hidden bg-[var(--bg-subtle)] rounded-2xl mb-5">
                  {/* Rating Badge */}
                  {show.score ? (
                    <div className="absolute top-4 left-4 z-10">
                      <span className="bg-[#facc15] text-[#1a1a1a] text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide shadow-sm">
                        Rating {(show.score).toFixed(1)}/10
                      </span>
                    </div>
                  ) : (
                    <div className="absolute top-4 left-4 z-10">
                      <span className="bg-[#facc15] text-[#1a1a1a] text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide shadow-sm">
                        {show.show_type || "Event"}
                      </span>
                    </div>
                  )}
                  
                  <img
                    src={show.poster_url || show.backdrop_url || '/placeholder.jpg'}
                    alt={show.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                
                {/* Text Content */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] font-display leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                    {show.title}
                  </h3>
                  <p className="text-[var(--text-secondary)] text-sm md:text-base leading-relaxed line-clamp-2">
                    {show.description || `Experience this incredible ${(show.show_type || "event").toLowerCase()}.`}
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
