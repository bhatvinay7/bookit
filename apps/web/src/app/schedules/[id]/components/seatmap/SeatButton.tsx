"use client";

import React from "react";
import type { SeatItem, SeatTier, SeatToggleStatus } from "./types";

interface SeatButtonProps {
  seat: SeatItem;
  tier: SeatTier;
  picked: number[];
  onToggleSeat: (id: number, status: SeatToggleStatus) => void;
}

export function SeatButton({ seat, tier, picked, onToggleSeat }: SeatButtonProps) {
  const isPicked = picked.includes(seat.id);
  const isMyBooked = seat.status === "my_booked";
  const isMyLocked = seat.status === "my_locked";
  const isBookedOther = seat.status === "booked";
  const isLocked = seat.status === "locked";

  let seatStyle: React.CSSProperties = {};
  let seatCls = "seat ";
  let disabled = false;

  if (isMyBooked) {
    seatCls += "seat-selected";
    seatStyle = {
      background: "#10B981",
      color: "#ffffff",
      border: "1px solid #059669",
      cursor: "default",
    };
    disabled = true;
  } else if (isMyLocked) {
    seatCls += "seat-selected";
    seatStyle = {
      background: "#10B981",
      color: "#ffffff",
      border: "2px solid #059669",
      cursor: "pointer",
      boxShadow: "0 0 10px rgba(16, 185, 129, 0.4)",
    };
    disabled = false;
  } else if (isBookedOther) {
    seatCls += "seat-taken";
    seatStyle = {
      background: "#334155",
      color: "#94A3B8",
      border: "1px solid #475569",
      opacity: 0.65,
      cursor: "not-allowed",
    };
    disabled = true;
  } else if (isLocked) {
    seatStyle = {
      background: "#FEF08A",
      color: "#854D0E",
      border: "1.5px solid #EAB308",
      cursor: "not-allowed",
      fontWeight: "bold",
    };
    disabled = true;
  } else if (isPicked) {
    seatCls += "seat-selected";
    seatStyle = {
      background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
      color: "#ffffff",
      border: "1px solid #7C3AED",
    };
  } else {
    seatCls += "seat-available";
    if (tier.id === "VIP" || tier.id === "Premium") {
      seatCls += " seat-premium";
    }
  }

  const callbackStatus: SeatToggleStatus =
    seat.status === "my_locked" || seat.status === "locked"
      ? "locked"
      : seat.status === "my_booked" || seat.status === "booked"
      ? "booked"
      : "available";

  return (
    <button
      key={seat.id}
      type="button"
      className={seatCls}
      style={seatStyle}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onToggleSeat(seat.id, callbackStatus);
      }}
      title={
        isMyBooked
          ? "Booked by You"
          : isBookedOther
          ? "Booked by Other (Not Selectable)"
          : isLocked
          ? "Processing Lock / 5 Min Hold"
          : seat.label
      }
    >
      {seat.col}
    </button>
  );
}
