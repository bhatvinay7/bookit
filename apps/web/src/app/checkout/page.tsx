"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CreditCard, Clock, Calendar, MapPin, Ticket, Check } from "lucide-react";
import Link from "next/link";
import type { ScheduleV2, ScheduleSeat } from "@/types/schedule";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";

import Script from "next/script";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutPageFallback />}>
      <CheckoutPageContent />
    </Suspense>
  );
}

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scheduleIdStr = searchParams.get("scheduleId");
  const seatsStr = searchParams.get("seats");
  
  const scheduleId = scheduleIdStr ? parseInt(scheduleIdStr, 10) : null;
  const seatIds = seatsStr ? seatsStr.split(',').map(s => parseInt(s, 10)) : [];

  const { theme } = useTheme();
  const dark = theme === "dark";

  const [schedule, setSchedule] = useState<ScheduleV2 | null>(null);
  const [lockedSeats, setLockedSeats] = useState<ScheduleSeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  
  // 5 Minute countdown
  const [timeLeft, setTimeLeft] = useState(300);

  useEffect(() => {
    if (!scheduleId || seatIds.length === 0) {
      setError("Invalid checkout parameters");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [schedRes, seatsRes] = await Promise.all([
          fetch(`${API_URL}/api/user/schedules_v2/${scheduleId}`),
          fetch(`${API_URL}/api/user/schedules_v2/${scheduleId}/seats`)
        ]);

        if (!schedRes.ok) throw new Error("Schedule not found");
        const schedData = await schedRes.json();
        setSchedule(schedData);

        if (!seatsRes.ok) throw new Error("Seats not found");
        const seatsData = await seatsRes.json();
        
        // Filter only the locked seats
        const locked = seatsData.seats.filter((s: ScheduleSeat) => seatIds.includes(s.id));
        if (locked.length !== seatIds.length) {
          throw new Error("Some seats could not be found");
        }
        setLockedSeats(locked);
      } catch (err: unknown) {
        setError((err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scheduleId, seatsStr]);

  // Timer countdown
  useEffect(() => {
    if (loading || error || bookingSuccess) return;
    
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          alert("Session expired. Seats have been unlocked.");
          router.push(`/schedules/${scheduleId}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [loading, error, bookingSuccess, scheduleId, router]);

  const { subTotal, tax, total } = useMemo(() => {
    const sum = lockedSeats.reduce((acc, s) => acc + parseFloat(s.price), 0);
    const taxAmt = sum * 0.18; // 18% GST for India
    return { subTotal: sum, tax: taxAmt, total: sum + taxAmt };
  }, [lockedSeats]);

  const handlePay = async () => {
    const token = localStorage.getItem("user_token");
    if (!token) {
      router.push(`/login?redirect=/checkout?scheduleId=${scheduleId}&seats=${seatsStr}`);
      return;
    }
    setIsPaying(true);

    try {
      if (!(window as any).Razorpay) {
        alert("Razorpay SDK failed to load. Are you online?");
        return;
      }

      const orderRes = await fetch(`${API_URL}/api/user/payments/razorpay-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          schedule_id: scheduleId,
          seat_ids: seatIds,
          amount_paise: Math.round(total * 100) 
        })
      });
      if (!orderRes.ok) {
        if (orderRes.status === 503) {
          throw new Error("Service is currently busy (Circuit Breaker). Please try again in a few moments.");
        }
        let errorMsg = "Failed to initialize payment";
        try {
          const errData = await orderRes.json();
          if (errData.error) errorMsg = errData.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }
      const orderData = await orderRes.json();

      if (orderData.order_id.startsWith("order_mock_")) {
        try {
          const confirmRes = await fetch(`${API_URL}/api/user/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              schedule_id: scheduleId,
              seat_ids: seatIds,
              idempotency_key: `checkout_${scheduleId}_${Date.now()}`,
              razorpay_order_id: orderData.order_id,
              razorpay_payment_id: "pay_mock_payment",
              razorpay_signature: "mock_signature"
            })
          });
          if (!confirmRes.ok) {
            if (confirmRes.status === 503) {
              throw new Error("Service is currently busy (Circuit Breaker). Please try again in a few moments.");
            }
            throw new Error("Failed to confirm mock booking on server");
          }
          
          try {
            const key = `my_booked_seats_${scheduleId}`;
            const prev: number[] = JSON.parse(localStorage.getItem(key) || "[]");
            const next = Array.from(new Set([...prev, ...seatIds]));
            localStorage.setItem(key, JSON.stringify(next));
          } catch (e) {
            console.error(e);
          }
          setBookingSuccess(true);
        } catch (err: any) {
          alert("Mock Booking error: " + err.message);
        }
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_mock", 
        amount: Math.round(total * 100),
        currency: "INR",
        name: "BookIt",
        description: "Ticket Booking",
        order_id: orderData.order_id,
        handler: async function (response: any) {
          try {
            const confirmRes = await fetch(`${API_URL}/api/user/payments`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                schedule_id: scheduleId,
                seat_ids: seatIds,
                idempotency_key: `checkout_${scheduleId}_${Date.now()}`,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            if (!confirmRes.ok) {
              if (confirmRes.status === 503) {
                throw new Error("Service is currently busy (Circuit Breaker). Please try again in a few moments.");
              }
              throw new Error("Failed to confirm booking on server");
            }
            
            try {
              const key = `my_booked_seats_${scheduleId}`;
              const prev: number[] = JSON.parse(localStorage.getItem(key) || "[]");
              const next = Array.from(new Set([...prev, ...seatIds]));
              localStorage.setItem(key, JSON.stringify(next));
            } catch (e) {
              console.error(e);
            }
            setIsPaying(false);
            setBookingSuccess(true);
          } catch (err: any) {
            setIsPaying(false);
            alert("Booking error: " + err.message);
          }
        },
        theme: {
          color: "#10B981"
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        setIsPaying(false);
        alert("Payment Failed: " + response.error.description);
      });
      rzp.open();
    } catch (err: unknown) {
      setIsPaying(false);
      alert("Payment error: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-12 h-12 rounded-full border-4 border-[#0f172a] border-t-[var(--accent)] animate-spin" />
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">{error}</h1>
          <button onClick={() => router.back()} className="px-6 py-2 bg-slate-800 rounded-xl text-white">Go Back</button>
        </div>
      </div>
    );
  }

  const show = schedule.show;
  const date = new Date(schedule.start_time);

  if (bookingSuccess) {
    // Simulated e-Ticket
    const qrString = `BOOKIT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
    
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-6 text-slate-900 dark:text-white"
        style={{ background: dark ? 'var(--bg)' : 'linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)' }}
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white dark:bg-[rgba(15,23,42,0.8)] backdrop-blur-xl p-8 rounded-3xl border border-slate-200 dark:border-slate-700 text-center shadow-2xl relative overflow-hidden"
        >
          {/* Ticket styling top edge */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-emerald-500 flex justify-between px-4">
          </div>

          <div className="w-20 h-20 bg-emerald-500/20 rounded-full mx-auto flex items-center justify-center mt-6 mb-4">
            <Check className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-3xl font-black font-display mb-1 text-slate-900 dark:text-white">Payment Successful!</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium text-sm">Your e-ticket is ready.</p>
          
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 text-left mb-6 relative">
            <h3 className="font-bold text-lg mb-1">{show?.title}</h3>
            <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400 mb-4">
              <span className="flex items-center gap-1"><Calendar size={12}/> {date.toLocaleDateString()}</span>
              <span className="flex items-center gap-1"><Clock size={12}/> {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
              <MapPin size={14} className="text-emerald-500"/>
              {schedule.venue_name}
            </div>
            
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1">Seats</p>
                <p className="text-sm font-bold">{lockedSeats.map(s => `${s.row_letter}${s.seat_number}`).join(', ')}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1">Total Paid</p>
                <p className="text-sm font-bold text-emerald-500">₹{total.toFixed(2)}</p>
              </div>
            </div>

            {/* QR Code Simulation */}
            <div className="mt-4 p-4 bg-white rounded-xl flex flex-col items-center border border-slate-200">
              <div className="w-32 h-32 bg-[url('https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=example')] bg-cover opacity-80" />
              <p className="text-[10px] text-slate-500 font-mono mt-2 tracking-widest">{qrString}</p>
            </div>
          </div>
          
          <Link href="/dashboard">
            <button className="w-full py-4 bg-[var(--text-primary)] text-[var(--bg)] font-bold rounded-2xl hover:opacity-90 transition-all">
              Return to Dashboard
            </button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen w-full text-[var(--text-primary)] font-sans relative"
      style={{ background: dark ? 'var(--bg)' : 'linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)' }}
    >
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className="fixed inset-0 pointer-events-none z-0 bg-grid-pattern opacity-5" />
      
      <div className="relative z-10 px-6 py-8 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href={`/schedules/${scheduleId}`} className="flex-shrink-0">
            <button className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)]">
              <ArrowLeft size={16} /> Back to Seat Map
            </button>
          </Link>
          <div className="flex items-center gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-500 px-4 py-2 rounded-full font-mono font-bold text-sm">
            <Clock size={16} />
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Prominent 5-Minute Lock Countdown Banner */}
        <div className="w-full mb-8 bg-gray-200 border-2 border-gray-300 text-black dark:bg-gray-800 dark:border-gray-700 dark:text-white p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔒</span>
            <div>
              <p className="font-bold text-sm md:text-base">
                Lock applied! You have {formatTime(timeLeft)} left to perform the payment else your seat will be released.
              </p>
              <p className="text-xs opacity-80 mt-0.5">
                Seats are temporarily reserved for you during checkout.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-gray-300 text-black dark:bg-gray-700 dark:text-white font-mono font-black text-sm px-3.5 py-1.5 rounded-xl shadow-inner">
            <Clock size={16} />
            {formatTime(timeLeft)}
          </div>
        </div>

        <div className="flex gap-8 flex-wrap lg:flex-nowrap items-start">
          
          {/* Order Details */}
          <div className="flex-1 w-full flex flex-col gap-6">
            <div>
              <h1 className="font-display font-black text-4xl mb-2">Checkout</h1>
              <p className="text-[var(--text-secondary)] font-medium">Complete your payment to secure your seats.</p>
            </div>

            <div className="glass rounded-3xl p-6 border border-[var(--border)]">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-20 h-28 bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden shadow-md">
                  {show?.poster_url ? (
                    <img src={show.poster_url} alt={show.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold opacity-20">
                      {show?.title.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-1">{show?.title}</h2>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-1">
                    <Calendar size={14} /> {date.toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-1">
                    <Clock size={14} /> {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <MapPin size={14} /> {schedule.venue_name}
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--border)] pt-6">
                <h3 className="font-bold mb-4 flex items-center gap-2"><Ticket size={18} className="text-indigo-500"/> Selected Seats</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {lockedSeats.map(s => (
                    <div key={s.id} className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-[var(--border)] flex flex-col text-slate-900 dark:text-white">
                      <span className="font-bold">{s.row_letter}{s.seat_number}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-widest">{s.seat_class}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="w-full lg:w-[400px] shrink-0">
            <div className="glass rounded-3xl p-6 border border-[var(--border)] sticky top-8">
              <h3 className="font-bold text-lg mb-6">Payment Summary</h3>
              
              <div className="flex flex-col gap-4 text-sm font-medium mb-6">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Subtotal ({lockedSeats.length} seats)</span>
                  <span className="text-[var(--text-primary)]">₹{subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Convenience Fee (GST 18%)</span>
                  <span className="text-[var(--text-primary)]">₹{tax.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="flex justify-between items-end border-t border-[var(--border)] pt-4 mb-8">
                <span className="font-bold">Total Pay</span>
                <span className="text-3xl font-black text-emerald-500">₹{total.toFixed(2)}</span>
              </div>

              <button
                onClick={handlePay}
                disabled={isPaying}
                className="w-full py-4 bg-[var(--text-primary)] text-[var(--bg)] font-bold rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg hover:-translate-y-1 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {isPaying ? (
                  <div className="w-5 h-5 border-2 border-[var(--bg)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CreditCard size={18} />
                )}
                {isPaying ? "Processing..." : `Pay ₹${total.toFixed(2)}`}
              </button>
              
              <p className="text-center text-[10px] text-[var(--text-muted)] mt-4 flex items-center justify-center gap-1">
                <Lock size={10} /> Secure encrypted payment
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function Lock({ size = 24, ...props }: { size?: number | string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
  );
}

function CheckoutPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-12 h-12 rounded-full border-4 border-[#0f172a] border-t-[var(--accent)] animate-spin" />
    </div>
  );
}
