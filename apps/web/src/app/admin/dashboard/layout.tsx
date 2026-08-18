"use client";

import "@/styles/admin.css";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./components/ToastProvider";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // "checking" while validating token, "ok" when authorised, "denied" to redirect
  const [authState, setAuthState] = useState<"checking" | "ok" | "denied">("checking");

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = typeof window !== "undefined"
      ? localStorage.getItem("admin_token")
      : null;

    if (!token) {
      setAuthState("denied");
      return;
    }

    // Validate the token is still alive and belongs to an Admin
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid");
        const data = await res.json();
        if (data?.role !== "Admin") throw new Error("not admin");
        setAuthState("ok");
      })
      .catch(() => {
        localStorage.removeItem("admin_token");
        setAuthState("denied");
      });
  }, []);

  useEffect(() => {
    if (authState === "denied") {
      router.replace("/admin/login");
    }
  }, [authState, router]);

  // ── Sidebar persistence ────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("admin_sidebar_collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("admin_sidebar_collapsed", String(next));
  };

  // ── Loading / denied states ────────────────────────────────────────────────
  if (authState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[var(--accent)]/20 border-t-[var(--accent)] rounded-full animate-spin" />
          <p className="text-[var(--text-muted)] text-sm font-medium">Verifying access…</p>
        </div>
      </div>
    );
  }

  if (authState === "denied") return null; // router.replace is in flight

  return (
    <ToastProvider>
      <div className="admin-layout relative">
        <div className="fixed inset-0 z-0 pointer-events-none bg-grid-pattern mask-radial-faded opacity-20" />

        {/* Mobile Backdrop (< md) */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden backdrop-blur-sm"
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
            {/* Mobile Top Bar for < md */}
            <div className="md:hidden flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
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


