"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { UserNav } from "@/components/UserNav";
import { ChevronRight } from "lucide-react";
import type { Show } from "@/types/show";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8082";

export default function PublicShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchCategories() {
      try {
        const catRes = await fetch(`${API_URL}/api/user/categories`);
        if (catRes.ok) {
          setCategories(await catRes.json());
        }
      } catch (err) {
        console.error("Failed to load categories", err);
      }
    }
    fetchCategories();
  }, []);

  const fetchShows = async (pageNum: number, isLoadMore = false) => {
    try {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      const res = await fetch(`${API_URL}/api/user/shows/grid?page=${pageNum}&limit=30`);
      if (!res.ok) throw new Error("Failed to fetch shows");
      
      const data = await res.json();
      if (isLoadMore) {
        setShows(prev => [...prev, ...data.shows]);
      } else {
        setShows(data.shows);
      }
      setHasMore(data.has_more);
      setPage(pageNum);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchShows(1);
  }, []);

  const filteredShows = shows.filter(s => 
    !selectedCategory || s.category_ids?.includes(selectedCategory)
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-sans">
      <nav className="w-full px-4 sm:px-8 py-4 flex items-center justify-between z-50 bg-[var(--nav-bg)] backdrop-blur-xl border-b border-[var(--divider)] shadow-sm">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent)] to-yellow-400 flex items-center justify-center">
            <span className="text-[#12111a] font-bold text-lg leading-none mt-[-2px]">B</span>
          </div>
          <span className="text-xl font-black tracking-tight text-white font-display">BookIt</span>
        </Link>
        <UserNav />
      </nav>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end"
        >
          <div>
            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight mb-4">
              Now <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-yellow-400">Showing</span>
            </h1>
            <p className="text-[var(--text-secondary)] text-lg max-w-2xl">
              Book tickets for the latest movies, premium concerts, and exclusive events. Experience entertainment like never before.
            </p>
          </div>
        </motion.div>

        {/* Categories Filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-10">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                !selectedCategory 
                  ? "bg-[var(--accent)] text-black shadow-lg shadow-[var(--accent)]/20" 
                  : "bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]"
              }`}
            >
              All Shows
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  selectedCategory === c.id 
                    ? "bg-[var(--accent)] text-black shadow-lg shadow-[var(--accent)]/20" 
                    : "bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loading && page === 1 ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="text-red-500 bg-red-500/10 p-4 rounded-xl border border-red-500/20">{error}</div>
        ) : filteredShows.length === 0 ? (
          <div className="text-center py-20 bg-[var(--card-bg)] rounded-2xl border border-[var(--border)]">
            <h2 className="text-2xl font-bold text-[var(--text-secondary)]">No upcoming shows right now.</h2>
          </div>
        ) : (
          <>
            <div 
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-[350px] grid-flow-row-dense"
            >
              {filteredShows.map((show, idx) => {
                // Determine Bento Box Size dynamically
                const isHero = show.weight && show.weight >= 10;
                const isWide = !isHero && (idx % 6 === 0);
                const isTall = !isHero && !isWide && (idx % 5 === 0);

                let spanClass = "col-span-1 row-span-1";
                if (isHero) spanClass = "sm:col-span-2 sm:row-span-2 lg:col-span-2 lg:row-span-2";
                else if (isWide) spanClass = "sm:col-span-2 sm:row-span-1 lg:col-span-2 lg:row-span-1";
                else if (isTall) spanClass = "col-span-1 sm:row-span-2 lg:row-span-2";
                
                // Visual Anchor Classes for category styling
                let cardClass = "";
                let badgeClass = "";
                let typeLabel: string = show.show_type;

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

                return (
                  <motion.div
                    key={show.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (idx % 10) * 0.05 }}
                    className={`card--${show.show_type.toLowerCase()} group relative bg-[var(--card-bg)] rounded-3xl overflow-hidden border transition-all flex flex-col h-full ${cardClass} ${spanClass}`}
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

                        {/* Button reveals/expands slightly on hover for larger tiles, always present */}
                        <div className="mt-2">
                          <Link href={`/shows/${show.id}`} className="w-full block">
                            <button 
                              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-white/10 hover:bg-white/20 text-white border border-white/10 hover:border-white/30 backdrop-blur-md group-hover:bg-[var(--accent)] group-hover:text-black group-hover:border-[var(--accent)]`}
                            >
                              {show.show_type === "Movie" ? "View Details & Book" : "Book Tickets"}
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

            {hasMore && (
              <div className="mt-12 flex justify-center">
                <button
                  onClick={() => fetchShows(page + 1, true)}
                  disabled={loadingMore}
                  className="px-8 py-3 rounded-full font-bold bg-[var(--card-bg)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--accent)] transition-all flex items-center gap-2"
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load More Shows"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
