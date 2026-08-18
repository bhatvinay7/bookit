"use client";
import { useEffect, useState } from "react";
import { UserNav } from "@/components/UserNav";
import { Ticket, MapPin, Calendar, Clock, Download, AlertCircle, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

interface UserTicket {
  booking_id: string;
  status: string;
  total_amount: string;
  show_title: string;
  venue_name: string;
  show_time: string;
  seats: string[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTickets = async () => {
      const token = localStorage.getItem("user_token");
      if (!token) {
        window.location.href = "/login";
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/user/me/tickets`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error("Failed to fetch tickets");
        }

        const data: UserTicket[] = await res.json();
        // Sort tickets by date descending (newest first)
        data.sort((a, b) => new Date(b.show_time).getTime() - new Date(a.show_time).getTime());
        setTickets(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, []);

  const handleDownloadPdf = async (ticketId: string) => {
    const token = localStorage.getItem("user_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/user/tickets/${ticketId}/pdf`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Failed to download PDF");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket_${ticketId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Could not download ticket PDF.");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-50 bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)] h-16">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-indigo-500 hover:text-indigo-600 transition-colors font-semibold">
            <ArrowLeft className="w-5 h-5" />
            Back to Home
          </a>
          <UserNav />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-24">
        <div className="mb-10">
          <h1 className="text-4xl font-black font-display mb-2">My Tickets</h1>
          <p className="text-[var(--text-secondary)]">View your upcoming and past movie tickets.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 p-6 rounded-2xl flex items-center gap-3">
            <AlertCircle />
            <p>{error}</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-20 glass dark:glass-dark rounded-3xl">
            <Ticket className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
            <h3 className="text-xl font-bold mb-2">No tickets found</h3>
            <p className="text-[var(--text-secondary)] mb-6">You haven't booked any tickets yet.</p>
            <button 
              onClick={() => window.location.href = "/"}
              className="px-6 py-2.5 btn-primary"
            >
              Browse Shows
            </button>
          </div>
        ) : (
          <div className="grid gap-6">
            {tickets.map((ticket, idx) => {
              const isPast = new Date(ticket.show_time) < new Date();
              const dateObj = new Date(ticket.show_time);
              
              return (
                <motion.div
                  key={ticket.booking_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100 rounded-2xl border ${isPast ? 'border-slate-200 dark:border-slate-800 opacity-70' : 'border-indigo-100 dark:border-indigo-900/30'} p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row gap-6 relative overflow-hidden`}
                >
                  <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
                  
                  <div className="flex-1 pl-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${ticket.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                        {ticket.status}
                      </span>
                      {isPast && (
                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          Past Event
                        </span>
                      )}
                      <span className="text-xs font-mono text-slate-400">#{ticket.booking_id}</span>
                    </div>
                    
                    <h3 className="text-2xl font-bold mb-4">{ticket.show_title}</h3>
                    
                    <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-indigo-500" />
                        {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-indigo-500" />
                        {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} className="text-indigo-500" />
                        {ticket.venue_name}
                      </div>
                    </div>
                  </div>
                  
                  <div className="md:w-64 border-t md:border-t-0 md:border-l border-dashed border-slate-200 dark:border-slate-700 pt-6 md:pt-0 md:pl-6 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Seats ({ticket.seats.length})</p>
                      <p className="font-medium text-sm mb-4 leading-relaxed">{ticket.seats.join(", ")}</p>
                      
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Paid</p>
                      <p className="font-bold text-lg text-emerald-600 dark:text-emerald-400">₹{ticket.total_amount}</p>
                    </div>
                    
                    <button 
                      onClick={() => handleDownloadPdf(ticket.booking_id)}
                      className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sm font-medium rounded-xl transition-colors"
                    >
                      <Download size={14} /> Download PDF
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
