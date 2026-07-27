"use client";

import { motion } from "framer-motion";

interface ZoomToolbarProps {
  zoom: number;
  lensEnabled: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleLens: () => void;
}

export function ZoomToolbar({
  zoom,
  lensEnabled,
  onZoomIn,
  onZoomOut,
  onReset,
  onToggleLens,
}: ZoomToolbarProps) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      className="absolute z-50 flex items-center gap-1 bg-white/30 dark:bg-slate-800/50 backdrop-blur-xl px-3 py-1.5 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold text-[var(--text-secondary)] shadow-lg cursor-grab active:cursor-grabbing select-none"
      style={{ top: 20, right: 20 }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Zoom indicator */}
      <div className="mr-1 pointer-events-none flex items-center gap-1 text-[11px]">
        <span>🔍</span>
        <span>{Math.round(zoom * 100)}%</span>
      </div>

      {/* Zoom Out */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onZoomOut}
        className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white flex items-center justify-center font-bold transition"
        title="Zoom Out"
      >
        −
      </button>

      {/* Reset */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onReset}
        className="px-2 h-6 rounded-full bg-black/5 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white flex items-center justify-center text-[10px] uppercase font-bold transition"
        title="Reset Zoom"
      >
        Reset
      </button>

      {/* Zoom In */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onZoomIn}
        className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white flex items-center justify-center font-bold transition"
        title="Zoom In"
      >
        +
      </button>

      {/* Divider */}
      <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-1" />

      {/* Lens toggle */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggleLens}
        title={lensEnabled ? "Hide Magnifier" : "Show Magnifier"}
        className={`px-2 h-6 rounded-full flex items-center gap-1 text-[10px] font-bold uppercase transition ${
          lensEnabled
            ? "bg-purple-500 text-white shadow-[0_0_8px_rgba(139,92,246,0.5)]"
            : "bg-black/5 dark:bg-white/10 hover:bg-purple-500/80 hover:text-white"
        }`}
      >
        🔎 {lensEnabled ? "On" : "Lens"}
      </button>
    </motion.div>
  );
}
