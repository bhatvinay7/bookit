"use client";

import { useState, useEffect } from "react";
import type { Show, SeatLayout, ScheduleV2, ShowType, LayoutSeatClass } from "@/types";
import { Pagination, usePagination } from "../components/Pagination";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const TYPE_ICONS: Record<string, string> = {
  Movie: "🎬", Concert: "🎵", Event: "🎪", GameEvent: "🏟️",
};

const CLASS_COLORS: Record<string, string> = {
  Standard: "#6366f1", Premium: "#8b5cf6", VIP: "#ec4899", GA: "#f59e0b"
};

// ─── Booking countdown badge ──────────────────────────────────────────────────

function BookingCountdown({ seconds }: { seconds: number }) {
  if (seconds <= 0) {
    return <span className="badge badge-green" style={{ fontSize: 11 }}>🟢 Booking Open</span>;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const label = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return <span className="badge badge-yellow" style={{ fontSize: 11 }}>⏳ Opens in {label}</span>;
}

// ─── SeatBar ─────────────────────────────────────────────────────────────────

function SeatBar({ available, total }: { available: number; total: number }) {
  if (!total) return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>;
  const pct = Math.round((available / total) * 100);
  const color = pct > 50 ? "var(--success)" : pct > 20 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ height: 5, background: "var(--bg-input)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
        {available}/{total} avail
      </p>
    </div>
  );
}

// ─── Create Schedule Wizard ───────────────────────────────────────────────────

function CreateScheduleWizard({
  token,
  allSchedules = [],
  onEditSchedule,
  onDone,
  onCancel,
}: {
  token: string;
  allSchedules?: ScheduleV2[];
  onEditSchedule?: (s: ScheduleV2) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step,        setStep]        = useState<1 | 2 | 3>(1);
  const [shows,       setShows]       = useState<Show[]>([]);
  const [layouts,     setLayouts]     = useState<SeatLayout[]>([]);
  const [selectedShow,setSelectedShow]= useState<Show | null>(null);
  const [selectedLayout,setSelectedLayout] = useState<SeatLayout | null>(null);
  const [startTime,   setStartTime]   = useState(""); // optional custom start time
  const [endTime,     setEndTime]     = useState(""); // optional custom end time
  const [date,        setDate]        = useState(""); // YYYY-MM-DD
  const [slot,        setSlot]        = useState<'Morning' | 'Afternoon' | 'Evening' | 'Night'>('Evening');
  const [bookingOpen, setBookingOpen] = useState("");
  const [venueName,   setVenueName]   = useState("");
  const [venueAddress,setVenueAddress]= useState("");
  const [venueCity,   setVenueCity]   = useState("");
  const [venueState,  setVenueState]  = useState("");
  const [prices,      setPrices]      = useState<Record<string, string>>({
    Standard: "150", Premium: "250", VIP: "500", GA: "100"
  });
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  const {
    currentPage: showsPage,
    setCurrentPage: setShowsPage,
    paginatedItems: paginatedShows,
    totalItems: totalShows,
  } = usePagination(shows, 10);

  useEffect(() => {
    fetch(`${API}/api/admin/shows`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setShows).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!selectedShow) return;
    fetch(`${API}/api/admin/layouts?show_type=${selectedShow.show_type}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(setLayouts).catch(() => {});
  }, [selectedShow, token]);

  const handleCreate = async () => {
    if (!selectedShow || !selectedLayout || !date || !endTime || !bookingOpen) {
      setError("Show, Layout, Date, End Time and Booking Open time are required"); return;
    }
    setSaving(true); setError("");
    try {
      const r = await fetch(`${API}/api/admin/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mongo_show_id:   selectedShow.id,
          show_type:       selectedShow.show_type,
          layout_id:       selectedLayout.id,
          date,
          slot,
          start_time:      startTime ? new Date(startTime).toISOString() : undefined,
          end_time:        new Date(endTime).toISOString(),
          booking_open_at: new Date(bookingOpen).toISOString(),
          prices,
          venue_name:      venueName || undefined,
          venue_address:   venueAddress || undefined,
          venue_city:      venueCity || undefined,
          venue_state:     venueState || undefined,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 0 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", margin: "0 auto 4px",
              background: step >= s ? "var(--accent)" : "var(--bg-input)",
              color: step >= s ? "white" : "var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, transition: "all .2s",
            }}>
              {s}
            </div>
            <p style={{ fontSize: 11, color: step === s ? "var(--accent)" : "var(--text-muted)" }}>
              {s === 1 ? "Select Show" : s === 2 ? "Select Layout" : "Time & Prices"}
            </p>
          </div>
        ))}
      </div>

      {/* ── Step 1: Select Show ─────────────────────────────────────────── */}
      {step === 1 && (
        <div>
          <p className="admin-label" style={{ marginBottom: 12 }}>Select a show (Movie, Concert, Event or Game)</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
            {shows.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 24 }}>
                No shows found. Create a show first.
              </p>
            )}
            {paginatedShows.map(s => (
              <div key={s.id}
                onClick={() => setSelectedShow(s)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  border: `2px solid ${selectedShow?.id === s.id ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 10, cursor: "pointer", background: selectedShow?.id === s.id ? "var(--accent-light)" : "white",
                  transition: "all .15s",
                }}
              >
                {s.poster_url ? (
                  <img src={s.poster_url} alt={s.title} style={{ width: 36, height: 50, objectFit: "cover", borderRadius: 4 }} />
                ) : (
                  <div style={{ width: 36, height: 50, background: "var(--bg-input)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {TYPE_ICONS[s.show_type] ?? "🎭"}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500, fontSize: 13 }}>{s.title}</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.show_type} · {s.status}</p>
                </div>
                {selectedShow?.id === s.id && <span style={{ color: "var(--accent)", fontSize: 18 }}>✓</span>}
              </div>
            ))}
          </div>
          <Pagination
            currentPage={showsPage}
            totalItems={totalShows}
            pageSize={10}
            onPageChange={setShowsPage}
          />
          {selectedShow && (
            <div style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              marginTop: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                  📅 Existing Schedules for "{selectedShow.title}"
                </span>
                <span className="badge badge-indigo" style={{ fontSize: 11 }}>
                  {allSchedules.filter(s => s.mongo_show_id === selectedShow.id && !s.deleted_at).length} Existing
                </span>
              </div>
              {allSchedules.filter(s => s.mongo_show_id === selectedShow.id && !s.deleted_at).length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  No existing schedules yet. Click "+ Create New Schedule" below to create one.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto", marginTop: 8 }}>
                  {allSchedules
                    .filter(s => s.mongo_show_id === selectedShow.id && !s.deleted_at)
                    .map(s => (
                      <div key={s.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: "white", padding: "10px 14px", borderRadius: 8,
                        border: "1px solid var(--border)"
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                            {new Date(s.start_time).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            Slot: {s.slot ?? "Evening"} {s.venue_name ? `· 📍 ${s.venue_name}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => { e.stopPropagation(); onEditSchedule?.(s); }}
                          >
                            ✏️ Update Schedule
                          </button>
                          <a
                            href={`/admin/dashboard/schedules/${s.id}/seats`}
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            💺 Edit Seats
                          </a>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" disabled={!selectedShow} onClick={() => setStep(2)}>
              + Create New Schedule →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Select Layout ───────────────────────────────────────── */}
      {step === 2 && (
        <div>
          <p className="admin-label" style={{ marginBottom: 12 }}>
            Select a seat layout for <strong>{selectedShow?.title}</strong>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {layouts.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 24 }}>
                No layouts for {selectedShow?.show_type}. Create a layout first.
              </p>
            )}
            {layouts.map(l => (
              <div key={l.id}
                onClick={() => setSelectedLayout(l)}
                style={{
                  padding: "10px 14px",
                  border: `2px solid ${selectedLayout?.id === l.id ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 10, cursor: "pointer",
                  background: selectedLayout?.id === l.id ? "var(--accent-light)" : "white",
                  transition: "all .15s",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div>
                  <p style={{ fontWeight: 500, fontSize: 13 }}>{l.name}</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.description ?? ""}</p>
                </div>
                <span className="badge badge-indigo" style={{ fontSize: 10 }}>{l.show_type}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" disabled={!selectedLayout} onClick={() => setStep(3)}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Time + Prices ───────────────────────────────────────── */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="admin-label">Date *</label>
              <input className="admin-input" type="date"
                value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="admin-label">Time Slot *</label>
              <select className="admin-input" value={slot} onChange={e => setSlot(e.target.value as any)}>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
              </select>
            </div>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="admin-label">Custom Start Time (Optional)</label>
              <input className="admin-input" type="datetime-local"
                value={startTime} onChange={e => setStartTime(e.target.value)} />
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Leave blank to auto-calculate</p>
            </div>
            <div>
              <label className="admin-label">Custom End Time *</label>
              <input className="admin-input" type="datetime-local"
                value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="admin-label">Booking Opens At *</label>
              <input className="admin-input" type="datetime-local"
                value={bookingOpen} onChange={e => setBookingOpen(e.target.value)} />
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Must be before start time</p>
            </div>
          </div>

          <div style={{ padding: "16px", background: "var(--bg-input)", borderRadius: 10 }}>
            <p className="admin-label" style={{ marginBottom: 12 }}>Venue Details (Optional)</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="admin-label">Venue Name</label>
                <input className="admin-input" placeholder="e.g. Madison Square Garden"
                  value={venueName} onChange={e => setVenueName(e.target.value)} />
              </div>
              <div>
                <label className="admin-label">City</label>
                <input className="admin-input" placeholder="e.g. New York"
                  value={venueCity} onChange={e => setVenueCity(e.target.value)} />
              </div>
              <div>
                <label className="admin-label">Address</label>
                <input className="admin-input" placeholder="e.g. 4 Pennsylvania Plaza"
                  value={venueAddress} onChange={e => setVenueAddress(e.target.value)} />
              </div>
              <div>
                <label className="admin-label">State/Region</label>
                <input className="admin-input" placeholder="e.g. NY"
                  value={venueState} onChange={e => setVenueState(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <label className="admin-label">Prices per Seat Class (₹)</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              {(["Standard", "Premium", "VIP", "GA"] as LayoutSeatClass[]).map(c => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 12, height: 12, background: CLASS_COLORS[c], borderRadius: 3, flexShrink: 0 }} />
                  <label className="admin-label" style={{ width: 70, marginBottom: 0 }}>{c}</label>
                  <input className="admin-input" type="number" style={{ flex: 1 }}
                    placeholder="0" value={prices[c] ?? ""}
                    onChange={e => setPrices(p => ({ ...p, [c]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div style={{ padding: "12px 16px", background: "var(--bg-input)", borderRadius: 10, fontSize: 13 }}>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Summary</p>
            <p>🎭 Show: <strong>{selectedShow?.title}</strong></p>
            <p>🗺 Layout: <strong>{selectedLayout?.name}</strong></p>
            {startTime && <p>🕐 Start: <strong>{new Date(startTime).toLocaleString("en-IN")}</strong></p>}
            {bookingOpen && <p>📅 Booking opens: <strong>{new Date(bookingOpen).toLocaleString("en-IN")}</strong></p>}
            {venueName && <p>📍 Venue: <strong>{venueName}{venueCity ? `, ${venueCity}` : ''}</strong></p>}
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: 12 }}>⚠ {error}</p>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
              {saving ? "Creating…" : "✓ Create Schedule"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSchedulesV2Page() {
  const token = typeof window !== "undefined"
    ? (localStorage.getItem("admin_token") ?? "") : "";

  const [schedules, setSchedules]   = useState<ScheduleV2[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [error,     setError]       = useState("");
  const [showCreate,setShowCreate]  = useState(false);
  const [extraModal,setExtraModal]  = useState<number | null>(null);
  const [editSchedule, setEditSchedule] = useState<ScheduleV2 | null>(null);

  const {
    currentPage,
    setCurrentPage,
    paginatedItems: paginatedSchedules,
    totalItems: totalSchedules,
  } = usePagination(schedules, 10);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/schedules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(await r.text());
      setSchedules(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm("Cancel this schedule? Existing bookings will NOT be auto-refunded.")) return;
    await fetch(`${API}/api/admin/schedules/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    });
    await load();
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Schedules</h1>
          <p className="admin-page-subtitle">Schedule shows — movies, concerts, events, games</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Schedule Show</button>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <span className="admin-card-title">All Schedules</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{schedules.length}</span>
        </div>

        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div className="admin-spinner" style={{ margin: "0 auto 12px" }} />
          </div>
        ) : error ? (
          <div style={{ padding: "24px", color: "var(--danger)", textAlign: "center", fontSize: 13 }}>
            ⚠ {error}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }} onClick={load}>Retry</button>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Show</th>
                  <th>Type</th>
                  <th>Start Time</th>
                  <th>Seats</th>
                  <th>Booking Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
                    No schedules yet.
                  </td></tr>
                )}
                {paginatedSchedules.map(s => (
                  <tr key={s.id} style={{ opacity: s.deleted_at ? 0.4 : 1 }}>
                    <td style={{ fontWeight: 500 }}>{s.show?.title || s.mongo_show_id}</td>
                    <td>
                      <span className="badge badge-indigo" style={{ fontSize: 11 }}>
                        {TYPE_ICONS[s.show_type] ?? "🎭"} {s.show_type}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {new Date(s.start_time).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      {s.venue_name && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>📍 {s.venue_name}</div>}
                    </td>
                    <td>
                      <SeatBar available={s.available_seats ?? 0} total={s.total_seats ?? 0} />
                    </td>
                    <td>
                      {s.deleted_at
                        ? <span className="badge badge-red" style={{ fontSize: 11 }}>Cancelled</span>
                        : <BookingCountdown seconds={s.seconds_until_booking_open ?? 0} />}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {!s.deleted_at && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditSchedule(s)}>
                              ✏️ Edit Schedule
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setExtraModal(s.id)}>
                              + Extra Seats
                            </button>
                            <a href={`/admin/dashboard/schedules/${s.id}/seats`} className="btn btn-ghost btn-sm">
                              Edit Seats
                            </a>
                            <button className="btn btn-danger btn-sm" onClick={() => handleCancel(s.id)}>
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              currentPage={currentPage}
              totalItems={totalSchedules}
              pageSize={10}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* ── Create Wizard Modal ────────────────────────────────────────────── */}
      {showCreate && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: 640 }}>
            <div className="admin-modal-header">
              <span className="admin-modal-title">Schedule a Show</span>
              <button className="admin-modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div className="admin-modal-body">
              <CreateScheduleWizard
                token={token}
                allSchedules={schedules}
                onEditSchedule={(s) => { setShowCreate(false); setEditSchedule(s); }}
                onDone={async () => { setShowCreate(false); await load(); }}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Schedule Modal ────────────────────────────────────────────── */}
      {editSchedule && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: 560 }}>
            <div className="admin-modal-header">
              <span className="admin-modal-title">Edit Schedule #{editSchedule.id}</span>
              <button className="admin-modal-close" onClick={() => setEditSchedule(null)}>×</button>
            </div>
            <div className="admin-modal-body">
              <UpdateScheduleModal
                schedule={editSchedule}
                token={token}
                onDone={async () => { setEditSchedule(null); await load(); }}
                onClose={() => setEditSchedule(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Extra Seats Modal ──────────────────────────────────────────────── */}
      {extraModal && (
        <ExtraSeatsModal
          scheduleId={extraModal}
          token={token}
          onClose={() => { setExtraModal(null); load(); }}
        />
      )}
    </>
  );
}

// ─── Update Schedule Modal ────────────────────────────────────────────────────

function UpdateScheduleModal({
  schedule,
  token,
  onDone,
  onClose,
}: {
  schedule: ScheduleV2;
  token: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const toLocalInput = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  };

  const [date, setDate] = useState(schedule.date ?? schedule.start_time?.slice(0, 10) ?? "");
  const [slot, setSlot] = useState<"Morning" | "Afternoon" | "Evening" | "Night">((schedule.slot as any) ?? "Evening");
  const [startTime, setStartTime] = useState(toLocalInput(schedule.start_time));
  const [endTime, setEndTime] = useState(toLocalInput(schedule.end_time));
  const [bookingOpen, setBookingOpen] = useState(toLocalInput(schedule.booking_open_at));
  const [venueName, setVenueName] = useState(schedule.venue_name ?? "");
  const [venueCity, setVenueCity] = useState(schedule.venue_city ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/admin/schedules/${schedule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date: date || undefined,
          slot,
          start_time: startTime ? new Date(startTime).toISOString() : undefined,
          end_time: endTime ? new Date(endTime).toISOString() : undefined,
          booking_open_at: bookingOpen ? new Date(bookingOpen).toISOString() : undefined,
          venue_name: venueName || undefined,
          venue_city: venueCity || undefined,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleUpdate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div style={{ padding: "10px 14px", background: "var(--danger-light)", color: "var(--danger)", borderRadius: 8, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="admin-label">Date</label>
          <input
            type="date"
            className="admin-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="admin-label">Time Slot</label>
          <select
            className="admin-input"
            value={slot}
            onChange={(e) => setSlot(e.target.value as any)}
          >
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Evening">Evening</option>
            <option value="Night">Night</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="admin-label">Start Time</label>
          <input
            type="datetime-local"
            className="admin-input"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="admin-label">End Time</label>
          <input
            type="datetime-local"
            className="admin-input"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="admin-label">Booking Open Time</label>
        <input
          type="datetime-local"
          className="admin-input"
          value={bookingOpen}
          onChange={(e) => setBookingOpen(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="admin-label">Venue Name</label>
          <input
            type="text"
            className="admin-input"
            placeholder="e.g. Main Arena"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
          />
        </div>
        <div>
          <label className="admin-label">Venue City</label>
          <input
            type="text"
            className="admin-input"
            placeholder="e.g. Mumbai"
            value={venueCity}
            onChange={(e) => setVenueCity(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "✓ Save Changes"}
        </button>
      </div>
    </form>
  );
}

// ─── Extra Seats Modal ────────────────────────────────────────────────────────

interface ExtraRow {
  row_letter: string;
  seat_number: string;
  seat_class: LayoutSeatClass;
  price: string;
}

function ExtraSeatsModal({
  scheduleId, token, onClose
}: { scheduleId: number; token: string; onClose: () => void }) {
  const [rows,   setRows]   = useState<ExtraRow[]>([{ row_letter: "", seat_number: "", seat_class: "Standard", price: "" }]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const update = (i: number, key: keyof ExtraRow, val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [key]: val };
    setRows(next);
  };
  const add    = () => setRows(r => [...r, { row_letter: "", seat_number: "", seat_class: "Standard", price: "" }]);
  const remove = (i: number) => setRows(r => r.filter((_, j) => j !== i));

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const payload = rows.map(r => ({
        row_letter:  r.row_letter.toUpperCase(),
        seat_number: Number(r.seat_number),
        seat_class:  r.seat_class,
        price:       r.price,
      }));
      const res = await fetch(`${API}/api/admin/schedules/${scheduleId}/seats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ seats: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add seats");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: 640 }}>
        <div className="admin-modal-header">
          <span className="admin-modal-title">Add Extra Seats — Schedule #{scheduleId}</span>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
            Add seats beyond the base layout (e.g. VIP boxes, standing area).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px 80px 1fr 100px auto", gap: 8, fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
              <span>Row</span><span>Seat #</span><span>Class</span><span>Price (₹)</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 80px 1fr 100px auto", gap: 8, alignItems: "center" }}>
                <input className="admin-input" placeholder="A" maxLength={4}
                  value={r.row_letter} onChange={e => update(i, "row_letter", e.target.value)} />
                <input className="admin-input" type="number" placeholder="1"
                  value={r.seat_number} onChange={e => update(i, "seat_number", e.target.value)} />
                <select className="admin-input" value={r.seat_class} onChange={e => update(i, "seat_class", e.target.value as LayoutSeatClass)}>
                  {["Standard", "Premium", "VIP", "GA"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="admin-input" type="number" placeholder="500"
                  value={r.price} onChange={e => update(i, "price", e.target.value)} />
                <button className="btn btn-danger btn-sm" onClick={() => remove(i)} style={{ height: 36 }}>✕</button>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={add} style={{ marginTop: 10 }}>+ Row</button>
          {error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 10 }}>⚠ {error}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save Extra Seats"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
