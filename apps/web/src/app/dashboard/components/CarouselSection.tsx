import React, { useRef } from "react";
import type { Show } from "@/types";
import ShowCard from "@/components/shows/ShowCard";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CarouselSectionProps {
  title: string;
  shows: Show[];
  onSelectShow: (show: Show) => void;
  css: (v: string) => string;
}

export function CarouselSection({ title, shows, onSelectShow, css }: CarouselSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  if (shows.length === 0) return null;

  return (
    <div style={{ marginBottom: "40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ fontFamily: css('font-display'), fontSize: "24px", fontWeight: 800, color: css('text-primary') }}>
          {title}
        </h2>
        
        {shows.length > 3 && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => scroll('left')}
              style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "rgba(255,255,255,0.05)", border: `1px solid ${css('divider')}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: css('text-secondary'), cursor: "pointer", transition: "all 0.2s"
              }}
              className="hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => scroll('right')}
              style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "rgba(255,255,255,0.05)", border: `1px solid ${css('divider')}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: css('text-secondary'), cursor: "pointer", transition: "all 0.2s"
              }}
              className="hover:bg-white/10 hover:text-white"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: "24px",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: "16px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        className="hide-scrollbar"
      >
        {shows.map((show, idx) => {
          const key = typeof show.id === "string" ? show.id : (show as any)._id?.$oid || Math.random().toString();
          return (
            <div
              key={key}
              style={{
                minWidth: "164px",
                maxWidth: "164px",
                flexShrink: 0,
                scrollSnapAlign: "start",
              }}
            >
              <ShowCard
                show={show}
                index={idx}
                onSelect={onSelectShow}
              />
            </div>
          );
        })}
      </div>
      
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
