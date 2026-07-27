"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const NAV_GROUPS = [
  {
    label: "Main",
    items: [
      { href: "/admin/dashboard",           icon: "📊", label: "Overview"   },
    ],
  },
  {
    label: "Shows",
    items: [
      { href: "/admin/dashboard/shows",     icon: "🎭", label: "All Shows"  },
      { href: "/admin/dashboard/layouts",   icon: "🗺️", label: "Seat Layouts"},
      { href: "/admin/dashboard/schedules", icon: "📅", label: "Schedules"  },
    ],
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  collapsed = false,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const path = usePathname();

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    window.location.href = "/admin/login";
  };

  return (
    <aside
      className={`admin-sidebar ${collapsed ? "collapsed" : ""} ${
        mobileOpen ? "mobile-open" : ""
      }`}
    >
      {/* Logo */}
      <div className="admin-sidebar-logo">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="admin-sidebar-logo-mark">B</div>
          {!collapsed && (
            <div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                BookIt Admin
              </p>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Management Portal
              </p>
            </div>
          )}
        </div>

        {/* Toggle button on >= sm */}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="hidden sm:flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors flex-shrink-0"
            title={collapsed ? "Expand Sidebar (Strip)" : "Collapse Sidebar"}
          >
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {collapsed ? "»" : "«"}
            </span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="admin-sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  padding: "10px 12px 4px",
                }}
              >
                {group.label}
              </p>
            ) : (
              <div
                style={{
                  margin: "10px 6px",
                  borderTop: "1px solid var(--border)",
                }}
                title={group.label}
              />
            )}

            {group.items.map(({ href, icon, label }) => {
              const active =
                path === href ||
                (href !== "/admin/dashboard" && path.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onMobileClose}
                  className={`admin-nav-item ${active ? "active" : ""}`}
                  title={label}
                >
                  <span
                    style={{
                      fontSize: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {icon}
                  </span>
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "12px 8px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <button
          type="button"
          className="admin-nav-item"
          style={{ color: "var(--danger)" }}
          onClick={handleLogout}
          title="Logout"
        >
          <span
            style={{
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            🚪
          </span>
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
