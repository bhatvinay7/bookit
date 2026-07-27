"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ScheduleV2, ScheduleSeat } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8082";

export default function ScheduleSeatsEditorPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  
  const token = typeof window !== "undefined" ? (localStorage.getItem("admin_token") ?? "") : "";

  const [schedule, setSchedule] = useState<ScheduleV2 | null>(null);
  const [seats, setSeats] = useState<ScheduleSeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<number>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Need a way to fetch a single schedule. If not available, we fetch all and filter, or just don't show schedule metadata
      // For now we'll just fetch seats.
      const resSeats = await fetch(`${API}/api/admin/schedules/${id}/seats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resSeats.ok) throw new Error("Failed to load seats");
      const seatData = await resSeats.json();
      setSeats(seatData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  // Group seats by Class + Row
  const grouped = seats.reduce((acc, seat) => {
    const key = `${seat.seat_class} - Row ${seat.row_letter}`;
    if (!acc[key]) acc[key] = { seats: [], price: seat.price, class: seat.seat_class, row: seat.row_letter };
    acc[key].seats.push(seat);
    return acc;
  }, {} as Record<string, { seats: ScheduleSeat[], price: string, class: string, row: string }>);

  const toggleGroup = (key: string) => {
    const groupSeats = grouped[key].seats.map(s => s.id);
    const allSelected = groupSeats.every(sid => selectedSeatIds.has(sid));
    
    const next = new Set(selectedSeatIds);
    if (allSelected) {
      groupSeats.forEach(sid => next.delete(sid));
    } else {
      groupSeats.forEach(sid => next.add(sid));
    }
    setSelectedSeatIds(next);
  };

  const applyBulkPrice = async () => {
    if (!bulkPrice || selectedSeatIds.size === 0) return;
    setSaving(true);
    try {
      const payload = Array.from(selectedSeatIds).map(sid => ({
        id: sid,
        price: bulkPrice,
      }));
      
      const res = await fetch(`${API}/api/admin/schedules/${id}/seats`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ seats: payload })
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      setBulkPrice("");
      setSelectedSeatIds(new Set());
      await load();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: 10 }}>← Back to Schedules</button>
          <h1 className="admin-page-title">Edit Seats (Schedule #{id})</h1>
          <p className="admin-page-subtitle">Manage prices and availability for this specific schedule</p>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <span className="admin-card-title">Bulk Price Update</span>
        </div>
        <div style={{ padding: 24, display: "flex", gap: 16, alignItems: "flex-end" }}>
          <div>
            <label className="admin-label">Selected Seats</label>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{selectedSeatIds.size}</div>
          </div>
          <div>
            <label className="admin-label">New Price (₹)</label>
            <input className="admin-input" type="number" placeholder="e.g. 500" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={applyBulkPrice} disabled={saving || selectedSeatIds.size === 0 || !bulkPrice}>
            {saving ? "Updating..." : "Apply Price"}
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 24 }}>
        <div className="admin-card-header">
          <span className="admin-card-title">Seat Groups</span>
        </div>
        
        {loading ? (
          <div style={{ padding: 48, textAlign: "center" }}><div className="admin-spinner" style={{ margin: "0 auto" }} /></div>
        ) : error ? (
          <div style={{ padding: 24, color: "var(--danger)" }}>{error}</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Seat Class</th>
                  <th>Row</th>
                  <th>Price (₹)</th>
                  <th>Seat Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(grouped).map(key => {
                  const g = grouped[key];
                  const allSelected = g.seats.every(s => selectedSeatIds.has(s.id));
                  const someSelected = !allSelected && g.seats.some(s => selectedSeatIds.has(s.id));
                  
                  return (
                    <tr key={key} onClick={() => toggleGroup(key)} style={{ cursor: "pointer", background: allSelected ? "var(--accent-light)" : "" }}>
                      <td>
                        <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }} readOnly />
                      </td>
                      <td><span className="badge badge-indigo">{g.class}</span></td>
                      <td style={{ fontWeight: 600 }}>{g.row}</td>
                      <td>{g.price}</td>
                      <td>{g.seats.length} seats</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
