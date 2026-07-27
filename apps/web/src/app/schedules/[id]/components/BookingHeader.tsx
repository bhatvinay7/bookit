"use client";

import Link from "next/link";
import React from "react";

interface BookingHeaderProps {
  title?: string;
  date: Date;
  venueName?: string;
}

export function BookingHeader({ title, date, venueName }: BookingHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <Link href="/dashboard" className="flex-shrink-0">
        <button
          className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] transition-colors"
          style={{
            background: "rgba(124,58,237,0.06)",
            border: "1px solid rgba(124,58,237,0.12)",
            borderRadius: 10,
            padding: "8px 14px",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </button>
      </Link>
      <div>
        <h1 className="font-display font-bold text-[var(--text-primary)] text-2xl" style={{ fontFamily: "Outfit, sans-serif" }}>
          Select Your Seats
        </h1>
        <p className="text-[var(--text-secondary)] text-sm font-medium mt-1">
          {title || "Show"} <span className="mx-2 opacity-50">•</span> {date.toLocaleDateString()}{" "}
          {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
          <span className="mx-2 opacity-50">•</span> {venueName || "Main Venue"}
        </p>
      </div>
    </div>
  );
}
