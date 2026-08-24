"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Moon, Sun, Sunset } from "lucide-react";
import type { ScheduleV2 } from "@/types/schedule";

export type ScheduleSlot = "All" | ScheduleV2["slot"];
type CalendarView = "week" | "month";

const SLOT_OPTIONS: Array<{ value: ScheduleSlot; label: string; icon?: typeof Sun }> = [
  { value: "All", label: "All shows" },
  { value: "Morning", label: "Morning", icon: Sun },
  { value: "Afternoon", label: "Afternoon", icon: Sunset },
  { value: "Evening", label: "Evening", icon: Sunset },
  { value: "Night", label: "Night", icon: Moon },
];

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function ScheduleCalendar({
  schedules,
  selectedDate,
  selectedSlot,
  onDateChange,
  onSlotChange,
}: {
  schedules: ScheduleV2[];
  selectedDate: string;
  selectedSlot: ScheduleSlot;
  onDateChange: (date: string) => void;
  onSlotChange: (slot: ScheduleSlot) => void;
}) {
  const [view, setView] = useState<CalendarView>("week");
  const [cursorOverride, setCursorOverride] = useState<Date | null>(null);
  const cursor = useMemo(
    () => cursorOverride ?? (selectedDate ? parseISO(selectedDate) : new Date()),
    [cursorOverride, selectedDate],
  );

  const scheduledDates = useMemo(
    () => new Set(schedules.map((schedule) => schedule.date || dateKey(new Date(schedule.start_time)))),
    [schedules],
  );

  const days = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end: endOfWeek(cursor, { weekStartsOn: 1 }) });
    }
    const monthStart = startOfMonth(cursor);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    });
  }, [cursor, view]);

  const move = (direction: -1 | 1) => {
    setCursorOverride(view === "week" ? addDays(cursor, direction * 7) : addMonths(cursor, direction));
  };

  return (
    <div className="mb-8 overflow-hidden rounded-3xl border border-amber-400/25 bg-[var(--card-bg)] shadow-[0_18px_60px_rgba(161,98,7,0.10)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <div>
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-amber-500">
            <CalendarDays className="h-4 w-4" /> Show calendar
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Gold dates have scheduled shows</p>
        </div>
        <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
          {(["week", "month"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setView(mode); setCursorOverride(null); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                view === mode ? "bg-amber-400 text-[#201500] shadow-sm" : "text-[var(--text-secondary)]"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} aria-label={`Previous ${view}`} className="rounded-full border border-[var(--border)] p-2 hover:border-amber-400 hover:text-amber-500">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            {view === "week"
              ? `${format(days[0], "MMM d")} – ${format(days[days.length - 1], "MMM d, yyyy")}`
              : format(cursor, "MMMM yyyy")}
          </p>
          <button type="button" onClick={() => move(1)} aria-label={`Next ${view}`} className="rounded-full border border-[var(--border)] p-2 hover:border-amber-400 hover:text-amber-500">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map((day) => {
            const key = dateKey(day);
            const hasShows = scheduledDates.has(key);
            const active = selectedDate ? isSameDay(day, parseISO(selectedDate)) : false;
            const outsideMonth = view === "month" && day.getMonth() !== cursor.getMonth();
            return (
              <button
                key={key}
                type="button"
                onClick={() => hasShows && onDateChange(active ? "" : key)}
                disabled={!hasShows}
                className={`relative min-h-16 rounded-xl border px-1 py-2 text-center transition sm:min-h-20 ${
                  active
                    ? "border-amber-300 bg-gradient-to-br from-amber-300 to-yellow-500 text-[#211600] shadow-[0_8px_24px_rgba(245,158,11,0.30)]"
                    : hasShows
                      ? "border-amber-400/45 bg-amber-400/10 text-[var(--text-primary)] hover:-translate-y-0.5 hover:border-amber-400"
                      : "border-transparent text-[var(--text-muted)] opacity-45"
                } ${outsideMonth ? "opacity-30" : ""}`}
              >
                <span className="block text-[9px] font-bold uppercase sm:text-[10px]">{format(day, "EEE")}</span>
                <span className="mt-1 block text-base font-black sm:text-lg">{format(day, "d")}</span>
                {hasShows && <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${active ? "bg-[#211600]" : "bg-amber-400"}`} />}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          {SLOT_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onSlotChange(value)}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition ${
                selectedSlot === value
                  ? "border-amber-300 bg-amber-400 text-[#211600] shadow-sm"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-amber-400/60 hover:text-amber-500"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
