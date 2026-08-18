"use client";

import { useEffect, useState } from "react";

interface Showtime {
  id: number;
  start_time: string;
  seconds_until_start: number;
  booking_open: boolean;
  status: "upcoming" | "in_progress" | "ended";
  available_seats: number;
  total_seats: number;
  screen_name?: string;
}

interface ShowtimeCardProps {
  showtime: Showtime;
  onBook?: (id: number) => void;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Started";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function ShowtimeCard({ showtime, onBook }: ShowtimeCardProps) {
  const [secsLeft, setSecsLeft] = useState(showtime.seconds_until_start);

  useEffect(() => {
    if (secsLeft <= 0) return;
    const t = setInterval(() => setSecsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const bookingOpen = secsLeft <= 0;
  const dt = new Date(showtime.start_time);
  const dateStr = dt.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const pct = showtime.total_seats > 0 ? Math.round((showtime.available_seats / showtime.total_seats) * 100) : 0;

  const statusBadge = () => {
    if (showtime.status === "ended") return { label: "Ended", bg: "#f1f5f9", color: "#64748b" };
    if (bookingOpen) return { label: "Booking Open", bg: "#dcfce7", color: "#16a34a" };
    return { label: `Starts in ${formatCountdown(secsLeft)}`, bg: "#dbeafe", color: "#2563eb" };
  };
  const badge = statusBadge();

  return (
    <div style={{
      background: "white",
      border: "1px solid #e4e7f0",
      borderRadius: 14,
      padding: "16px 18px",
      boxShadow: "0 2px 8px rgba(0,0,0,.06)",
      transition: "box-shadow .2s, transform .2s",
      cursor: showtime.status !== "ended" ? "pointer" : "default",
      position: "relative",
      overflow: "hidden",
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 24px rgba(0,0,0,.10)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,.06)"; (e.currentTarget as HTMLDivElement).style.transform = ""; }}
    >
      {/* Accent stripe */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: bookingOpen ? "#22c55e" : showtime.status === "ended" ? "#d1d5db" : "#6366f1", borderRadius: "14px 14px 0 0" }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4 }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 15, color: "#1a1d2e" }}>{timeStr}</p>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{dateStr}</p>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, background: badge.bg, color: badge.color }}>
          {badge.label}
        </span>
      </div>

      {/* Footer Area: Seat availability and Book Button */}
      <div style={{ marginTop: 14, display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, color: "#6b7280" }}>Seats Available</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: pct > 50 ? "#16a34a" : pct > 20 ? "#d97706" : "#dc2626" }}>
              {showtime.available_seats}/{showtime.total_seats}
            </span>
          </div>
          <div style={{ height: 4, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: pct > 50 ? "#22c55e" : pct > 20 ? "#f59e0b" : "#ef4444", transition: "width .4s" }} />
          </div>
        </div>

        {/* Book Button */}
        {showtime.status !== "ended" && (
          <button
            onClick={() => bookingOpen && onBook?.(showtime.id)}
            disabled={!bookingOpen}
            style={{
              padding: "7px 16px",
              borderRadius: 8, border: "none", cursor: bookingOpen ? "pointer" : "not-allowed",
              fontWeight: 600, fontSize: 12,
              background: bookingOpen ? "#6366f1" : "#f1f5f9",
              color: bookingOpen ? "white" : "#9ca3af",
              transition: "background .2s",
              whiteSpace: "nowrap"
            }}
          >
            {bookingOpen ? "Book" : formatCountdown(secsLeft)}
          </button>
        )}
      </div>
    </div>
  );
}
