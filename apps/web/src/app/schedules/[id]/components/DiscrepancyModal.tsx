"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DiscrepancyModalProps {
  isOpen: boolean;
  failedCount: number;
  lockedSeatsCount: number;
  onClose: () => void;
  onProceed: () => void;
}

export function DiscrepancyModal({
  isOpen,
  failedCount,
  lockedSeatsCount,
  onClose,
  onProceed,
}: DiscrepancyModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800"
          >
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-500/20 rounded-full mx-auto flex items-center justify-center mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h3 className="text-xl font-bold text-center mb-2">
              Some Seats Unavailable
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-center text-sm mb-6">
              Unfortunately, {failedCount} of your selected seats were just
              booked by someone else. You were able to secure {lockedSeatsCount}{" "}
              seats.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:opacity-90"
              >
                Cancel
              </button>
              <button
                onClick={onProceed}
                disabled={lockedSeatsCount === 0}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50"
              >
                Proceed with {lockedSeatsCount}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
