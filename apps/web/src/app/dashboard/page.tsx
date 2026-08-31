"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { useMovies, useTokenValidator } from "@/hooks/useApi";
import type { Show } from "@/types";
import { EmptyState } from "./components/EmptyState";
import { SidebarStrip } from "./components/SidebarStrip";
import { HeroBanner } from "./components/HeroBanner";
import { BentoGridSection } from "./components/BentoGridSection";
import { UserNav } from "@/components/UserNav";
import { CitySelector } from "@/components/CitySelector";
import { SearchOverlay } from "@/components/search/SearchOverlay";
import { ShowDetailModal } from "@/components/shows/ShowDetailModal";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get("category") || "All";

  useTokenValidator();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const handleSelectCategory = (cat: string) => {
    router.push(`/dashboard?category=${cat}`);
  };

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [detailModalShow, setDetailModalShow] = useState<Show | null>(null);

  const [selectedCity, setSelectedCity] = useState("All");

  useEffect(() => {
    const savedCity = sessionStorage.getItem("bookit_city");
    if (savedCity) {
      const updateCity = window.setTimeout(() => setSelectedCity(savedCity), 0);
      return () => window.clearTimeout(updateCity);
    }
  }, []);

  // ⌘K / Ctrl+K → open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    sessionStorage.setItem("bookit_city", city);
  };

  const { data: movies, isLoading, isError } = useMovies(selectedCategory, selectedCity);

  const safeMovies = Array.isArray(movies) ? movies : [];
  
  // Filter shows based on Sidebar category
  const filteredShows = safeMovies.filter(m => {
    if (selectedCategory === "All") return true;
    if (selectedCategory === "Movie" && m.show_type === "Movie") return true;
    if (selectedCategory === "Concert" && m.show_type === "Concert") return true;
    if (selectedCategory === "Event" && m.show_type === "Event") return true;
    if (selectedCategory === "GameEvent" && m.show_type === "GameEvent") return true;
    return false;
  });

  const nowShowing = filteredShows.filter(m => m.status === 'nowShowing');
  const comingSoon = filteredShows.filter(m => m.status === 'comingSoon');

  const css = (v: string) => `var(--${v})`;

  if (!mounted) return null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: css('bg'),
        color: css('text-primary'),
        fontFamily: css('font-sans'),
        transition: 'background 0.3s, color 0.3s',
        display: 'flex',
      }}
      className="relative overflow-hidden"
    >
      {/* ════ PREMIUM LIGHT GRADIENTS (Background) ════ */}
      {dark && (
        <div 
          className="fixed inset-0 pointer-events-none z-0" 
          style={{
            background: 'radial-gradient(circle at 20% 0%, rgba(16, 185, 129, 0.08) 0%, transparent 40%), radial-gradient(circle at 80% 40%, rgba(99, 102, 241, 0.05) 0%, transparent 40%)',
            mixBlendMode: 'screen'
          }}
        />
      )}
      {dark && <div className="fixed inset-0 z-0 pointer-events-none bg-grid-pattern mask-radial-faded opacity-[0.05]" />}

      {/* ════ MAIN CONTENT ════ */}
      <div 
        style={{ flex: 1, position: "relative", zIndex: 10, display: "flex", flexDirection: "column" }}
        className="h-screen overflow-y-auto"
      >
        {/* ════ FULL WIDTH HEADER AREA (ALWAYS VISIBLE) ════ */}
        <div className="w-full z-50 bg-[var(--card-bg)]/80 backdrop-blur-xl border-b border-[var(--border)] sticky top-0 shrink-0">
          {/* TOP HEADER */}
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex w-full items-center justify-between gap-2 py-3 sm:gap-5 sm:py-4">
              <div className="flex shrink-0 items-center gap-3">
                <h1 className="text-2xl font-black tracking-tighter sm:text-3xl" style={{ fontFamily: css('font-display') }}>
                  Book<span className="text-[var(--accent)]">It</span>
                </h1>
              </div>
              
              {/* SEARCH BAR TRIGGER IN HEADER */}
              <div 
                onClick={() => setIsSearchOpen(true)}
                className="hidden min-h-11 max-w-xl flex-1 cursor-pointer items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-4 transition-all hover:border-[var(--accent)]/60 hover:bg-[var(--card-bg)] md:flex"
              >
                <svg className="w-5 h-5 text-[var(--text-muted)] mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-[var(--text-muted)] text-sm whitespace-nowrap overflow-hidden text-ellipsis">Search for movies, concerts, games...</span>
                <div className="ml-auto flex gap-1 shrink-0">
                  <span className="px-1.5 py-0.5 bg-[var(--card-bg)] border border-[var(--border)] rounded text-[10px] font-bold text-[var(--text-muted)]">⌘</span>
                  <span className="px-1.5 py-0.5 bg-[var(--card-bg)] border border-[var(--border)] rounded text-[10px] font-bold text-[var(--text-muted)]">K</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                <div className="hidden border-r border-[var(--border)] pr-3 sm:block">
                  <CitySelector selectedCity={selectedCity} onSelect={handleCitySelect} />
                </div>
                <div className="max-w-[136px] sm:hidden">
                  <CitySelector selectedCity={selectedCity} onSelect={handleCitySelect} />
                </div>
                <UserNav />
              </div>
            </div>
          </div>

          {/* CATEGORY NAV (formerly SidebarStrip) */}
          <div className="bg-[var(--bg-subtle)]/50 border-t border-[var(--border)]">
            <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
              <SidebarStrip 
                selectedCategory={selectedCategory} 
                onSelectCategory={handleSelectCategory}
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="w-12 h-12 mx-auto mb-5 border-4 border-white/10 border-t-[var(--accent)] rounded-full animate-spin" />
              <h2 style={{ fontFamily: css('font-display'), fontSize: '24px', fontWeight: 600, color: css('text-primary') }}>Loading...</h2>
            </div>
          </main>
        ) : (isError || safeMovies.length === 0) ? (
          <div className="flex-1 flex flex-col relative w-full items-center justify-center">
            <EmptyState css={css} isError={isError} />
          </div>
        ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-6 lg:px-8"
            >

            {/* MOBILE SEARCH BAR TRIGGER */}
            <div 
              onClick={() => setIsSearchOpen(true)}
              className="group relative mb-4 w-full cursor-pointer md:hidden"
            >
              <div className="relative flex min-h-12 items-center rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-4 shadow-sm transition-colors hover:border-[var(--accent)]/50">
                <svg className="w-5 h-5 text-[var(--accent)] mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-sm text-[var(--text-muted)]">Search movies, sports and events</span>
              </div>
            </div>

            {/* HERO BANNER */}
            <div className="relative left-1/2 mb-8 w-screen -translate-x-1/2 sm:mb-10">
               <HeroBanner
                 shows={filteredShows.slice(0, 5)}
                 onSelect={(s) => setDetailModalShow(s)}
               />
            </div>

            {/* BENTO GRID SECTIONS */}
            <div className="flex w-full flex-col gap-2">
               <BentoGridSection 
                 title="Current Events" 
                 shows={nowShowing} 
               />

               <BentoGridSection 
                 title="Upcoming Events" 
                 shows={comingSoon} 
               />
            </div>
          </motion.div>
        )}
      </div>

      {/* Overlays */}
      <SearchOverlay 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        shows={safeMovies} 
        onSelectShow={(show) => setDetailModalShow(show)} 
      />
      
      {detailModalShow && (
        <ShowDetailModal 
          show={detailModalShow} 
          city={selectedCity}
          onClose={() => setDetailModalShow(null)} 
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-[#020617]" />}>
      <DashboardContent />
    </Suspense>
  );
}
