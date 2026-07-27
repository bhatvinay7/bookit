"use client";

import React from "react";
import { ZoomToolbar } from "./seatmap/ZoomToolbar";
import { SeatTiersView } from "./seatmap/SeatTiersView";
import { MagnifyingLens } from "./seatmap/MagnifyingLens";
import { SeatLegend } from "./seatmap/SeatLegend";

// Re-export types so the rest of the app still imports from one place
export type { SeatItem, SeatRow, SeatTier } from "./seatmap/types";

import type { SeatTier, SeatToggleStatus } from "./seatmap/types";

interface SeatMapProps {
  showType: string;
  seatTiers: SeatTier[];
  picked: number[];
  onToggleSeat: (id: number, status: SeatToggleStatus) => void;
}

export function SeatMap({ showType, seatTiers, picked, onToggleSeat }: SeatMapProps) {
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [lensEnabled, setLensEnabled] = React.useState(false);
  const [contentOffset, setContentOffset] = React.useState({ x: 0, y: 0, canvasWidth: 0 });

  const containerRef = React.useRef<HTMLDivElement>(null);
  const seatCanvasRef = React.useRef<HTMLDivElement>(null);

  // Measure ONCE after the seat canvas mounts — never re-run on drag
  React.useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const canvas = seatCanvasRef.current;
      if (!container || !canvas) return;
      const cRect = container.getBoundingClientRect();
      const sRect = canvas.getBoundingClientRect();
      setContentOffset({
        x: sRect.left - cRect.left,
        y: sRect.top - cRect.top,
        canvasWidth: sRect.width,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []); // empty deps → fires once after initial mount

  const dragState = React.useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const handleZoomIn = () => setZoom((z) => Math.min(2.0, +(z + 0.2).toFixed(1)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.deltaY > 0 ? handleZoomOut() : handleZoomIn();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    dragState.current = { active: true, startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    setPan({
      x: dragState.current.originX + (e.clientX - dragState.current.startX),
      y: dragState.current.originY + (e.clientY - dragState.current.startY),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex-1 min-w-0 w-full">
      <div ref={containerRef} className="glass card-shadow rounded-3xl p-6 overflow-x-auto relative">

        {/* Movable Zoom Toolbar */}
        <ZoomToolbar
          zoom={zoom}
          lensEnabled={lensEnabled}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          onToggleLens={() => setLensEnabled((v) => !v)}
        />

        {/* Spacer under toolbar */}
        <div className="h-10 mb-2" />

        {/* Screen / Stage arc */}
        <div className="w-full mb-10 flex flex-col items-center">
          <div
            className="w-full max-w-sm h-3 rounded-t-full"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.5), transparent)",
              boxShadow: "0 -10px 30px rgba(124,58,237,0.4)",
              border: "1.5px solid rgba(124,58,237,0.2)",
              borderBottom: "none",
            }}
          />
          <span className="text-[var(--text-secondary)] text-[11px] font-bold tracking-widest uppercase mt-3">
            {showType === "Movie" ? "SCREEN" : "STAGE"}
          </span>
        </div>

        {/* Pan/zoom hint */}
        <div className="flex items-center justify-center mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          Drag to pan • Scroll to zoom • 🔎 Lens for magnifier
        </div>

        {/* Zoomable / Pannable seat canvas */}
        <div
          className="flex flex-col gap-6 w-full mb-6 min-w-max mx-auto items-center cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "top center",
            transition: zoom === 1 && pan.x === 0 && pan.y === 0 ? "transform 0.2s ease-in-out" : "none",
          }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div ref={seatCanvasRef} className="flex flex-col gap-6 items-center w-full">
            <SeatTiersView
              seatTiers={seatTiers}
              picked={picked}
              onToggleSeat={onToggleSeat}
            />
          </div>
        </div>

        {/* Draggable Magnifying Lens Overlay */}
        {lensEnabled && (
          <MagnifyingLens
            seatTiers={seatTiers}
            picked={picked}
            onToggleSeat={onToggleSeat}
            contentOffset={contentOffset}
          />
        )}

        {/* Legend */}
        <SeatLegend />
      </div>
    </div>
  );
}
