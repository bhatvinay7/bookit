"use client";

import React from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import type { SeatTier, SeatToggleStatus } from "./types";
import { SeatTiersView } from "./SeatTiersView";

interface MagnifyingLensProps {
  seatTiers: SeatTier[];
  picked: number[];
  onToggleSeat: (id: number, status: SeatToggleStatus) => void;
  /** Measured once in SeatMap on initial mount */
  contentOffset: { x: number; y: number; canvasWidth: number };
}

const LENS_SIZE = 260;
const HALF = LENS_SIZE / 2;
const MAGNIFICATION = 1.8;

export function MagnifyingLens({
  seatTiers,
  picked,
  onToggleSeat,
  contentOffset,
}: MagnifyingLensProps) {
  const lensX = useMotionValue(40);
  const lensY = useMotionValue(40);

  // Transform: centres the outer-container point (lensX+HALF, lensY+HALF)
  // at the lens centre, at MAGNIFICATION scale.
  //
  // Because the inner wrapper uses the same (x, y, canvasWidth) as the outer
  // canvas, every seat in the inner render sits at EXACTLY the same coordinate
  // as in the outer canvas — so the formula needs no stale-closure adjustment.
  const innerX = useTransform(lensX, (x) => HALF - (x + HALF) * MAGNIFICATION);
  const innerY = useTransform(lensY, (y) => HALF - (y + HALF) * MAGNIFICATION);

  return (
    <motion.div
      drag
      dragMomentum={false}
      style={{
        x: lensX,
        y: lensY,
        width: LENS_SIZE,
        height: LENS_SIZE,
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 40,
        borderRadius: "50%",
        overflow: "hidden",
        border: "2.5px solid rgba(139,92,246,0.7)",
        boxShadow:
          "0 8px 40px rgba(139,92,246,0.3), 0 2px 12px rgba(0,0,0,0.2), inset 0 0 40px rgba(139,92,246,0.06)",
        background: "rgba(15,23,42,0.08)",
        backdropFilter: "blur(0.3px)",
        cursor: "grab",
        touchAction: "none",
      }}
      whileDrag={{ cursor: "grabbing" }}
    >
      {/* Crosshair */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(139,92,246,0.35)" }} />
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(139,92,246,0.35)" }} />
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: 6, height: 6, borderRadius: "50%",
          background: "rgba(139,92,246,0.85)",
        }} />
      </div>

      {/* ── Magnified seat content ───────────────────────────────────────────
          The outer wrapper is padded to (contentOffset.x, contentOffset.y)
          and given the same width as the outer canvas (canvasWidth).
          This makes `items-center` produce the IDENTICAL horizontal centering
          as the real seat map, so x/y coordinates match exactly.
          ─────────────────────────────────────────────────────────────────── */}
      <motion.div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          x: innerX,
          y: innerY,
          scale: MAGNIFICATION,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            paddingTop: contentOffset.y,
            paddingLeft: contentOffset.x,
            // Give the inner wrapper the same rendered width as the outer canvas
            // so `items-center` centres seats identically
            width: contentOffset.canvasWidth || "max-content",
          }}
        >
          <div className="flex flex-col gap-6 items-center">
            <SeatTiersView
              seatTiers={seatTiers}
              picked={picked}
              onToggleSeat={onToggleSeat}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
