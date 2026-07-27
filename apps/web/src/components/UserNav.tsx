"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, LogOut, LogIn, UserPlus, User } from "lucide-react";
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
              className="absolute right-0 mt-2 w-56 z-50 bg-gray-100 dark:bg-gray-900 border border-[var(--border)] rounded-xl shadow-xl overflow-hidden py-2"
            >
              {isLoggedIn && userEmail && (
                <div className="px-4 py-3 border-b border-[var(--border)] mb-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Signed in as</p>
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{userEmail}</p>
                </div>
              )}
              
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors text-left"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {isDark ? "Light Mode" : "Dark Mode"}
              </button>

              {isLoggedIn ? (
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              ) : (
                <>
                  <button
                    onClick={() => go("/login")}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors text-left"
                  >
                    <LogIn className="w-4 h-4" />
                    Login
                  </button>
                  <button
                    onClick={() => go("/register")}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors text-left"
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
