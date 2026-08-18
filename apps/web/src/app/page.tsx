"use client";

import Link from "next/link";
import Image from "next/image";
import { Ticket, Star, ChevronRight, Film, Music, Gamepad2, Search, Zap, TicketCheck, Mail, Phone, Armchair, Menu, X, ArrowRight, Shield, Sparkles, Smartphone, Monitor, Calendar, Clock, MapPin, CreditCard, Bell, BarChart3, Users, TrendingUp } from "lucide-react";
import { UserNav } from "@/components/UserNav";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Show } from "@/types";
import ShowCard from "@/components/shows/ShowCard";

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [shows, setShows] = useState<Array<Show & { _id?: { $oid: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
    setIsLoggedIn(!!localStorage.getItem("user_token"));

    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);

    async function fetchShows() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/user/shows`);
        if (!res.ok) throw new Error("Failed to fetch shows");
        const data = await res.json();
        setShows(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? (err instanceof Error ? err.message : String(err)) : "Error fetching shows");
      } finally {
        setLoading(false);
      }
    }
    fetchShows();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text-primary)] font-sans overflow-x-hidden relative">

      {/* ════ NAVBAR ════ */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`fixed top-0 w-full px-4 sm:px-8 flex items-center justify-between z-50 transition-all duration-300 ${
          scrolled 
            ? "bg-[var(--nav-bg)] backdrop-blur-xl border-b border-[var(--divider)] shadow-sm py-3 sm:py-3.5"
            : "bg-transparent py-4 sm:py-5"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent)] to-yellow-400 flex items-center justify-center shadow-md">
            <Ticket className="w-4.5 h-4.5 text-[#12111a]" />
          </div>
          <span className="text-xl font-black tracking-tight text-[var(--text-primary)] font-display">
            BookIt
          </span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          {mounted ? (
            <>
              <div className="hidden sm:flex items-center gap-3">
                {isLoggedIn && (
                  <Link href="/dashboard">
                    <button className="px-5 py-2 font-semibold rounded-lg transition-all text-sm bg-[var(--text-primary)] text-[var(--bg)] hover:opacity-90">
                      Dashboard
                    </button>
                  </Link>
                )}
                <UserNav />
              </div>
              <button 
                className="sm:hidden p-2 text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-lg transition-colors"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
            </>
          ) : null}
        </div>
      </motion.nav>

      {/* ════ MOBILE SIDEBAR ════ */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[999] flex justify-end sm:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
              onClick={() => setIsMobileMenuOpen(false)} 
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-[280px] bg-[var(--card-bg)] h-full relative z-[1000] border-l border-[var(--border)] shadow-2xl p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="text-lg font-bold text-[var(--text-primary)]">Menu</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-col gap-4 flex-1">
                {isLoggedIn && (
                  <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                    <button className="w-full py-3 font-semibold rounded-xl bg-[var(--text-primary)] text-[var(--bg)]">
                      Go to Dashboard
                    </button>
                  </Link>
                )}
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--bg-subtle)]">
                  <UserNav />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ════ HERO SECTION ════ */}
      <main className="flex-1 flex flex-col relative z-10">
        <section className="relative w-full overflow-hidden">
          <div className="relative w-full min-h-[500px] sm:min-h-[650px] lg:min-h-[95vh] pt-28 sm:pt-36 pb-20 sm:pb-28 flex flex-col justify-center">
            {/* Gradient background */}
            <Image 
              src="/hero-gradient-bg.png" 
              alt="" 
              fill 
              className="object-cover" 
              priority
            />
            {/* Overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/90 via-purple-900/80 to-indigo-900/70" />
            
            <div className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              
              {/* Left: Hero Copy */}
              <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/90 text-xs font-semibold tracking-wide mb-6"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Seamless Booking Experience
                </motion.div>
                
                <motion.h1 
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black text-white font-display mb-5 leading-[1.1] tracking-tight"
                >
                  Book events from anywhere, anytime
                </motion.h1>
                
                <motion.p 
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.35 }}
                  className="text-base sm:text-lg text-white/70 max-w-lg mb-8 font-medium leading-relaxed"
                >
                  Stay on top of your schedule, availability, and notifications—wherever you are. Browse and book instantly from any device.
                </motion.p>
                
                <motion.div 
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.45 }}
                  className="flex items-center gap-4"
                >
                  <Link href="/dashboard">
                    <button className="px-7 py-3 bg-white text-indigo-900 hover:bg-white/90 font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 text-sm">
                      <Smartphone className="w-4 h-4" />
                      Start Booking
                    </button>
                  </Link>
                </motion.div>
              </div>

            {/* Right: Phone Mockup with Booking Slots */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="relative w-full max-w-md lg:max-w-lg mx-auto flex justify-center lg:justify-end"
            >
              <div className="relative">
                {/* Phone Frame */}
                <div className="w-[280px] sm:w-[300px] lg:w-[360px] lg:h-[90vh] lg:max-h-[850px] bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl shadow-black/30 p-3 relative border border-slate-200 dark:border-slate-800 flex flex-col">
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-white dark:bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
                    <div className="w-16 h-4 bg-black rounded-full" />
                  </div>
                  {/* Screen */}
                  <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-[2rem] overflow-hidden flex-1 flex flex-col">
                    {/* Status Bar */}
                    <div className="bg-indigo-600 px-5 pt-8 pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white text-xs font-bold">BookIt</p>
                        <Bell className="w-3.5 h-3.5 text-white/70" />
                      </div>
                      <h3 className="text-white text-sm font-bold">My Bookings</h3>
                      <p className="text-white/60 text-[10px] font-medium">3 upcoming events</p>
                    </div>

                    {/* Booking Cards */}
                    <div className="p-3 flex flex-col gap-2.5 flex-1 overflow-y-auto">
                      {[
                        { title: "Avengers: Endgame", venue: "PVR Cinemas", type: "Movie", color: "bg-blue-500", price: "$12" },
                        { title: "Coldplay Live", venue: "National Stadium", type: "Concert", color: "bg-purple-500", price: "$85" },
                        { title: "Lakers vs Bulls", venue: "Staples Center", type: "Sports", color: "bg-emerald-500", price: "$120" },
                      ].map((booking, i) => (
                        <div key={i} className="bg-white dark:bg-[#1a1a1a] rounded-xl p-3 border border-slate-100 dark:border-white/5 shadow-sm">
                          <div className="flex items-start justify-between mb-1.5">
                            <p className="text-[12px] font-bold text-amber-500 dark:text-amber-400 mb-0.5">{booking.title}</p>
                            <span className={`text-[8px] font-bold text-white px-1.5 py-0.5 rounded ${booking.color}`}>{booking.type}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-slate-400" />
                              <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">{booking.venue}</p>
                            </div>
                            <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{booking.price}</p>
                          </div>
                        </div>
                      ))}

                      {/* Seat selection mini */}
                      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-3 border border-slate-100 dark:border-white/5 shadow-sm">
                        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Your Seats</p>
                        <div className="flex gap-1 justify-center">
                          {[0,1,1,2,0,1,2,2,1,0].map((s, i) => (
                            <div key={i} className={`w-3 h-3 rounded-[2px] ${
                              s === 0 ? 'bg-transparent' :
                              s === 1 ? 'bg-emerald-200 dark:bg-emerald-900/40' :
                              'bg-emerald-500 dark:bg-emerald-500'
                            }`} />
                          ))}
                        </div>
                        <div className="flex gap-1 justify-center mt-1">
                          {[1,2,2,2,1,2,2,2,2,1].map((s, i) => (
                            <div key={i} className={`w-3 h-3 rounded-[2px] ${
                              s === 1 ? 'bg-emerald-200 dark:bg-emerald-900/40' : 'bg-emerald-500 dark:bg-emerald-500'
                            }`} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Nav */}
                    <div className="flex items-center justify-around py-3 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-[#1a1a1a]">
                      <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <Search className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                      <div className="w-8 h-8 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center -mt-4 shadow-lg shadow-black/20">
                        <span className="text-white text-lg font-bold">+</span>
                      </div>
                      <Ticket className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                      <Armchair className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
          </div>
        </section>

        {/* ════ STATS BAR ════ */}
        <section className="relative z-20 max-w-5xl mx-auto px-4 sm:mt-4 sm:px-6 mb-20 sm:mb-28 w-full">
          <motion.div 
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8"
          >
            {[
              { icon: Film, value: "1,240+", label: "Movies Listed" },
              { icon: Music, value: "300+", label: "Live Concerts" },
              { icon: Gamepad2, value: "150+", label: "Sporting Events" },
              { icon: Ticket, value: "2.5M", label: "Tickets Booked" },
            ].map(({ icon: Icon, value, label }, i) => (
              <div key={i} className="flex flex-col items-center text-center p-5 sm:p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--border)] shadow-sm">
                <Icon className="w-5 h-5 text-[var(--accent)] mb-3" />
                <span className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] font-display">{value}</span>
                <span className="text-[10px] sm:text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mt-1">{label}</span>
              </div>
            ))}
          </motion.div>
        </section>

        {/* ════ HOW IT WORKS ════ */}
        <section className="relative z-20 w-full max-w-5xl mx-auto px-4 sm:px-6 mb-20 sm:mb-28">
          <motion.div 
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-black font-display text-[var(--text-primary)] mb-3">How It Works</h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] font-medium max-w-md mx-auto">Three simple steps from discovery to your digital ticket.</p>
            </div>
            
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { step: "01", icon: Search, title: "Discover Events", desc: "Browse movies, concerts, and sports from a single, unified timeline.", color: "bg-blue-500" },
                { step: "02", icon: Armchair, title: "Pick Your Seats", desc: "Interactive venue maps let you choose the exact view you want.", color: "bg-[var(--accent)]" },
                { step: "03", icon: TicketCheck, title: "Book Instantly", desc: "Checkout in seconds and receive your digital ticket immediately.", color: "bg-emerald-500" },
              ].map(({ step, icon: Icon, title, desc, color }, i) => (
                <div key={i} className="relative p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--border)] shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4 block">Step {step}</span>
                  <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-4`}>
                    <Icon className={`w-5 h-5 ${color === 'bg-[var(--accent)]' ? 'text-[#12111a]' : 'text-white'}`} />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">{title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] font-medium leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* ════ CORE FEATURES ════ */}
        <section className="relative z-20 w-full max-w-5xl mx-auto px-4 sm:px-6 mb-20 sm:mb-28">
          <motion.div 
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-black font-display text-[var(--text-primary)] mb-3">Built for the Ultimate Fan</h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] font-medium max-w-md mx-auto">Everything you need for the best booking experience.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {[
                { icon: Search, title: "Universal Discovery", desc: "Find trending local events—from indie films to massive stadium tours—on a single clean timeline.", iconBg: "bg-blue-500/10", iconColor: "text-blue-500" },
                { icon: Armchair, title: "Interactive Seat Picker", desc: "Pick your exact spot using rich, VIP-tiered venue layouts so you always get the perfect view.", iconBg: "bg-rose-500/10", iconColor: "text-rose-500" },
                { icon: Zap, title: "Real-Time Slot Locking", desc: "No double-bookings. The moment you tap a seat, it's held exclusively for you while you check out.", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-500" },
                { icon: Shield, title: "Secure Digital Wallet", desc: "Flash your secure digital barcode at the venue. No printing, no hassle, just scan and enter.", iconBg: "bg-violet-500/10", iconColor: "text-violet-500" },
              ].map(({ icon: Icon, title, desc, iconBg, iconColor }, i) => (
                <div key={i} className="flex gap-4 p-5 rounded-2xl bg-[var(--card-bg)] border border-[var(--border)] shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 rounded-xl ${iconBg} flex-shrink-0 flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${iconColor}`} />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">{title}</h4>
                    <p className="text-sm text-[var(--text-secondary)] font-medium leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>



        {/* ════ DARK DASHBOARD SHOWCASE ════ */}
        <section className="w-full relative z-20 overflow-hidden">
          <div className="relative w-full min-h-[550px] sm:min-h-[600px]">
            {/* Dark background */}
            <Image 
              src="/dark-section-bg.png" 
              alt="" 
              fill 
              className="object-cover" 
              priority={false}
            />
            <div className="absolute inset-0 bg-slate-950/85" />
            
            <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 items-center">
              {/* Left: Desktop Dashboard Mockup */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                className="order-2 lg:order-1"
              >
                <div className="relative">
                  {/* Browser Frame */}
                  <div className="bg-slate-800 rounded-xl shadow-2xl shadow-black/40 overflow-hidden border border-slate-700/50">
                    {/* Browser Chrome */}
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-700/50">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      </div>
                      <div className="flex-1 mx-4">
                        <div className="bg-slate-700 rounded-md px-3 py-1 text-[10px] text-slate-400 font-mono">bookit.live/dashboard</div>
                      </div>
                    </div>
                    
                    {/* Dashboard Content */}
                    <div className="p-4 sm:p-5">
                      {/* Dashboard Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-white text-sm font-bold">Dashboard</h4>
                          <p className="text-slate-400 text-[10px] font-medium">Welcome back, Alex</p>
                        </div>
                        <div className="flex gap-2">
                          <div className="px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-400 text-[9px] font-bold">This Week</div>
                        </div>
                      </div>

                      {/* Stats Row */}
                      <div className="grid grid-cols-3 gap-2.5 mb-4">
                        {[
                          { icon: Ticket, label: "Bookings", value: "24", change: "+12%", color: "text-emerald-400" },
                          { icon: TrendingUp, label: "Revenue", value: "$2.4k", change: "+8%", color: "text-blue-400" },
                          { icon: Users, label: "Visitors", value: "1.2k", change: "+23%", color: "text-purple-400" },
                        ].map(({ icon: Icon, label, value, change, color }, i) => (
                          <div key={i} className="bg-slate-700/40 rounded-lg p-3 border border-slate-700/50">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Icon className={`w-3 h-3 ${color}`} />
                              <span className="text-[9px] text-slate-400 font-medium">{label}</span>
                            </div>
                            <p className="text-white text-base font-bold">{value}</p>
                            <p className={`text-[9px] font-semibold ${color}`}>{change}</p>
                          </div>
                        ))}
                      </div>

                      {/* Recent Bookings Table */}
                      <div className="bg-slate-700/30 rounded-lg border border-slate-700/50 overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-700/50">
                          <p className="text-[10px] text-slate-300 font-bold">Recent Bookings</p>
                        </div>
                        {[
                          { name: "Avengers: Endgame", date: "Jul 25", seats: "A12, A13", status: "Confirmed" },
                          { name: "Coldplay World Tour", date: "Jul 28", seats: "VIP-04", status: "Confirmed" },
                          { name: "Lakers vs Bulls", date: "Aug 2", seats: "S22", status: "Pending" },
                        ].map((row, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-slate-700/30 last:border-b-0">
                            <div className="flex-1">
                              <p className="text-[10px] text-white font-medium">{row.name}</p>
                              <p className="text-[8px] text-slate-400">{row.date}</p>
                            </div>
                            <p className="text-[9px] text-slate-400 font-mono mr-4">{row.seats}</p>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                              row.status === 'Confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>{row.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Right: Copy */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.15 }}
                className="order-1 lg:order-2"
              >
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 text-white/80 text-xs font-semibold tracking-wide mb-6">
                  <Monitor className="w-3.5 h-3.5" />
                  Powerful Dashboard
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white font-display mb-5 leading-tight">
                  Manage everything from one dashboard
                </h2>
                <p className="text-base sm:text-lg text-slate-400 font-medium leading-relaxed mb-8 max-w-lg">
                  Track your bookings, revenue, and audience insights in real time. A clean, unified dashboard designed for event organizers and fans alike.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/dashboard">
                    <button className="px-7 py-3 bg-white text-slate-900 hover:bg-slate-100 font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 text-sm">
                      <BarChart3 className="w-4 h-4" />
                      Open Dashboard
                    </button>
                  </Link>
                  <Link href="/shows">
                    <button className="px-7 py-3 bg-white/10 text-white hover:bg-white/15 font-semibold rounded-xl transition-all border border-white/20 flex items-center gap-2 text-sm">
                      Browse Events
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ════ FOR CREATORS & HOSTS ════ */}
        <section className="w-full relative z-20 py-20 sm:py-24 bg-slate-50 dark:bg-[#0a0a0a] border-y border-[var(--divider)]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-center mb-12">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/15 text-blue-600 dark:text-blue-400 text-xs font-semibold tracking-wide mb-4">
                  For Creators & Hosts
                </span>
                <h2 className="text-2xl sm:text-3xl font-black font-display text-[var(--text-primary)] mb-3">Scale Your Events Globally</h2>
                <p className="text-sm sm:text-base text-[var(--text-secondary)] font-medium max-w-lg mx-auto leading-relaxed">
                  Zero-downtime ticketing, dynamic pricing, and real-time analytics—everything you need to sell out every show.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
                {/* Marketing Card */}
                <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--border)] shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center mb-4">
                    <Star className="w-5 h-5 text-[var(--accent-text)] dark:text-[var(--accent)] fill-[var(--accent-text)] dark:fill-[var(--accent)]" />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Modern Marketing</h3>
                  <p className="text-sm text-[var(--text-secondary)] font-medium leading-relaxed">
                    Built-in SEO, smart recommendations, and automated campaigns to sell out shows faster than ever.
                  </p>
                </div>

                {/* Contact Card */}
                <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--border)] shadow-sm">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Partner With Us</h3>
                  <div className="flex flex-col gap-3">
                    <a href="mailto:creators@bookit.live" className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center border border-[var(--border)] group-hover:border-blue-400 transition-colors">
                        <Mail className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Email</p>
                        <p className="text-sm text-[var(--text-primary)] font-medium group-hover:text-blue-500 transition-colors">creators@bookit.live</p>
                      </div>
                    </a>
                    <a href="tel:+1800266548" className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center border border-[var(--border)] group-hover:border-blue-400 transition-colors">
                        <Phone className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Call</p>
                        <p className="text-sm text-[var(--text-primary)] font-medium group-hover:text-blue-500 transition-colors">1-800-BOOKIT</p>
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <div className="pt-24 pb-12 px-4 sm:px-8 max-w-7xl mx-auto flex flex-col gap-12">
          
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight mb-4">
              Discover <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-yellow-400">Entertainment</span>
            </h1>
            <p className="text-[var(--text-secondary)] text-lg max-w-2xl">
              Book tickets for the latest movies, premium concerts, and exclusive game events.
            </p>
          </motion.div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <div className="text-red-500 bg-red-500/10 p-4 rounded-xl border border-red-500/20">{error}</div>
          ) : (
            <>
              {/* Live Section */}
              {shows.filter(s => s.status === 'nowShowing').length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <Zap className="w-6 h-6 text-red-500" />
                    <h2 className="text-2xl font-bold font-display text-white tracking-tight">Live & Now Showing</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {shows.filter(s => s.status === 'nowShowing').slice(0, 4).map((show, idx) => (
                      <ShowCard key={typeof show.id === "string" ? show.id : show._id?.$oid} show={show as Show} index={idx} />
                    ))}
                  </div>
                </section>
              )}

              {/* Movies Section */}
              {shows.filter(s => s.show_type === 'Movie').length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <Film className="w-6 h-6 text-indigo-400" />
                    <h2 className="text-2xl font-bold font-display text-white tracking-tight">Trending Movies</h2>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {shows.filter(s => s.show_type === 'Movie').slice(0, 8).map((show, idx) => (
                      <ShowCard key={typeof show.id === "string" ? show.id : show._id?.$oid} show={show as Show} index={idx} />
                    ))}
                  </div>
                </section>
              )}

              {/* Concerts & Events Section */}
              {shows.filter(s => s.show_type === 'Concert' || s.show_type === 'Event').length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <Music className="w-6 h-6 text-pink-400" />
                    <h2 className="text-2xl font-bold font-display text-white tracking-tight">Live Concerts & Events</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {shows.filter(s => s.show_type === 'Concert' || s.show_type === 'Event').slice(0, 6).map((show, idx) => (
                      <ShowCard key={typeof show.id === "string" ? show.id : show._id?.$oid} show={show as Show} index={idx} />
                    ))}
                  </div>
                </section>
              )}

              {/* Sports & Games Section */}
              {shows.filter(s => s.show_type === 'GameEvent').length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <Gamepad2 className="w-6 h-6 text-green-400" />
                    <h2 className="text-2xl font-bold font-display text-white tracking-tight">Sports & Game Events</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {shows.filter(s => s.show_type === 'GameEvent').slice(0, 4).map((show, idx) => (
                      <ShowCard key={typeof show.id === "string" ? show.id : show._id?.$oid} show={show as Show} index={idx} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

      </main>

      {/* ════ FOOTER ════ */}
      <footer className="border-t border-[var(--divider)] bg-[var(--bg)] py-8 relative z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <Ticket className="w-3.5 h-3.5 text-[#12111a]" />
            </div>
            <span className="text-base font-bold tracking-tight font-display text-[var(--text-primary)]">BookIt</span>
          </div>
          <p className="text-[var(--text-muted)] text-xs font-medium">
            &copy; 2026 BookIt Ticketing. All rights reserved.
          </p>
          <div className="flex gap-5 text-xs font-semibold text-[var(--text-secondary)]">
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Terms</a>
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
