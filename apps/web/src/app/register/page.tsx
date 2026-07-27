"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Ticket } from "lucide-react";
import { useSignup, ApiError } from "@/hooks/useApi";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();
  const signupMutation = useSignup();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    signupMutation.mutate({ email, password }, {
      onSuccess: () => {
        router.push("/login");
      },
      onError: (error: ApiError) => {
        setErrorMsg(error.message || "Registration failed. Please try again.");
      }
    });
  };

  return (
    <div className="min-h-screen flex w-full font-sans overflow-hidden text-white relative">
      
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
          Your Access To <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-yellow-200">
            Epic Events.
          </span>
        </h1>
        
        <p className="text-xl text-[var(--text-secondary)] max-w-lg font-medium leading-relaxed">
          Join BookIt to reserve VIP seats, manage your bookings, and never miss out on the biggest movies, concerts, and live sports.
        </p>

        {/* Abstract decorative elements */}
        <div className="absolute top-20 right-20 w-48 h-48 border border-[var(--border)] rounded-full bg-[var(--card-bg)]/20 backdrop-blur-md overflow-hidden opacity-50 mask-radial-faded">
            <div className="absolute inset-0 bg-grid-pattern opacity-60 scale-150 rotate-12" />
        </div>
      </div>

      {/* ════ RIGHT: GLASSMORPHIC FORM ════ */}
      <div className="flex-1 flex flex-col justify-center p-8 sm:p-16 lg:p-24 relative z-20">
        
        <div className="max-w-sm w-full mx-auto relative z-30 bg-[var(--card-bg)]/80 backdrop-blur-2xl p-8 rounded-3xl border border-[var(--border)] shadow-2xl">
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/30">
              <Ticket className="w-6 h-6 text-[#12111a]" />
            </div>
            <span className="text-3xl font-black text-white tracking-tight font-display">BookIt</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-black text-white mb-1.5 font-display">Create Account</h2>
            <p className="text-sm text-[var(--text-secondary)] font-medium">Join us to start booking tickets.</p>
          </div>

          <form className="space-y-4" onSubmit={handleRegister}>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] text-white transition-all placeholder:text-[var(--text-muted)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] text-white transition-all placeholder:text-[var(--text-muted)]"
              />
            </div>

            {errorMsg && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={signupMutation.isPending}
              className="w-full py-3 bg-[var(--accent)] hover:bg-yellow-500 text-[#12111a] font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(245,197,24,0.3)] hover:-translate-y-1"
            >
              {signupMutation.isPending ? "Creating account..." : "Sign Up"}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <p className="mt-8 text-center text-[var(--text-secondary)] font-medium">
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--accent)] font-bold hover:text-yellow-400 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
