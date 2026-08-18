"use client";

import { useState, useEffect, useMemo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format, parseISO } from "date-fns";

import { useScheduleMovie } from "@/hooks/useApi"; // We will not use this hook anymore, we'll do raw fetch

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ScheduleForm({ token }: { token: string }) {
  const [shows, setShows] = useState<any[]>([]);
  const [layouts, setLayouts] = useState<any[]>([]);
  
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedLayoutId, setSelectedLayoutId] = useState("");
  
  const [sDate, setSDate] = useState<Date | null>(null);
  const [bDate, setBDate] = useState<Date | null>(null); // Booking open date
  
  const [layoutSeats, setLayoutSeats] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({
    Standard: "15.00"
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch Shows and Layouts
    async function fetchData() {
      try {
        const [showsRes, layoutsRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/shows`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/admin/layouts`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        
        if (showsRes.ok) setShows(await showsRes.json());
        if (layoutsRes.ok) setLayouts(await layoutsRes.json());
      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    }
    fetchData();
  }, [token]);

  useEffect(() => {
    if (selectedLayoutId) {
      // Fetch layout seats to determine categories
      fetch(`${API_URL}/api/admin/layouts/${selectedLayoutId}/seats`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(data => {
        if (data.seats) {
          setLayoutSeats(data.seats);
          // Extract unique categories
          const uniqueCats = new Set<string>();
          data.seats.forEach((s: { seat_class: string }) => uniqueCats.add(s.seat_class));
          const newPrices: Record<string, string> = {};
          uniqueCats.forEach(cat => {
            newPrices[cat] = prices[cat] || "20.00"; // preserve old if exists, else default 20
          });
          setPrices(newPrices);
        }
      })
      .catch(console.error);
    }
  }, [selectedLayoutId, token]);

  const selectedShow = shows.find(s => s._id?.$oid === selectedShowId);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShowId || !selectedLayoutId || !sDate || !bDate || !selectedShow) {
      alert("Please fill all required fields");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/schedules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mongo_show_id: selectedShowId,
          show_type: selectedShow.show_type || "Movie",
          layout_id: parseInt(selectedLayoutId, 10),
          start_time: sDate.toISOString(),
          booking_open_at: bDate.toISOString(),
          prices: prices,
          venue_name: "Main Arena",
          venue_city: "Metropolis"
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      alert("Schedule generated successfully!");
      setSelectedShowId("");
      setSelectedLayoutId("");
      setSDate(null);
      setBDate(null);
    } catch (err: unknown) {
      alert(`Failed to generate schedule: ${(err instanceof Error ? err.message : String(err))}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChange = (cat: string, val: string) => {
    setPrices(prev => ({ ...prev, [cat]: val }));
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl p-8 border border-slate-800 shadow-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Create Schedule</h2>
        <p className="text-slate-400">Map a Show to a Seat Layout and configure category pricing.</p>
      </div>
      
      <form onSubmit={handleSchedule} className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <label className="block">
            <span className="text-slate-300 font-medium mb-2 block">Select Show</span>
            <select 
              required 
              className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none" 
              value={selectedShowId} 
              onChange={e => setSelectedShowId(e.target.value)}
            >
              <option value="">-- Choose Show --</option>
              {shows.map(s => (
                <option key={s._id.$oid} value={s._id.$oid}>{s.title} ({s.show_type})</option>
              ))}
            </select>
          </label>
          
          <label className="block">
            <span className="text-slate-300 font-medium mb-2 block">Select Layout</span>
            <select 
              required 
              className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none" 
              value={selectedLayoutId} 
              onChange={e => setSelectedLayoutId(e.target.value)} 
            >
              <option value="">-- Choose Layout --</option>
              {layouts.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.show_type})</option>
              ))}
            </select>
          </label>
        </div>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-slate-300 font-medium mb-2 block">Show Start Time</span>
              <div className="relative">
                <DatePicker
                  selected={sDate}
                  onChange={(date: Date | null) => setSDate(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="yyyy-MM-dd HH:mm"
                  className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none"
                  placeholderText="YYYY-MM-DD HH:mm"
                  required
                />
              </div>
            </label>
            
            <label className="block">
              <span className="text-slate-300 font-medium mb-2 block">Booking Opens At</span>
              <div className="relative">
                <DatePicker
                  selected={bDate}
                  onChange={(date: Date | null) => setBDate(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="yyyy-MM-dd HH:mm"
                  className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none"
                  placeholderText="YYYY-MM-DD HH:mm"
                  required
                />
              </div>
            </label>
          </div>
          
          {Object.keys(prices).length > 0 && (
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-300 font-medium mb-4 block">Pricing per Category ($)</span>
              <div className="grid grid-cols-2 gap-4">
                {Object.keys(prices).map(cat => (
                  <label key={cat} className="block">
                    <span className="text-slate-400 text-sm mb-1 block">{cat}</span>
                    <input 
                      type="number" 
                      step="0.01"
                      required 
                      className="w-full p-3 bg-slate-900 border border-slate-800 rounded-lg text-white focus:ring-1 focus:ring-purple-500 transition-all outline-none" 
                      value={prices[cat]} 
                      onChange={e => handlePriceChange(cat, e.target.value)} 
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="col-span-1 md:col-span-2 mt-4 pt-6 border-t border-slate-800/50">
          <button 
            type="submit"
            disabled={loading}
            className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Generating..." : "Create Schedule"}
          </button>
        </div>
      </form>
    </div>
  );
}
