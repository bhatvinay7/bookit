import React from "react";
import type { Show } from "@/types";
import Link from "next/link";
import ShowCard from "@/components/shows/ShowCard";

interface BentoGridSectionProps {
  title: string;
  shows: Show[];
}

export function BentoGridSection({ title, shows }: BentoGridSectionProps) {
  if (shows.length === 0) return null;

  return (
    <section className="mb-8 sm:mb-12">
      <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
        <div>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--accent)] sm:text-xs">
            Curated for you
          </p>
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-2xl font-black tracking-tight text-[var(--text-primary)] sm:text-3xl">
              {title}
            </h2>
            <span className="text-xs font-bold text-[var(--text-muted)]">{shows.length}</span>
          </div>
        </div>
        <Link
          href="/shows"
          className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] sm:px-4 sm:py-2 sm:text-sm"
        >
          View all
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 md:grid-cols-3 lg:grid-cols-4 xl:gap-x-6">
        {shows.map((show, idx) => {
          const key = typeof show.id === "string" ? show.id : show._id?.$oid || `${show.title}-${idx}`;
          return (
            <ShowCard key={key} show={show} index={idx} />
          );
        })}
      </div>
    </section>
  );
}
