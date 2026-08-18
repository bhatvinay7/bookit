"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, LogOut, LogIn, UserPlus, User, Ticket } from "lucide-react";
import { useTheme } from "next-themes";

function useAuthStatus() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const refresh = () => {
    const token = localStorage.getItem("user_token");
    const email = localStorage.getItem("user_email");
    setIsLoggedIn(!!token);
    setUserEmail(email);
  };

  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  return { isLoggedIn, userEmail, refresh };
}

export function UserNav() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const { isLoggedIn, refresh, userEmail } = useAuthStatus();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
    setIsOpen(false);
  };

  const handleSignOut = () => {
    localStorage.removeItem("user_token");
    localStorage.removeItem("user_email");
    refresh();
    setIsOpen(false);
    window.location.href = "/";
  };

  const go = (path: string) => {
    setIsOpen(false);
    window.location.href = path;
  };

  if (!mounted) return null;

  // Dropdown styles driven entirely by CSS variables so light/dark just work.
  const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    marginTop: "8px",
    width: "224px",
    zIndex: 50,
    background: "var(--card-bg)",          // #ffffff in light, dark card in dark
    border: "1px solid var(--border)",
    borderRadius: "14px",
    boxShadow: isDark
      ? "0 8px 32px rgba(0,0,0,0.6)"
      : "0 8px 32px rgba(0,0,0,0.12)",
    overflow: "hidden",
    paddingTop: "6px",
    paddingBottom: "6px",
  };

  const menuItemStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "background 0.12s, color 0.12s",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full border border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors text-[var(--text-secondary)] bg-[var(--card-bg)] shadow-sm"
        title="User Menu"
      >
        <User className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              style={dropdownStyle}
            >
              {isLoggedIn && userEmail && (
                <div style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  marginBottom: "4px",
                }}>
                  <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
                    Signed in as
                  </p>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {userEmail}
                  </p>
                </div>
              )}

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                style={menuItemStyle}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-subtle)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                }}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {isDark ? "Light Mode" : "Dark Mode"}
              </button>

              {isLoggedIn ? (
                <>
                  <button
                    onClick={() => go("/tickets")}
                    style={menuItemStyle}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-subtle)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                    }}
                  >
                    <Ticket className="w-4 h-4" />
                    My Tickets
                  </button>
                  <button
                    onClick={handleSignOut}
                    style={{ ...menuItemStyle, color: "#ef4444" }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.1)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => go("/login")}
                    style={menuItemStyle}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-subtle)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                    }}
                  >
                    <LogIn className="w-4 h-4" />
                    Login
                  </button>
                  <button
                    onClick={() => go("/register")}
                    style={menuItemStyle}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-subtle)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                    }}
                  >
                    <UserPlus className="w-4 h-4" />
                    Sign Up
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

