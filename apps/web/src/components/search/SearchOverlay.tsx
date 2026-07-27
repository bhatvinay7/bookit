import React, { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Show } from "@/types";
import { useSearchShows } from "@/hooks/useApi";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  shows: Show[]; // Now only used as fallback if we want, but we won't need it.
  onSelectShow: (show: Show) => void;
}

export function SearchOverlay({ isOpen, onClose, shows, onSelectShow }: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setDebouncedQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: searchResults, isLoading } = useSearchShows(debouncedQuery);
  const filtered = searchResults || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(24px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          className="fixed inset-0 z-[100] flex flex-col p-6 sm:p-12 bg-[#020617]/80"
        >
          {/* Close button */}
          <button 
            onClick={onClose} 
            className="absolute top-8 right-8 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={24} />
          </button>

          {/* Search Input Container */}
          <div className="w-full max-w-4xl mx-auto mt-8 sm:mt-16">
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="relative"
            >
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--accent)] w-6 h-6 sm:w-7 sm:h-7" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search films, concerts, events..."
                className="w-full py-4 sm:py-5 pl-16 pr-6 text-xl sm:text-2xl bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/20 transition-all font-display"
              />
            </motion.div>

            {/* Results */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-12 overflow-y-auto max-h-[60vh] custom-scrollbar pb-12"
            >
              {query.length > 1 && (
                <div className="mb-6 flex justify-between items-center text-white/50 text-sm tracking-wider font-bold uppercase">
                  <span className="flex items-center gap-2">
                    Results for "{query}"
                    {isLoading && <span className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin inline-block" />}
                  </span>
                  <span>{filtered.length} matches</span>
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {query.length > 1 && filtered.map((show, idx) => (
                  <motion.div
                    key={typeof show.id === "string" ? show.id : (show as any)._id?.$oid}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * idx }}
                    onClick={() => {
                      onSelectShow(show);
                      onClose();
                    }}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[var(--accent)]/50 cursor-pointer transition-all group"
                  >
                    <img 
                      src={show.thumbnail_url || show.poster_url || '/placeholder.jpg'} 
                      alt={show.title} 
                      className="w-16 h-20 rounded-xl object-cover shadow-lg group-hover:scale-105 transition-transform"
                    />
                    <div className="flex flex-col">
                      <span className="text-white font-bold text-lg leading-tight line-clamp-2">{show.title}</span>
                      <span className="text-[var(--accent)] text-sm font-semibold mt-1">{show.show_type}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              {query.length > 1 && filtered.length === 0 && !isLoading && (
                <div className="text-center text-white/40 mt-20 text-lg font-medium">
                  No matches found. Try another keyword.
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
