"use client";

import { useState } from "react";
import type { Show, ShowType } from "@/types";
import ShowForm from "./components/ShowForm";
import { useToast } from "../components/ToastProvider";
import { Pagination, usePagination } from "../components/Pagination";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type FilterType = "all" | ShowType;

const TYPE_ICONS: Record<string, string> = {
  Movie: "🎬", Concert: "🎵", Event: "🎪", GameEvent: "🏟️",
};

export default function AdminShowsPage() {
  const token = typeof window !== "undefined"
    ? (localStorage.getItem("admin_token") ?? "") : "";

  const { addToast } = useToast();
  const [shows,      setShows]      = useState<Show[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [fetched,    setFetched]    = useState(false);
  const [filter,     setFilter]     = useState<FilterType>("all");
  const [search,     setSearch]     = useState("");
  const [modal,      setModal]      = useState<"create" | "edit" | null>(null);
  const [selected,   setSelected]   = useState<Show | null>(null);
  const [saving,     setSaving]     = useState(false);

  const {
    currentPage,
    setCurrentPage,
    paginatedItems: paginatedShows,
    totalItems: totalShows,
  } = usePagination(shows, 10);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("show_type", filter);
      if (search) params.set("search", search);
      const r = await fetch(`${API}/api/admin/shows?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(await r.text());
      const data: Array<Show & { _id?: { $oid: string } }> = await r.json();
      
      // Map MongoDB _id to flat id and sort alphabetically
      const mapped = data.map((s) => ({
        ...s,
        id: s._id?.$oid || s.id
      })).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      
      setShows(mapped);
      setFetched(true);
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Failed to load shows", "error");
    } finally {
      setLoading(false);
    }
  };

  // Load on first render
  if (!fetched && !loading) { load(); }

  const handleSave = async (data: Partial<Show>) => {
    setSaving(true);
    try {
      const url  = selected ? `${API}/api/admin/shows/${selected.id}` : `${API}/api/admin/shows`;
      const meth = selected ? "PUT" : "POST";
      const r = await fetch(url, {
        method: meth,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(await r.text());
      addToast(`Show ${selected ? "updated" : "created"} successfully!`, "success");
      setModal(null); setSelected(null);
      setFetched(false); // re-fetch
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Soft-delete this show?")) return;
    try {
      const r = await fetch(`${API}/api/admin/shows/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(await r.text());
      addToast("Show deleted successfully", "success");
      setFetched(false);
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  const filters: FilterType[] = ["all", "Movie", "Concert", "Event", "GameEvent"];

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Shows</h1>
          <p className="admin-page-subtitle">Manage all movies, concerts, events &amp; game events</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setSelected(null); setModal("create"); }}>
          + Add Show
        </button>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        <input className="admin-input" style={{ maxWidth: 260 }}
          placeholder="Search by title or tag…"
          value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (setFetched(false), load())}
        />
        <div style={{ display: "flex", gap: 4, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 }}>
          {filters.map(f => (
            <button key={f} type="button"
              style={{
                padding: "5px 14px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all .15s",
                background: filter === f ? "var(--accent)" : "transparent",
                color: filter === f ? "white" : "var(--text-secondary)",
              }}
              onClick={() => { setFilter(f); setFetched(false); }}
            >
              {f === "all" ? "All" : `${TYPE_ICONS[f]} ${f}`}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setFetched(false); load(); }}>↻ Refresh</button>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="admin-card">
        <div className="admin-card-header">
          <span className="admin-card-title">Shows</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{shows.length} results</span>
        </div>

        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
            <div className="admin-spinner" style={{ margin: "0 auto 12px" }} />
            Loading…
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Show</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shows.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
                    No shows found. Click "+ Add Show" to create one.
                  </td></tr>
                )}
                {paginatedShows.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {s.poster_url ? (
                          <img src={s.poster_url} alt={s.title} style={{ width: 36, height: 52, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 36, height: 52, background: "var(--bg-input)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                            {TYPE_ICONS[s.show_type] ?? "🎭"}
                          </div>
                        )}
                        <div>
                          <p style={{ fontWeight: 500, color: "var(--text-primary)" }}>{s.title}</p>
                          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {s.tags?.slice(0, 3).map(t => `#${t}`).join(" ")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-indigo" style={{ fontSize: 11 }}>
                        {TYPE_ICONS[s.show_type]} {s.show_type}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {s.show_type === "Movie" && (s.director ? `Dir: ${s.director}` : "—")}
                      {(s.show_type === "Concert" || s.show_type === "Event") && (s.host ? `Host: ${s.host}` : "—")}
                      {s.show_type === "GameEvent" && (
                        s.team_a && s.team_b
                          ? `${s.team_a.name} vs ${s.team_b.name}`
                          : (s.sport ?? "—")
                      )}
                    </td>
                    <td>
                      <span className={`badge ${
                        s.status === "nowShowing" ? "badge-green"
                        : s.status === "comingSoon" ? "badge-blue"
                        : s.status === "ended" ? "badge-gray"
                        : "badge-red"
                      }`} style={{ fontSize: 11 }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(s); setModal("edit"); }}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              currentPage={currentPage}
              totalItems={totalShows}
              pageSize={10}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: 780 }}>
            <div className="admin-modal-header">
              <span className="admin-modal-title">
                {modal === "create" ? "Add New Show" : `Edit — ${selected?.title ?? ""}`}
              </span>
              <button className="admin-modal-close" onClick={() => { setModal(null); setSelected(null); }}>×</button>
            </div>
            <div className="admin-modal-body">
              <ShowForm
                initial={selected ?? undefined}
                token={token}
                onSubmit={handleSave}
                onCancel={() => { setModal(null); setSelected(null); }}
                isLoading={saving}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
