"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { UserNav } from "@/components/UserNav";
import { ArrowLeft, CalendarDays, Sparkles } from "lucide-react";
import ShowCard from "@/components/shows/ShowCard";
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
    let cancelled = false;

    fetch(`${API_URL}/api/user/shows/grid?page=1&limit=30`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch shows");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setShows(data.shows);
        setHasMore(data.has_more);
        setPage(1);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : String(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredShows = shows.filter(s => 
    !selectedCategory || s.category_ids?.includes(selectedCategory)
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg)] font-sans text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(224,150,0,0.09),transparent_32%),radial-gradient(circle_at_90%_18%,rgba(59,130,246,0.08),transparent_30%)]" />

      <nav className="sticky top-0 z-50 border-b border-[var(--divider)] bg-[var(--nav-bg)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/dashboard" className="font-display text-2xl font-black tracking-tighter">
              Book<span className="text-[var(--accent)]">It</span>
            </Link>
            <Link
              href="/dashboard"
              className="hidden items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)] sm:flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Discover
            </Link>
          </div>
          <UserNav />
        </div>
      </nav>

      <main className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mb-8 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card-bg)] px-5 py-7 shadow-[var(--card-shadow)] sm:mb-10 sm:px-8 sm:py-10 lg:px-12"
        >
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-[var(--accent)]/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--accent-bg)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent-text)] sm:text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Explore what&apos;s on
            </div>
            <h1 className="mb-3 font-display text-3xl font-black tracking-[-0.035em] sm:text-5xl lg:text-6xl">
              Find your next <span className="text-[var(--accent)]">great experience.</span>
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-lg">
              Browse movies, concerts, sports and live events, then choose a date and reserve your seats in a few taps.
            </p>
            {!loading && !error && (
              <div className="mt-5 flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] sm:text-sm">
                <CalendarDays className="h-4 w-4 text-[var(--accent)]" />
                {filteredShows.length} {filteredShows.length === 1 ? "show" : "shows"} available
              </div>
            )}
          </div>
        </motion.div>

        {/* Categories Filter */}
        {categories.length > 0 && (
          <div className="no-scroll-bar -mx-4 mb-7 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mb-10 sm:px-0">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`min-h-10 shrink-0 snap-start rounded-full border px-4 py-2 text-xs font-bold transition-all sm:px-5 sm:text-sm ${
                !selectedCategory 
                  ? "border-[var(--accent)] bg-[var(--accent)] text-slate-950 shadow-lg shadow-[var(--accent)]/15"
                  : "border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]"
              }`}
            >
              All Shows
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`min-h-10 shrink-0 snap-start rounded-full border px-4 py-2 text-xs font-bold transition-all sm:px-5 sm:text-sm ${
                  selectedCategory === c.id 
                    ? "border-[var(--accent)] bg-[var(--accent)] text-slate-950 shadow-lg shadow-[var(--accent)]/15"
                    : "border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loading && page === 1 ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 md:grid-cols-3 lg:grid-cols-4 xl:gap-x-6" aria-label="Loading shows">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="aspect-[2/3] rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)]" />
                <div className="mt-3 h-3 w-2/3 rounded bg-[var(--bg-subtle)]" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm font-semibold text-red-500">{error}</div>
        ) : filteredShows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card-bg)] px-5 py-16 text-center sm:py-20">
            <h2 className="font-display text-xl font-bold text-[var(--text-primary)] sm:text-2xl">No shows in this category</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Try another category to see what&apos;s available.</p>
            <button onClick={() => setSelectedCategory(null)} className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-slate-950">
              Browse all shows
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 md:grid-cols-3 lg:grid-cols-4 xl:gap-x-6">
              {filteredShows.map((show, index) => (
                <ShowCard
                  key={show.id || show._id?.$oid || index}
                  show={show}
                  index={index}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-10 flex justify-center sm:mt-14">
                <button
                  onClick={() => fetchShows(page + 1, true)}
                  disabled={loadingMore}
                  className="flex min-h-12 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-7 py-3 text-sm font-bold text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] disabled:cursor-wait disabled:opacity-70"
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
