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
  /** Legacy props — kept for backwards-compat, not used */
  shows?: Show[];
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

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const [city, setCity] = useState("All");

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 280);
    return () => clearTimeout(t);
  }, [query]);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setActiveIdx(-1);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
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

  const { data: searchResults, isLoading } = useSearchShows(debouncedQuery, city);
  const results = searchResults || [];

  const navigate = useCallback((show: Show) => {
    const id = show.id || show._id?.$oid;
    if (!id) return;
    onClose();
    router.push(`/shows/${id}`);
  }, [router, onClose]);

  // Keyboard Enter on highlighted item
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && activeIdx >= 0 && results[activeIdx]) {
        navigate(results[activeIdx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, activeIdx, results, navigate]);

  const showDropdown = isOpen && query.length > 1;

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
            className="fixed inset-x-0 top-0 z-[99] flex justify-center px-4"
            style={{ paddingTop: "12px" }}
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--card-bg, #1e293b)",
                  border: "1.5px solid var(--accent, #6366f1)",
                  borderRadius: showDropdown ? "16px 16px 0 0" : "16px",
                  padding: "10px 16px",
                  gap: "10px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 4px rgba(99,102,241,0.12)",
                  transition: "border-radius 0.15s",
                }}
              >
                {isLoading && query.length > 1 ? (
                  <Loader2 size={20} className="text-[var(--accent)] animate-spin shrink-0" />
                ) : (
                  <Search size={20} className="text-[var(--accent)] shrink-0" />
                )}

                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
                  placeholder="Search movies, concerts, events…"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary, #f8fafc)",
                    fontSize: "16px",
                    fontFamily: "inherit",
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />

                <div style={{ flexShrink: 0, paddingLeft: 8, borderLeft: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
                  <CitySelector selectedCity={city} onSelect={setCity} />
                </div>

                {query && (
                  <button
                    onClick={() => { setQuery(""); setDebouncedQuery(""); inputRef.current?.focus(); }}
                    style={{
                      background: "var(--bg-subtle, rgba(255,255,255,0.06))",
                      border: "none",
                      borderRadius: "50%",
                      width: 28, height: 28,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", color: "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  >
                    <X size={14} />
                  </button>
                )}

                <button
                  onClick={onClose}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "13px",
                    padding: "2px 6px",
                    borderRadius: "6px",
                    flexShrink: 0,
                    fontFamily: "inherit",
                  }}
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
                    }}
                  >
                    {/* Loading skeleton */}
                    {isLoading && (
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

                    {/* Results list */}
                    {!isLoading && results.length > 0 && (
                      <ul style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
                        {results.map((show, idx) => {
                          const id = show.id || show._id?.$oid;
                          const isActive = idx === activeIdx;
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
                    {!isLoading && results.length === 0 && (
                      <div style={{
                        padding: "28px 16px",
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: "14px",
                      }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                        No results for <strong style={{ color: "var(--text-secondary)" }}>"{query}"</strong>
                      </div>
                    )}

                    {/* Footer hint */}
                    {!isLoading && results.length > 0 && (
                      <div style={{
                        borderTop: "1px solid var(--border)",
                        padding: "8px 16px",
                        display: "flex",
                        gap: 12,
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}>
                        <span>↑↓ navigate</span>
                        <span>↵ open</span>
                        <span>Esc close</span>
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
