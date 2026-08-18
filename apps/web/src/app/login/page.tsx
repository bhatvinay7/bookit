"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Ticket } from "lucide-react";
import { useLogin, ApiError } from "@/hooks/useApi";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();
  const loginMutation = useLogin();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    loginMutation.mutate({ email, password }, {
      onSuccess: (data) => {
        localStorage.setItem("user_token", data.token);
        localStorage.setItem("user_email", email);
        window.location.href = "/dashboard";
      },
      onError: (error: ApiError) => {
        setErrorMsg(error.message || "Login failed. Please check your credentials.");
      }
    });
  };

  return (
    <div className="min-h-screen flex w-full font-sans overflow-hidden relative">
      
      {/* ════ BACKGROUND MATCHING DASHBOARD SHOWCASE ════ */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Image 
          src="/dark-section-bg.png" 
          alt="" 
          fill 
          className="object-cover" 
          priority
        />
        <div className="absolute inset-0 bg-slate-950/90" />
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      </div>
      
      {/* ════ LEFT: MARKETING & BRANDING ════ */}
      <div className="hidden lg:flex flex-1 relative z-10 flex-col justify-center p-20 border-r border-slate-800/50">
        
        <div className="flex items-center gap-4 mb-12">
          <div className="w-14 h-14 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-[0_0_30px_rgba(245,197,24,0.3)]">
            <Ticket className="w-8 h-8 text-[#12111a]" />
          </div>
          <span className="text-4xl font-black tracking-tight text-white font-display">
            BookIt
          </span>
        </div>
        
        <h1 className="text-6xl font-black text-white mb-6 leading-[1.15] font-display">
          Enter the <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-yellow-200">
            Main Event.
          </span>
        </h1>
        
        <p className="text-xl text-[var(--text-secondary)] max-w-lg font-medium leading-relaxed">
          Movies. Concerts. Live Sports. 
          Sign in to access your premium ticketing dashboard and manage all your experiences in one place.
        </p>

        {/* Abstract decorative elements */}
        <div className="absolute bottom-20 left-20 right-20 h-48 border border-[var(--border)] rounded-3xl bg-[var(--card-bg)]/30 backdrop-blur-md overflow-hidden opacity-50 mask-linear-faded">
            <div className="absolute inset-0 bg-grid-pattern opacity-40" />
        </div>
      </div>

      {/* ════ RIGHT: GLASSMORPHIC FORM ════ */}
      <div className="flex-1 flex flex-col justify-center p-8 sm:p-16 lg:p-24 relative z-20">
        
        <div className="max-w-sm w-full mx-auto relative z-30 bg-[var(--card-bg)]/80 backdrop-blur-2xl p-8 rounded-3xl border border-[var(--border)] shadow-2xl">
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/30">
              <Ticket className="w-6 h-6 text-[#12111a]" />
            </div>
            <span className="text-3xl font-black text-[var(--text-primary)] tracking-tight font-display">BookIt</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-black text-[var(--text-primary)] mb-1.5 font-display">Welcome Back</h2>
            <p className="text-sm text-[var(--text-secondary)] font-medium">Sign in to your account to book tickets.</p>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] transition-all placeholder:text-[var(--text-muted)]"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Password</label>
                <a href="#" className="text-xs font-bold text-[var(--accent)] hover:text-yellow-400 transition-colors">Forgot password?</a>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] transition-all placeholder:text-[var(--text-muted)]"
              />
            </div>

            {errorMsg && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full py-3 bg-[var(--accent)] hover:bg-yellow-500 text-[#12111a] font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(245,197,24,0.3)] hover:-translate-y-1"
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <p className="mt-8 text-center text-[var(--text-secondary)] font-medium">
            Don't have an account?{" "}
            <Link href="/register" className="text-[var(--accent)] font-bold hover:text-yellow-400 transition-colors">
              Create one now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
