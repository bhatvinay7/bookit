"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { UserNav } from "@/components/UserNav";
import { ChevronRight } from "lucide-react";
import type { Show } from "@/types/show";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : String(err)));
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

      <main className="w-full lg:w-[90%] max-w-none mx-auto px-6 md:px-12 py-12">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
              {filteredShows.map((show, idx) => {
                return (
                  <motion.div
                    key={show.id || (typeof show._id === 'object' && show._id !== null ? show._id.$oid : show._id) || idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (idx % 10) * 0.05 }}
                    className="group relative flex flex-col"
                  >
                    <Link href={`/shows/${show.id}`} className="flex flex-col h-full">
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
                              {show.show_type}
                            </span>
                          </div>
                        )}
                        
                        {show.backdrop_url || show.poster_url ? (
                          <img
                            src={show.poster_url || show.backdrop_url}
                            alt={show.title}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                            No Image
                          </div>
                        )}
                      </div>
                      
                      {/* Text Content */}
                      <div className="flex flex-col gap-2">
                        <h3 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] font-display leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                          {show.title}
                        </h3>
                        <p className="text-[var(--text-secondary)] text-sm md:text-base leading-relaxed line-clamp-2">
                          {show.description || `Experience this incredible ${show.show_type.toLowerCase()} event.`}
                        </p>
                      </div>
                    </Link>
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
