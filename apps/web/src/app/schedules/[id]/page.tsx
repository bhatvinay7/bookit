"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useSeatLocking } from "@/hooks/useSeatLocking";
import { useSocket } from "@/components/SocketProvider";
import Link from "next/link";
import type { ScheduleV2, ScheduleSeat } from "@/types/schedule";

interface SeatLockSnapshot {
  id: number;
  status: string;
  locked_by_user_id?: number | null;
}
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";

import { BookingHeader } from "./components/BookingHeader";
import { SeatMap, type SeatTier } from "./components/SeatMap";
import { BookingSummarySidebar } from "./components/BookingSummarySidebar";
import { DiscrepancyModal } from "./components/DiscrepancyModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function BookingWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const scheduleId = parseInt(params.id as string, 10);
  const { theme } = useTheme();
  const dark = theme === "dark";

  const [schedule, setSchedule] = useState<ScheduleV2 | null>(null);
  const [seats, setSeats] = useState<ScheduleSeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [picked, setPicked] = useState<number[]>([]);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [myBookingIds, setMyBookingIds] = useState<number[]>([]);
  const [isRouting, setIsRouting] = useState(false);
  const [successToast, setSuccessToast] = useState(false);

  const { wsUserId } = useSocket();

  const {
    lockedSeatIds,
    setLockedSeatIds,
    isLocking,
    myLockedSeats,
    setMyLockedSeats,
    failedSeats,
    showDiscrepancyModal,
    requestLock,
    requestUnlock,
    closeDiscrepancyModal,
    bookedSeatIds,
    externallyLockedSeats,
    clearExternallyLockedSeat,
  } = useSeatLocking(scheduleId ?? 0, seats, () => {
    setSuccessToast(true);
    setTimeout(() => setSuccessToast(false), 3000);
  });

  const syncedLocksRef = useRef(new Set<number>());

  // Inline toast state for seat-unavailable notifications
  const [seatToasts, setSeatToasts] = useState<{ id: number; seatLabel: string }[]>([]);
  const seatLabelMap = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    async function load() {
      try {
        let uid: number | null = null;
        try {
          const token = localStorage.getItem("user_token");
          if (token) {
            if (token === "mock_token") {
              uid = 1;
            } else {
              const parts = token.split(".");
              if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                uid = payload.sub ? Number(payload.sub) : null;
              }
            }
          }
        } catch {}

        const calls: Promise<Response>[] = [
          fetch(`${API_URL}/api/user/schedules_v2/${scheduleId}`),
          fetch(`${API_URL}/api/user/schedules_v2/${scheduleId}/seats`),
        ];

        if (uid) {
          calls.push(fetch(`${API_URL}/api/user/${uid}/tickets`));
        }

        const [schedRes, seatsRes, ticketsRes] = await Promise.all(calls);

        if (!schedRes.ok) throw new Error("Schedule not found");
        const schedData = await schedRes.json();
        setSchedule(schedData);

        if (!seatsRes.ok) throw new Error("Seats not found");
        const seatsData = await seatsRes.json();
        const initialSeats = seatsData.seats as ScheduleSeat[];
        setSeats(initialSeats);

        if (ticketsRes && ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setMyBookingIds(ticketsData.map((t: any) => t.booking_id));
        }

        // Build a label map (e.g. "A3") so toasts can show human-readable seat names
        initialSeats.forEach((s: ScheduleSeat) => {
          seatLabelMap.current.set(s.id, `${s.row_letter}${s.seat_number}`);
        });

        // Restore locked-seat state from the websocket-backed schedule payload after refresh
        try {
          if (uid) {
            const token = localStorage.getItem("user_token");
            if (token) {
              const lockedSeatIdsFromServer = initialSeats
                .filter((seat: SeatLockSnapshot) => seat.status === "Locked")
                .map((seat: SeatLockSnapshot) => seat.id);

              const myActiveLocks = initialSeats
                .filter(
                  (seat: SeatLockSnapshot) =>
                    seat.status === "Locked" &&
                    seat.locked_by_user_id != null &&
                    Number(seat.locked_by_user_id) === uid
                )
                .map((seat: SeatLockSnapshot) => seat.id);

              if (lockedSeatIdsFromServer.length > 0) {
                setLockedSeatIds(lockedSeatIdsFromServer);
              }

              if (myActiveLocks.length > 0) {
                setMyLockedSeats(myActiveLocks);
                setPicked((prev) => Array.from(new Set([...prev, ...myActiveLocks])));
              } else {
                setMyLockedSeats([]);
              }
            }
          }
        } catch (e) {
          // ignore
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? (err instanceof Error ? err.message : String(err)) : "Unexpected error";
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scheduleId]);

  // When another user locks a seat we had selected, show a toast and deselect it
  useEffect(() => {
    if (externallyLockedSeats.length === 0) return;

    externallyLockedSeats.forEach(seatId => {
      const isPicked = picked.includes(seatId);
      if (isPicked) {
        // Remove from picked
        setPicked(prev => prev.filter(id => id !== seatId));
        // Show toast notification
        const label = seatLabelMap.current.get(seatId) ?? `#${seatId}`;
        const toastId = Date.now() + seatId;
        setSeatToasts(prev => [...prev, { id: toastId, seatLabel: label }]);
        setTimeout(() => {
          setSeatToasts(prev => prev.filter(t => t.id !== toastId));
        }, 4000);
      }
      clearExternallyLockedSeat(seatId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externallyLockedSeats]);



  const seatRows = useMemo(() => {
    const rows = new Map<string, ScheduleSeat[]>();
    for (const s of seats) {
      if (!rows.has(s.row_letter)) rows.set(s.row_letter, []);
      rows.get(s.row_letter)!.push(s);
    }
    const sortedRowLetters = Array.from(rows.keys()).sort();
    return sortedRowLetters.map((row) => ({
      row,
      classType: rows.get(row)![0].seat_class,
      seats: rows
        .get(row)!
        .sort((a, b) => a.seat_number - b.seat_number)
        .map((s) => {
          const computedStatus: "available" | "booked" | "locked" | "my_booked" | "my_locked" =
            (s.status === "Booked" && s.booking_id != null && myBookingIds.includes(s.booking_id))
              ? "my_booked"
              : myLockedSeats.includes(s.id) ||
                (s.status === "Locked" &&
                  s.locked_by_user_id != null &&
                  wsUserId != null &&
                  Number(s.locked_by_user_id) === wsUserId)
              ? "my_locked"
              : s.status === "Booked" || bookedSeatIds.includes(s.id)
              ? "booked"
              : lockedSeatIds.includes(s.id) || s.status === "Locked" || (isLocking && picked.includes(s.id))
              ? "locked"
              : "available";

          return {
            id: s.id,
            label: `${s.row_letter}${s.seat_number}`,
            col: s.seat_number.toString(),
            status: computedStatus,
            price: parseFloat(s.price),
            seat: s,
          };
        }),
    }));
  }, [seats, lockedSeatIds, bookedSeatIds, myBookingIds, myLockedSeats, isLocking, picked, wsUserId]);

  const seatTiers: SeatTier[] = useMemo(() => {
    const tiers = new Map<string, typeof seatRows>();
    for (const row of seatRows) {
      if (!tiers.has(row.classType)) tiers.set(row.classType, []);
      tiers.get(row.classType)!.push(row);
    }

    const ordered: SeatTier[] = [];
    if (tiers.has("VIP"))
      ordered.push({
        name: "VIP Lounge",
        id: "VIP",
        rows: tiers.get("VIP")!,
        color: "#eab308",
      });
    if (tiers.has("Premium"))
      ordered.push({
        name: "Premium Seating",
        id: "Premium",
        rows: tiers.get("Premium")!,
        color: "#0ea5e9",
      });
    if (tiers.has("Standard"))
      ordered.push({
        name: "Standard Seating",
        id: "Standard",
        rows: tiers.get("Standard")!,
        color: "#6366f1",
      });

    for (const [name, rows] of tiers.entries()) {
      if (!["VIP", "Premium", "Standard"].includes(name)) {
        ordered.push({
          name: `${name} Seating`,
          id: name,
          rows,
          color: "#94a3b8",
        });
      }
    }
    return ordered;
  }, [seatRows]);

  const toggleSeat = (
    id: number,
    status: "available" | "booked" | "locked" | "my_booked" | "my_locked"
  ) => {
    if (status === "booked" || (status === "locked" && !myLockedSeats.includes(id))) return;
    if (myLockedSeats.includes(id) || status === "my_locked") {
      requestUnlock([id]);
      setPicked((p) => p.filter((s) => s !== id));
      return;
    }
    setPicked((p) => {
      if (p.includes(id)) return p.filter((s) => s !== id);
      return [...p, id];
    });
  };

  const handleRemoveSeat = (id: number) => {
    if (myLockedSeats.includes(id)) {
      requestUnlock([id]);
    }
    setPicked((p) => p.filter((seatId) => seatId !== id));
  };

  const handleProceedToCheckout = () => {
    const newPicked = picked.filter((id) => !myLockedSeats.includes(id));
    
    if (newPicked.length > 0) {
      const token = localStorage.getItem("user_token");
      if (!token) {
        setIsRouting(true);
        router.push(`/login?redirect=/schedules/${scheduleId}`);
        return;
      }
      requestLock(newPicked);
      return;
    }

    if (myLockedSeats.length > 0) {
      setIsRouting(true);
      router.push(
        `/checkout?scheduleId=${scheduleId}&seats=${myLockedSeats.join(",")}`
      );
    }
  };

  useEffect(() => {
    if (myLockedSeats.length > 0) {
      const newLocks = myLockedSeats.filter(id => !syncedLocksRef.current.has(id));
      if (newLocks.length > 0) {
        newLocks.forEach(id => syncedLocksRef.current.add(id));
        setPicked((prev) => Array.from(new Set([...prev, ...newLocks])));
      }
    }
  }, [myLockedSeats]);

  const { totalPrice, summarySeats } = useMemo(() => {
    let sum = 0;
    const selected: Array<{
      id: number;
      label: string;
      price: number;
      classType: string;
    }> = [];
    seatRows.forEach((r) =>
      r.seats.forEach((s) => {
        if (picked.includes(s.id) || myLockedSeats.includes(s.id)) {
          sum += s.price;
          selected.push({
            id: s.id,
            label: s.label,
            price: s.price,
            classType: r.classType,
          });
        }
      })
    );
    return { totalPrice: sum, summarySeats: selected };
  }, [myLockedSeats, seatRows]);

  const handleCheckout = () => {
    const newPicked = picked.filter((id) => !myLockedSeats.includes(id));
    if (newPicked.length === 0) return;
    
    const token = localStorage.getItem("user_token");
    if (!token) {
      setIsRouting(true);
      router.push(`/login?redirect=/schedules/${scheduleId}`);
      return;
    }
    requestLock(newPicked);
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: dark
            ? "#020617"
            : "linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)",
        }}
      >
        <div className="w-12 h-12 rounded-full border-4 border-[#0f172a] border-t-[var(--accent)] animate-spin" />
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-white p-6 text-center"
        style={{
          background: dark
            ? "#020617"
            : "linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)",
        }}
      >
        <div>
          <h1 className="text-2xl font-bold text-red-500 mb-4">
            {error || "Schedule not found"}
          </h1>
          <Link href="/dashboard">
            <button className="px-6 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-all text-black dark:text-white">
              Go Back
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const show = schedule.show;
  const date = new Date(schedule.start_time);

  if (bookingSuccess) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6 text-[var(--text-primary)]"
        style={{
          background: dark
            ? "#020617"
            : "linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)",
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full bg-[rgba(15,23,42,0.6)] backdrop-blur-xl p-8 rounded-3xl border border-[var(--border)] text-center shadow-2xl"
        >
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full mx-auto flex items-center justify-center mb-6 border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
            <Check className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-3xl font-black font-display mb-2 text-white">
            Booking Confirmed!
          </h2>
          <p className="text-[var(--text-secondary)] mb-8 font-medium">
            You successfully booked {picked.length}{" "}
            {picked.length > 1 ? "tickets" : "ticket"} for {show?.title}.
          </p>
          <Link href="/dashboard">
            <button className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl hover:opacity-90 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:-translate-y-1">
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
      style={{
        background: dark
          ? "var(--bg)"
          : "linear-gradient(135deg, #f3f4f6 0%, #e0e7ff 50%, #f3e8ff 100%)",
      }}
    >
      <div className="fixed inset-0 pointer-events-none z-0 bg-grid-pattern opacity-5" />

      <div className="relative z-10 px-6 py-8 max-w-[1600px] mx-auto">
        <BookingHeader
          title={show?.title}
          date={date}
          venueName={schedule.venue_name || undefined}
        />

        {(myLockedSeats.length > 0 || isLocking) && (
          <div className="w-full my-6 bg-gray-200 border-2 border-gray-300 text-black dark:bg-gray-800 dark:border-gray-700 dark:text-white p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔒</span>
              <div>
                <p className="font-bold text-sm md:text-base">
                  Lock applied! You have 5 minutes left to perform the payment else your seat will be released.
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  Seats are temporarily reserved for you during checkout.
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-gray-300 text-black dark:bg-gray-700 dark:text-white font-mono font-black text-sm px-3.5 py-1.5 rounded-xl shadow-inner">
              ⏱ 5:00 LEFT
            </div>
          </div>
        )}

        <div className="flex gap-6 flex-wrap lg:flex-nowrap items-start">
          <SeatMap
            showType={schedule.show_type}
            seatTiers={seatTiers}
            picked={picked}
            onToggleSeat={toggleSeat}
          />

          <BookingSummarySidebar
            summarySeats={summarySeats}
            totalPrice={totalPrice}
            pickedCount={picked.length}
            unlockedPickedCount={picked.filter(id => !myLockedSeats.includes(id)).length}
            isLocking={isLocking}
            isRouting={isRouting}
            hasLockedSeats={myLockedSeats.length > 0}
            onCheckout={handleCheckout}
            onProceed={handleProceedToCheckout}
            onRemoveSeat={handleRemoveSeat}
          />
        </div>
      </div>

      <DiscrepancyModal
        isOpen={showDiscrepancyModal}
        failedCount={failedSeats.length}
        lockedSeatsCount={myLockedSeats.length}
        onClose={closeDiscrepancyModal}
        onProceed={() => {
          closeDiscrepancyModal();
          if (myLockedSeats.length > 0) {
            router.push(
              `/checkout?scheduleId=${scheduleId}&seats=${myLockedSeats.join(",")}`
            );
          }
        }}
      />

      {/* Seat-unavailable toast notifications */}
      <div style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}>
        <AnimatePresence>
          {seatToasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 40, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              style={{
                pointerEvents: "auto",
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fca5a5",
                padding: "12px 18px",
                borderRadius: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 18 }}>🚫</span>
              Seat <strong>{toast.seatLabel}</strong> is no longer available
            </motion.div>
          ))}
          {successToast && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              style={{
                pointerEvents: "auto",
                background: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #6ee7b7",
                padding: "12px 18px",
                borderRadius: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 18 }}>✅</span>
              Seats successfully locked!
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
