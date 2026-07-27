"use client";

import "@/styles/admin.css";
import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./components/ToastProvider";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("admin_sidebar_collapsed");
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("admin_sidebar_collapsed", String(next));
  };

  return (
    <ToastProvider>
      <div className="admin-layout relative">
        <div className="fixed inset-0 z-0 pointer-events-none bg-grid-pattern mask-radial-faded opacity-20" />

        {/* Mobile Backdrop (< sm) */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <div className="relative z-10 flex w-full">
          <Sidebar
            collapsed={collapsed}
            onToggle={toggleSidebar}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />

          <main
            className={`admin-main ${
              collapsed ? "sidebar-collapsed" : ""
            } transition-all duration-300`}
          >
            {/* Mobile Top Bar for < sm */}
            <div className="sm:hidden flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]"
              >
                ☰ Menu
              </button>
              <span className="font-bold text-sm text-[var(--text-primary)]">
                BookIt Admin
              </span>
            </div>

            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
