"use client";

export function SeatLegend() {
  const items = [
    { color: "var(--seat-owned-bg, #10B981)", border: "1px solid var(--seat-owned-border, #059669)", label: "Booked / Locked by You" },
    { color: "#334155", border: "1px solid #475569", opacity: 0.7, label: "Booked by Other (Not Selectable)" },
    { color: "var(--seat-held-bg, #FEF08A)", border: "1.5px solid var(--seat-held-border, #EAB308)", label: "Processing Lock (5 Min Hold)" },
    { color: "var(--seat-picked-bg, linear-gradient(135deg, #8B5CF6, #6D28D9))", border: "1px solid var(--seat-picked-border, #7C3AED)", label: "Your Selection" },
  ];

  return (
    <div
      className="flex flex-col items-center gap-3 mt-8 pt-6 w-full"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
        Seat Color Meanings
      </span>
      <div className="flex items-center gap-5 flex-wrap justify-center">
        {items.map(({ color, border, opacity, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="rounded-t-md"
              style={{ width: 20, height: 18, background: color, border, opacity }}
            />
            <span className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="seat seat-available" style={{ width: 20, height: 18 }} />
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Available</span>
        </div>
      </div>
    </div>
  );
}
