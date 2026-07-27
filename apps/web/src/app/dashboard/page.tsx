"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { useMovies, useTokenValidator } from "@/hooks/useApi";
import type { Movie, Show } from "@/types";
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const handleSelectCategory = (cat: string) => {
    router.push(`/dashboard?category=${cat}`);
  };

  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [detailModalShow, setDetailModalShow] = useState<Show | null>(null);

  const [selectedCity, setSelectedCity] = useState("All");

  useEffect(() => {
    const savedCity = sessionStorage.getItem("bookit_city");
    if (savedCity) {
      setSelectedCity(savedCity);
    }
  }, []);

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    sessionStorage.setItem("bookit_city", city);
  };

  const { data: movies, isLoading, isError } = useMovies(selectedCategory, selectedCity);

  const safeMovies = Array.isArray(movies) ? movies : [];
  
  // Update selected show if movies are loaded and nothing is selected
  useEffect(() => {
    if (safeMovies.length > 0 && !selectedShow) {
      setSelectedShow(safeMovies[0]);
    }
  }, [safeMovies, selectedShow]);

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
        background: dark ? '#020617' : 'linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)',
        color: css('text-primary'),
        fontFamily: css('font-sans'),
        transition: 'background 0.3s, color 0.3s',
        display: 'flex',
      }}
      className="relative overflow-hidden"
    >
      {/* ════ PREMIUM LIGHT GRADIENTS (Background) ════ */}
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
          <div className="max-w-[1400px] mx-auto px-6 md:px-12">
            <div className="flex items-center justify-between w-full py-4 gap-8">
              <div className="flex items-center gap-4 shrink-0">
                <h1 className="text-3xl font-black tracking-tighter" style={{ fontFamily: css('font-display') }}>
                  Book<span className="text-[var(--accent)]">It</span>
                </h1>
              </div>
              
              {/* SEARCH BAR TRIGGER IN HEADER */}
              <div 
                onClick={() => setIsSearchOpen(true)}
                className="flex-1 max-w-xl hidden md:flex items-center bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-4 py-2 hover:border-[var(--accent)]/50 transition-colors cursor-pointer"
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

              <div className="flex items-center gap-4 shrink-0">
                <div className="hidden sm:block border-r border-[var(--border)] pr-4">
                  <CitySelector selectedCity={selectedCity} onSelect={handleCitySelect} />
                </div>
                <div className="sm:hidden">
                  <CitySelector selectedCity={selectedCity} onSelect={handleCitySelect} />
                </div>
                <UserNav />
              </div>
            </div>
          </div>

          {/* CATEGORY NAV (formerly SidebarStrip) */}
          <div className="bg-[var(--bg-subtle)]/50 border-t border-[var(--border)]">
            <div className="max-w-[1400px] mx-auto px-6 md:px-12">
              <SidebarStrip 
                selectedCategory={selectedCategory} 
                onSelectCategory={handleSelectCategory}
                onOpenSearch={() => setIsSearchOpen(true)}
                dark={dark} 
                css={css} 
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="w-12 h-12 mx-auto mb-5 border-4 border-white/10 border-t-[var(--accent)] rounded-full animate-spin" />
              <h2 style={{ fontFamily: css('font-display'), fontSize: '24px', fontWeight: 600, color: css('text-primary') }}>Loading CineBook...</h2>
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
              className="flex-1 flex flex-col pb-20 pt-8 px-6 md:px-12 max-w-[1400px] mx-auto w-full"
            >

            {/* MOBILE SEARCH BAR TRIGGER */}
            <div 
              onClick={() => setIsSearchOpen(true)}
              className="md:hidden w-full mb-6 relative group cursor-pointer"
            >
              <div className="relative flex items-center bg-[var(--card-bg)] border border-[var(--border)] rounded-xl px-4 py-3 hover:border-[var(--accent)]/50 transition-colors shadow-sm">
                <svg className="w-5 h-5 text-[var(--accent)] mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-[var(--text-muted)] text-sm">Search movies...</span>
              </div>
            </div>

            {/* HERO BANNER */}
            <div className="w-full mb-8">
               <HeroBanner
                 shows={filteredShows.slice(0, 5)}
                 onSelect={(s) => setDetailModalShow(s)}
               />
            </div>

            {/* BENTO GRID SECTIONS */}
            <div className="w-full mt-4 flex flex-col gap-8">
               <BentoGridSection 
                 title="Current Events" 
                 shows={nowShowing} 
                 onSelectShow={setSelectedShow} 
                 css={css}
               />

               <BentoGridSection 
                 title="Upcoming Events" 
                 shows={comingSoon} 
                 onSelectShow={setSelectedShow} 
                 css={css}
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
          onClose={() => setDetailModalShow(null)} 
          css={css} 
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