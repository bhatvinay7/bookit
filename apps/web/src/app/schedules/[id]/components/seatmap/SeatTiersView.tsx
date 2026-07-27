"use client";

import React from "react";
import type { SeatTier, SeatToggleStatus } from "./types";
import { SeatButton } from "./SeatButton";

interface SeatTiersViewProps {
  seatTiers: SeatTier[];
  picked: number[];
  onToggleSeat: (id: number, status: SeatToggleStatus) => void;
}

export function SeatTiersView({ seatTiers, picked, onToggleSeat }: SeatTiersViewProps) {
  return (
    <>
      {seatTiers.map((tier) => (
        <div key={tier.name} className="flex flex-col w-full">
          {/* Zone Header */}
          <div
            className="flex items-center gap-2 mb-3 py-1.5 px-3 rounded-lg w-fit mx-auto"
            style={{ background: `${tier.color}15` }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: tier.color }}
            >
              {tier.name}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 items-center">
            {tier.rows.map((row) => (
              <div
                key={row.row}
                className="flex items-center gap-2 mb-1 justify-center"
              >
                <span className="text-[11px] font-bold text-slate-400 w-6 text-center flex-shrink-0">
                  {row.row}
                </span>

                <div className="flex gap-1.5 flex-wrap">
                  {row.seats.map((seat) => (
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      tier={tier}
                      picked={picked}
                      onToggleSeat={onToggleSeat}
                    />
                  ))}
                </div>

                <span className="text-[11px] font-bold text-slate-400 w-6 text-center flex-shrink-0">
                  {row.row}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
