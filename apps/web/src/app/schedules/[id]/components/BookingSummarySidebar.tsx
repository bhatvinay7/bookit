"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface SummarySeat {
  id: number;
  label: string;
  price: number;
  classType: string;
}

interface BookingSummarySidebarProps {
  summarySeats: SummarySeat[];
  totalPrice: number;
  pickedCount: number;
  isLocking: boolean;
  hasLockedSeats: boolean;
  onCheckout: () => void;
  onProceed: () => void;
  onRemoveSeat: (id: number) => void;
}

export function BookingSummarySidebar({
  summarySeats,
  totalPrice,
  pickedCount,
  isLocking,
  hasLockedSeats,
  onCheckout,
  onProceed,
  onRemoveSeat,
}: BookingSummarySidebarProps) {
  return (
    <div className="w-full lg:w-[360px] shrink-0 flex flex-col gap-6">
      <div className="glass card-shadow rounded-3xl p-6 flex flex-col max-h-[80vh] sticky top-8">
        <h2 className="text-xl font-black font-display text-[var(--text-primary)] tracking-tight mb-1">
          Booking Summary
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-6 font-medium">
          Select your preferred seats
        </p>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-[200px]">
          <AnimatePresence>
            {summarySeats.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full text-center py-10"
              >
                <div className="text-4xl mb-4 opacity-50">🪑</div>
                <p className="font-medium text-sm text-[var(--text-secondary)]">
                  Click seats on the map to select them
                </p>
              </motion.div>
            ) : (
              <div className="flex flex-col gap-3">
                {summarySeats.map((s) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, height: 0, marginTop: 0 }}
                    className="flex items-center justify-between p-3.5 bg-white/40 dark:bg-black/20 border border-[var(--border)] rounded-xl"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-[var(--text-primary)]">
                        {s.label}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                        {s.classType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        ₹{s.price.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveSeat(s.id)}
                        className="rounded-full border border-rose-300/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        Remove
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Total & CTA */}
        <div className="pt-6 mt-4 border-t border-[var(--border)] flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[var(--text-secondary)]">
              Total Amount
            </span>
            <span className="text-2xl font-black text-[var(--text-primary)]">
              ₹{totalPrice.toFixed(2)}
            </span>
          </div>

          {hasLockedSeats && (
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              Your seats are locked. Review or remove any you do not want before checkout.
            </p>
          )}

          <button
            onClick={hasLockedSeats ? onProceed : onCheckout}
            disabled={(pickedCount === 0 && !hasLockedSeats) || isLocking}
            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all shadow-md ${
              pickedCount > 0 || hasLockedSeats
                ? "btn-primary"
                : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed border-none shadow-none"
            }`}
          >
            {isLocking ? "Locking..." : hasLockedSeats ? "Proceed to Checkout" : "Secure Tickets"}
          </button>
        </div>
      </div>
    </div>
  );
}
