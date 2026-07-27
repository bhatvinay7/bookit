"use client";

import { useState, useEffect } from "react";
import type { SeatLayout, SeatLayoutSeat, LayoutSeatClass, ShowType, SeatInput } from "@/types";
import { useToast } from "../components/ToastProvider";
import { Pagination, usePagination } from "../components/Pagination";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8082";

// ─── Seat Picker (custom visual grid — react-seat-picker wrapper) ─────────────
// react-seat-picker v1 expects a specific row format; we wrap it here.

interface SeatCell {
  id: string;
  row: string;
  number: number;
  class: LayoutSeatClass;
  selected: boolean;
}

const CLASSES: LayoutSeatClass[] = ["Standard", "Premium", "VIP", "GA"];
const CLASS_COLORS: Record<LayoutSeatClass, string> = {
  Standard: "#6366f1", Premium: "#8b5cf6", VIP: "#ec4899", GA: "#f59e0b"
};

function SeatGrid({
  seats,
  onToggle,
  readonly = false,
}: {
  seats: SeatCell[];
  onToggle?: (id: string) => void;
  readonly?: boolean;
}) {
  const rows = [...new Set(seats.map(s => s.row))].sort();
  return (
    <div style={{ overflowX: "auto", padding: "8px 0" }}>
      {/* Screen indicator */}
      <div style={{
        width: "100%", maxWidth: 480, margin: "0 auto 20px",
        background: "linear-gradient(to bottom, #d1d5db, #f3f4f6)",
        height: 8, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
      }}>
        <span style={{ position: "absolute", top: 12, fontSize: 10, color: "var(--text-muted)", letterSpacing: 3, textTransform: "uppercase" }}>
          Screen / Stage / Field
        </span>
      </div>
      {rows.map(row => (
        <div key={row} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <span style={{ width: 20, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textAlign: "center" }}>{row}</span>
          {seats.filter(s => s.row === row).sort((a, b) => a.number - b.number).map(s => (
            <button
              key={s.id}
              type="button"
              title={`${s.row}${s.number} (${s.class})`}
              onClick={() => !readonly && onToggle?.(s.id)}
              style={{
                width: 28, height: 28, borderRadius: 4,
                border: s.selected ? "2px solid #1e1b4b" : "1px solid var(--border)",
                background: s.selected ? CLASS_COLORS[s.class] : "var(--bg-input)",
                color: s.selected ? "white" : "var(--text-muted)",
                fontSize: 9, fontWeight: 600,
                cursor: readonly ? "default" : "pointer",
                transition: "all .15s",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {s.number}
            </button>
          ))}
        </div>
      ))}
      {/* Legend */}
      {!readonly && (
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          {CLASSES.map(c => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-secondary)" }}>
              <div style={{ width: 14, height: 14, background: CLASS_COLORS[c], borderRadius: 3 }} />
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import dynamic from "next/dynamic";
import type { LayoutShape } from "./components/CanvasSeatDesigner";

const CanvasSeatDesigner = dynamic(
  () => import("./components/CanvasSeatDesigner"),
  { ssr: false }
);
// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminLayoutsPage() {
  const token = typeof window !== "undefined"
    ? (localStorage.getItem("admin_token") ?? "") : "";

  const { addToast } = useToast();
  const [layouts,    setLayouts]    = useState<SeatLayout[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [preview,    setPreview]    = useState<{ layout: SeatLayout; seats: SeatLayoutSeat[] } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", show_type: "Movie" as ShowType, description: "", layout_shape: "rectangular" });
  const [creating,   setCreating]   = useState(false);
  const [newLayoutId,setNewLayoutId]= useState<number | null>(null);
  const [addingSeats,setAddingSeats]= useState(false);
  const [saveSuccess,setSaveSuccess]= useState(false);
  const [editingLayoutId, setEditingLayoutId] = useState<number | null>(null);
  const [initialSeats, setInitialSeats] = useState<SeatInput[]>([]);
  const [isEditingMode, setIsEditingMode] = useState(false);

  const {
    currentPage,
    setCurrentPage,
    paginatedItems: paginatedLayouts,
    totalItems: totalLayouts,
  } = usePagination(layouts, 10);

  const loadLayouts = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/layouts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(await r.text());
      setLayouts(await r.json());
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async (layout: SeatLayout) => {
    const r = await fetch(`${API}/api/admin/layouts/${layout.id}/seats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return;
    const data = await r.json() as { layout: SeatLayout; seats: SeatLayoutSeat[] };
    setPreview(data);
  };

  useEffect(() => { loadLayouts(); }, []);

  const handleCreateLayout = async () => {
    if (!createForm.name.trim()) { addToast("Name required", "error"); return; }
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/admin/layouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(createForm),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { id: number };
      setNewLayoutId(data.id);
      addToast("Layout template created! Now configure the seats.", "success");
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Create failed", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveSeats = async (seats: SeatInput[]) => {
    const layoutId = isEditingMode ? editingLayoutId : newLayoutId;
    if (!layoutId) return;
    setAddingSeats(true);
    try {
      if (isEditingMode) {
        const r = await fetch(`${API}/api/admin/layouts/${layoutId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: createForm.name,
            description: createForm.description,
            seats: seats,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
      } else {
        const r = await fetch(`${API}/api/admin/layouts/${layoutId}/seats`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ seats }),
        });
        if (!r.ok) throw new Error(await r.text());
      }
      
      setSaveSuccess(true);
      addToast(`Layout ${isEditingMode ? "updated" : "saved"} successfully!`, "success");
      await loadLayouts();
      
      setTimeout(() => {
        setShowCreate(false); setNewLayoutId(null); setEditingLayoutId(null); setIsEditingMode(false);
        setCreateForm({ name: "", show_type: "Movie", description: "", layout_shape: "rectangular" });
        setInitialSeats([]);
        setSaveSuccess(false);
      }, 1000);
      
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setAddingSeats(false);
    }
  };

  const handleEditClick = async (layout: SeatLayout) => {
    const r = await fetch(`${API}/api/admin/layouts/${layout.id}/seats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) { addToast("Failed to fetch seats for editing", "error"); return; }
    const data = await r.json() as { layout: SeatLayout; seats: SeatLayoutSeat[] };
    
    const initSeats: SeatInput[] = data.seats.map(s => ({
      row_letter: s.row_letter,
      seat_number: s.seat_number,
      seat_class: s.seat_class as LayoutSeatClass,
      x_pos: s.x_pos ?? undefined,
      y_pos: s.y_pos ?? undefined,
      block_name: s.block_name ?? undefined,
    }));
    
    setInitialSeats(initSeats);
    setCreateForm({
      name: layout.name,
      show_type: layout.show_type as ShowType,
      description: layout.description ?? "",
      layout_shape: layout.layout_shape,
    });
    setEditingLayoutId(layout.id);
    setIsEditingMode(true);
    setShowCreate(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this seat layout? Active schedules will retain their seats but lose reference to this template.")) return;
    try {
      const r = await fetch(`${API}/api/admin/layouts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(await r.text());
      addToast("Layout deleted successfully", "success");
      loadLayouts();
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : "Failed to delete layout", "error");
    }
  };

  const SHOW_TYPES: ShowType[] = ["Movie", "Concert", "Event", "GameEvent"];

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Seat Layouts</h1>
          <p className="admin-page-subtitle">Create reusable master seat templates for scheduling</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Layout</button>
      </div>

      {/* ── Layouts Table ─────────────────────────────────────────────────── */}
      <div className="admin-card">
        <div className="admin-card-header">
          <span className="admin-card-title">Master Layouts</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{layouts.length}</span>
        </div>
        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div className="admin-spinner" style={{ margin: "0 auto" }} />
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Layout Name</th>
                  <th>Show Type</th>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {layouts.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
                    No layouts yet. Create one to start scheduling.
                  </td></tr>
                )}
                {paginatedLayouts.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500 }}>{l.name}</td>
                    <td><span className="badge badge-indigo" style={{ fontSize: 11 }}>{l.show_type}</span></td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{l.description ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => loadPreview(l)}>
                          Preview Seats
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEditClick(l)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(l.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              currentPage={currentPage}
              totalItems={totalLayouts}
              pageSize={10}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* ── Preview Modal ─────────────────────────────────────────────────── */}
      {preview && (
        <div className="admin-modal-overlay" onClick={() => setPreview(null)}>
          <div className="admin-modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <span className="admin-modal-title">🗺 {preview.layout.name} — Seat Preview</span>
              <button className="admin-modal-close" onClick={() => setPreview(null)}>×</button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                {preview.seats.length} total seats in this layout
              </p>
              <CanvasSeatDesigner
                shape={preview.layout.layout_shape as LayoutShape}
                readonly={true}
                initialSeats={preview.seats.map(s => ({
                  row_letter: s.row_letter,
                  seat_number: s.seat_number,
                  seat_class: s.seat_class as LayoutSeatClass,
                  x_pos: s.x_pos || 100,
                  y_pos: s.y_pos || 100,
                  block_name: s.block_name || ""
                }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Create Layout Modal ───────────────────────────────────────────── */}
      {showCreate && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ width: "90vw", maxWidth: "1200px", maxHeight: "95vh", display: "flex", flexDirection: "column" }}>
            <div className="admin-modal-header">
              <span className="admin-modal-title">{isEditingMode ? "Edit Seat Layout" : "Create Seat Layout"}</span>
              <button className="admin-modal-close" onClick={() => { setShowCreate(false); setNewLayoutId(null); setIsEditingMode(false); setEditingLayoutId(null); setInitialSeats([]); }}>×</button>
            </div>
            <div className="admin-modal-body">
              {!newLayoutId ? (
                /* Step 1: metadata */
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label className="admin-label">Layout Name *</label>
                      <input className="admin-input" placeholder="Hall A — 300 seats"
                        value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="admin-label">Show Type</label>
                      <select className="admin-input" value={createForm.show_type}
                        onChange={e => setCreateForm(f => ({ ...f, show_type: e.target.value as ShowType }))}>
                        {SHOW_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="admin-label">Venue Shape</label>
                      <select className="admin-input" value={createForm.layout_shape}
                        onChange={e => setCreateForm(f => ({ ...f, layout_shape: e.target.value }))}>
                        <option value="rectangular">Rectangular Grid (e.g. Multiplex)</option>
                        <option value="square">Square Block (e.g. Concert)</option>
                        <option value="circular">Circular Stadium (e.g. Game)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="admin-label">Description (optional)</label>
                    <input className="admin-input" placeholder="Notes about this layout"
                      value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                    <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setIsEditingMode(false); setEditingLayoutId(null); }}>Cancel</button>
                    {isEditingMode ? (
                      <button className="btn btn-primary" onClick={() => { setNewLayoutId(editingLayoutId); }}>
                        Next: Edit Seats →
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={handleCreateLayout} disabled={creating}>
                        {creating ? "Creating…" : "Next: Design Seats →"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Step 2: seat designer */
                <div>
                  <div style={{ padding: "8px 12px", background: "var(--accent-light)", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "var(--accent)" }}>
                    {isEditingMode ? `✓ Editing layout (ID #${editingLayoutId}).` : `✓ Layout created (ID #${newLayoutId}). Now design the seats below.`}
                  </div>
                  <CanvasSeatDesigner
                    shape={createForm.layout_shape as LayoutShape}
                    initialSeats={initialSeats}
                    onSave={handleSaveSeats}
                    isSaving={addingSeats}
                    isSaved={saveSuccess}
                    onCancel={() => { setShowCreate(false); setNewLayoutId(null); setIsEditingMode(false); setEditingLayoutId(null); setInitialSeats([]); loadLayouts(); }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
