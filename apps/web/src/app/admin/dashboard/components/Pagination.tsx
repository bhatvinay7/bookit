"use client";

import React, { useState, useMemo, useEffect } from "react";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize = 10,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= 0) return null;

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, currentPage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-3.5 px-5 border-t border-[var(--border)] bg-[var(--bg-card)] rounded-b-xl">
      <div className="text-xs text-[var(--text-secondary)] font-medium">
        Showing{" "}
        <span className="font-semibold text-[var(--text-primary)]">
          {startIdx}
        </span>{" "}
        to{" "}
        <span className="font-semibold text-[var(--text-primary)]">
          {endIdx}
        </span>{" "}
        of{" "}
        <span className="font-semibold text-[var(--text-primary)]">
          {totalItems}
        </span>{" "}
        results
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
            if (
              page === 1 ||
              page === totalPages ||
              Math.abs(page - currentPage) <= 1
            ) {
              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => onPageChange(page)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    page === currentPage
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {page}
                </button>
              );
            } else if (
              (page === currentPage - 2 && page > 1) ||
              (page === currentPage + 2 && page < totalPages)
            ) {
              return (
                <span
                  key={page}
                  className="px-1 text-xs text-[var(--text-muted)]"
                >
                  ...
                </span>
              );
            }
            return null;
          })}

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function usePagination<T>(items: T[], pageSize = 10) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [items.length, totalPages, currentPage]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  return {
    currentPage,
    setCurrentPage,
    paginatedItems,
    totalPages,
    totalItems: items.length,
  };
}
