"use client";

import type { AdminStats, AdminShowtime } from "@/types";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pagination, usePagination } from "./components/Pagination";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatCard {
  label: string;
  value: string;
  icon: string;
  color: string;
}

interface QuickLink {
  href: string;
  icon: string;
  label: string;
  desc: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function seatPct(available: number, total: number): number {
  if (!total || total === 0) return 0;
  return Math.round((available / total) * 100);
}

function isLive(s: AdminShowtime): boolean {
  if (s.deleted_at) return false;
  const start = new Date(s.start_time).getTime();
  const end = start + 150 * 60_000;
  const now = Date.now();
  return now >= start && now <= end;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeatBar({ available, total }: { available: number; total: number }) {
  const pct = seatPct(available, total);
  const color =
    pct > 50 ? "var(--success)" : pct > 20 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ minWidth: 64 }}>
      <div
        style={{
          height: 4,
          background: "var(--bg-input)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 99,
            transition: "width .3s",
          }}
        />
      </div>
      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
        {available ?? 0}/{total ?? 0} avail
      </p>
    </div>
  );
}

function StatCardItem({ c }: { c: StatCard }) {
  return (
    <div className="admin-stat-card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <p className="admin-stat-label">{c.label}</p>
        <span style={{ fontSize: 18 }}>{c.icon}</span>
      </div>
      <p className="admin-stat-value" style={{ color: c.color }}>
        {c.value}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [showtimes, setShowtimes] = useState<AdminShowtime[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const t = localStorage.getItem("admin_token") ?? "";
    if (!t) {
      router.push("/admin/login");
      return;
    }
    setToken(t);

    const headers = { Authorization: `Bearer ${t}` };

    Promise.all([
      fetch(`${API}/api/admin/stats`, { headers }).then<AdminStats>((r) => {
        if (!r.ok) throw new Error("Failed to load stats");
        return r.json();
      }),
      fetch(`${API}/api/admin/schedules`, { headers }).then<AdminShowtime[]>(
        (r) => {
          if (!r.ok) throw new Error("Failed to load schedules");
          return r.json();
        }
      ),
    ])
      .then(([s, st]) => {
        setStats(s);
        setShowtimes(Array.isArray(st) ? st : []);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? (err instanceof Error ? err.message : String(err)) : "Failed to load data";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Derived lists
  const now = new Date();
  const allLiveShows = useMemo(() => showtimes.filter(isLive), [showtimes]);
  const allUpcoming = useMemo(() => {
    return showtimes
      .filter((s) => !s.deleted_at && new Date(s.start_time) > now)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
  }, [showtimes]);

  const {
    currentPage: livePage,
    setCurrentPage: setLivePage,
    paginatedItems: liveShows,
    totalItems: totalLive,
  } = usePagination(allLiveShows, 10);

  const {
    currentPage: upcomingPage,
    setCurrentPage: setUpcomingPage,
    paginatedItems: upcoming,
    totalItems: totalUpcoming,
  } = usePagination(allUpcoming, 10);

  const statCards: StatCard[] = stats
    ? [
        {
          label: "Total Users",
          value: (stats.total_users ?? 0).toLocaleString(),
          icon: "👥",
          color: "#6366f1",
        },
        {
          label: "Active Shows",
          value: (stats.total_shows ?? 0).toLocaleString(),
          icon: "🎬",
          color: "#8b5cf6",
        },
        {
          label: "Total Bookings",
          value: (stats.total_bookings ?? 0).toLocaleString(),
          icon: "🎟",
          color: "#ec4899",
        },
        {
          label: "Revenue",
          value: `₹${(stats.total_revenue ?? 0).toLocaleString("en-IN", {
            maximumFractionDigits: 0,
          })}`,
          icon: "💰",
          color: "#f59e0b",
        },
        {
          label: "Schedules",
          value: (stats.total_schedules ?? 0).toLocaleString(),
          icon: "🗓️",
          color: "#10b981",
        },
        {
          label: "Avail. Seats",
          value: (stats.available_seats ?? 0).toLocaleString(),
          icon: "💺",
          color: "#3b82f6",
        },
      ]
    : [];

  const quickLinks: QuickLink[] = [
    {
      href: "/admin/dashboard/shows",
      icon: "🎭",
      label: "Manage Shows",
      desc: "Add, edit, delete shows/events",
    },
    {
      href: "/admin/dashboard/schedules",
      icon: "📅",
      label: "Schedules",
      desc: "Schedule shows & set seat prices",
    },
    {
      href: "/admin/dashboard/layouts",
      icon: "🗺️",
      label: "Seat Layouts",
      desc: "Manage master seat templates",
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          flexDirection: "column",
          gap: 12,
          color: "var(--text-muted)",
        }}
      >
        <div className="admin-spinner" />
        <p style={{ fontSize: 14 }}>Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--danger)",
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 8 }}>⚠ {error}</p>
        <button
          className="btn btn-ghost"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Overview</h1>
          <p className="admin-page-subtitle">
            Welcome back — here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/dashboard/shows" className="btn btn-ghost">
            + Show
          </Link>
          <Link href="/admin/dashboard/schedules" className="btn btn-primary">
            + Schedule
          </Link>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      {statCards.length > 0 ? (
        <div className="admin-stats-grid">
          {statCards.map((c) => (
            <StatCardItem key={c.label} c={c} />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          No stats available
        </div>
      )}

      {/* ── Live & Upcoming ─────────────────────────────────────────────── */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
      >
        {/* Live shows */}
        <div className="admin-card">
          <div className="admin-card-header">
            <span className="admin-card-title">🔴 Live Now</span>
            <span className="badge badge-red" style={{ fontSize: 11 }}>
              {totalLive} running
            </span>
          </div>

          {liveShows.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No shows currently running
            </div>
          ) : (
            liveShows.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontWeight: 500,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.show_title ?? "—"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {s.venue_name ?? "—"} · {formatTime(s.start_time)}
                  </p>
                </div>
                <SeatBar
                  available={s.available_seats ?? 0}
                  total={s.total_seats ?? 0}
                />
              </div>
            ))
          )}
          <Pagination
            currentPage={livePage}
            totalItems={totalLive}
            pageSize={10}
            onPageChange={setLivePage}
          />
        </div>

        {/* Upcoming */}
        <div className="admin-card">
          <div className="admin-card-header">
            <span className="admin-card-title">🗓 Upcoming</span>
            <Link
              href="/admin/dashboard/schedules"
              style={{
                fontSize: 12,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              View all →
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No upcoming shows
            </div>
          ) : (
            upcoming.map((s) => {
              const dt = new Date(s.start_time);
              return (
                <div
                  key={s.id}
                  style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontWeight: 500,
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.show_title ?? "—"}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {dt.toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {formatTime(s.start_time)} · {s.venue_name ?? "—"}
                    </p>
                  </div>
                  <span className="badge badge-blue" style={{ fontSize: 10 }}>
                    {s.available_seats ?? 0} seats
                  </span>
                </div>
              );
            })
          )}
          <Pagination
            currentPage={upcomingPage}
            totalItems={totalUpcoming}
            pageSize={10}
            onPageChange={setUpcomingPage}
          />
        </div>
      </div>

      {/* ── Quick links ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginTop: 20,
        }}
      >
        {quickLinks.map((q) => (
          <Link key={q.label} href={q.href} style={{ textDecoration: "none" }}>
            <div
              className="admin-card"
              style={{ padding: "18px 20px", cursor: "pointer" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLDivElement).style.boxShadow =
                  "var(--shadow-md)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLDivElement).style.boxShadow =
                  "var(--shadow-sm)")
              }
            >
              <span style={{ fontSize: 26 }}>{q.icon}</span>
              <p style={{ fontWeight: 600, fontSize: 14, marginTop: 10 }}>
                {q.label}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                {q.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
