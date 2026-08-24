"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Loader2, ArrowRight, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSearchShows } from "@/hooks/useApi";
import { CitySelector } from "@/components/CitySelector";
import type { Show } from "@/types";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional fallback data retained for backwards compatibility. */
  shows?: Show[];
  /** Opens the dashboard's schedule picker for the selected show. */
  onSelectShow?: (show: Show) => void;
}

const TYPE_COLORS: Record<string, string> = {
  Movie: "rgba(99,102,241,0.15)",
  Concert: "rgba(236,72,153,0.15)",
  Event: "rgba(234,179,8,0.15)",
  GameEvent: "rgba(16,185,129,0.15)",
};
const TYPE_TEXT: Record<string, string> = {
  Movie: "#818cf8",
  Concert: "#f472b6",
  Event: "#facc15",
  GameEvent: "#34d399",
};
const TYPE_EMOJI: Record<string, string> = {
  Movie: "🎬",
  Concert: "🎵",
  Event: "🎪",
  GameEvent: "🏟️",
};
const EMPTY_RESULTS: Show[] = [];

export function SearchOverlay({ isOpen, onClose, onSelectShow }: SearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const [city, setCity] = useState("All");

  // Debounce
  useEffect(() => {
    const normalizedQuery = query.trim();
    const delay = normalizedQuery.length < 2 ? 0 : 300;
    const t = setTimeout(
      () => setDebouncedQuery(normalizedQuery.length < 2 ? "" : normalizedQuery),
      delay,
    );
    return () => clearTimeout(t);
  }, [query]);

  // Reset when opened
  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(() => {
      setQuery("");
      setDebouncedQuery("");
      setActiveIdx(-1);
      inputRef.current?.focus();
    }, 80);
    return () => clearTimeout(id);
  }, [isOpen]);

  // Keyboard: Escape closes, arrows navigate
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { setActiveIdx(i => i + 1); e.preventDefault(); }
      if (e.key === "ArrowUp")  { setActiveIdx(i => Math.max(-1, i - 1)); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Click outside closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // slight delay so the trigger button click doesn't immediately re-close
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [isOpen, onClose]);

  const { data: searchResults, isFetching } = useSearchShows(debouncedQuery, city);
  const results = searchResults ?? EMPTY_RESULTS;
  const safeActiveIdx = Math.min(activeIdx, results.length - 1);

  const navigate = useCallback((show: Show) => {
    if (onSelectShow) {
      onClose();
      onSelectShow(show);
      return;
    }

    const id = show.id || show._id?.$oid;
    if (!id) return;
    onClose();
    router.push(`/shows/${id}`);
  }, [router, onClose, onSelectShow]);

  // Keyboard Enter on highlighted item
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && safeActiveIdx >= 0 && results[safeActiveIdx]) {
        navigate(results[safeActiveIdx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, safeActiveIdx, results, navigate]);

  const showDropdown = isOpen && query.trim().length > 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — subtle, not full-screen cover */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[98]"
            style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(2px)" }}
          />

          {/* Search box — centred, max-w like Google */}
          <div
            className="fixed inset-x-0 top-0 z-[99] flex justify-center px-2 pt-[max(8px,env(safe-area-inset-top))] sm:px-4 sm:pt-3"
          >
            <motion.div
              ref={containerRef}
              key="searchbox"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{ width: "100%", maxWidth: "640px" }}
            >
              {/* Input row */}
              <div
                className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap sm:gap-2.5 sm:px-4"
                style={{
                  background: "var(--card-bg, #1e293b)",
                  border: "1.5px solid var(--accent, #6366f1)",
                  borderRadius: showDropdown ? "16px 16px 0 0" : "16px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 4px rgba(99,102,241,0.12)",
                  transition: "border-radius 0.15s",
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {isFetching && debouncedQuery.length > 1 ? (
                    <Loader2 size={20} className="text-[var(--accent)] animate-spin shrink-0" />
                  ) : (
                    <Search size={20} className="text-[var(--accent)] shrink-0" />
                  )}

                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
                    placeholder="Search movies, concerts, events…"
                    className="min-w-0 flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Search shows"
                  />

                  {query && (
                    <button
                      onClick={() => { setQuery(""); setDebouncedQuery(""); inputRef.current?.focus(); }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div className="order-3 flex w-full items-center justify-between border-t border-[var(--border)] pt-2 sm:order-none sm:w-auto sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
                  <CitySelector selectedCity={city} onSelect={setCity} />
                  <button
                    onClick={onClose}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-muted)] sm:hidden"
                    aria-label="Close search"
                  >
                    Close
                  </button>
                </div>

                <button
                  onClick={onClose}
                  className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-xs text-[var(--text-muted)] sm:block"
                >
                  Esc
                </button>
              </div>

              {/* Dropdown results */}
              <AnimatePresence>
                {showDropdown && (
                  <motion.div
                    key="dropdown"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      background: "var(--card-bg, #1e293b)",
                      border: "1.5px solid var(--accent, #6366f1)",
                      borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
                      borderRadius: "0 0 16px 16px",
                      overflow: "hidden",
                      boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
                      maxHeight: "min(70vh, 560px)",
                      overflowY: "auto",
                    }}
                  >
                    {/* Loading skeleton */}
                    {isFetching && (
                      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                        {[1, 2, 3].map(i => (
                          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <div style={{ width: 40, height: 52, borderRadius: 8, background: "var(--bg-subtle)", animation: "pulse 1.5s infinite" }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ height: 14, borderRadius: 6, background: "var(--bg-subtle)", marginBottom: 8, width: "60%", animation: "pulse 1.5s infinite" }} />
                              <div style={{ height: 11, borderRadius: 6, background: "var(--bg-subtle)", width: "35%", animation: "pulse 1.5s infinite" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!isFetching && debouncedQuery !== query.trim() && (
                      <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                        Searching…
                      </div>
                    )}

                    {/* Results list */}
                    {!isFetching && results.length > 0 && (
                      <ul style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
                        {results.map((show, idx) => {
                          const id = show.id || show._id?.$oid;
                          const isActive = idx === safeActiveIdx;
                          return (
                            <motion.li
                              key={id}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.04 }}
                              onClick={() => navigate(show)}
                              onMouseEnter={() => setActiveIdx(idx)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                padding: "10px 16px",
                                cursor: "pointer",
                                background: isActive
                                  ? "var(--bg-subtle, rgba(255,255,255,0.05))"
                                  : "transparent",
                                transition: "background 0.1s",
                              }}
                            >
                              {/* Thumbnail */}
                              <div style={{ flexShrink: 0, width: 40, height: 52, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                                {show.poster_url || show.thumbnail_url ? (
                                  <img
                                    src={show.poster_url || show.thumbnail_url}
                                    alt={show.title}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                ) : (
                                  <div style={{
                                    width: "100%", height: "100%", display: "flex", alignItems: "center",
                                    justifyContent: "center", fontSize: 20,
                                    background: TYPE_COLORS[show.show_type] || "var(--bg-subtle)",
                                  }}>
                                    {TYPE_EMOJI[show.show_type] || "🎭"}
                                  </div>
                                )}
                              </div>

                              {/* Text */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontWeight: 600,
                                  fontSize: "14px",
                                  color: "var(--text-primary)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}>
                                  {show.title}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                                  <span style={{
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    padding: "2px 8px",
                                    borderRadius: 99,
                                    background: TYPE_COLORS[show.show_type] || "rgba(255,255,255,0.08)",
                                    color: TYPE_TEXT[show.show_type] || "var(--text-secondary)",
                                  }}>
                                    {TYPE_EMOJI[show.show_type]} {show.show_type}
                                  </span>
                                  {show.venue && (
                                    <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      <MapPin size={10} /> {show.venue}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Arrow */}
                              <ArrowRight
                                size={16}
                                style={{
                                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                                  flexShrink: 0,
                                  transition: "color 0.1s, transform 0.1s",
                                  transform: isActive ? "translateX(2px)" : "none",
                                }}
                              />
                            </motion.li>
                          );
                        })}
                      </ul>
                    )}

                    {/* Empty */}
                    {!isFetching && debouncedQuery === query.trim() && results.length === 0 && (
                      <div style={{
                        padding: "28px 16px",
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: "14px",
                      }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                        No results for <strong style={{ color: "var(--text-secondary)" }}>&quot;{query}&quot;</strong>
                      </div>
                    )}

                    {/* Footer hint */}
                    {!isFetching && results.length > 0 && (
                      <div style={{
                        borderTop: "1px solid var(--border)",
                        padding: "8px 16px",
                        display: "flex",
                        gap: 12,
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}>
                        <span className="hidden sm:inline">↑↓ navigate</span>
                        <span className="hidden sm:inline">↵ open</span>
                        <span className="hidden sm:inline">Esc close</span>
                        <span style={{ marginLeft: "auto" }}>{results.length} result{results.length !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
