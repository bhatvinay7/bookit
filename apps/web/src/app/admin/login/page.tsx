"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLogin } from "@/hooks/useApi";
import Image from "next/image";
import { Lock, Mail, KeyRound, AlertCircle, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Password reset state
  const [view, setView] = useState<"login" | "reset-request" | "reset-confirm">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const router = useRouter();
  const loginMutation = useLogin();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    loginMutation.mutate({ email, password }, {
      onSuccess: (data) => {
        // Backend serialises UserRole::Admin as "Admin" (capital A)
        if (data.user.role !== "Admin") {
          setErrorMsg("Unauthorized: Admin access required.");
          return;
        }
        localStorage.setItem("admin_token", data.token);
        router.push("/admin/dashboard");
      },
      onError: (err: unknown) => {
        setErrorMsg((err as Error).message || "Invalid credentials");
      }
    });
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/auth/admin/reset-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error ?? "Request failed");
      setResetMsg({ text: "Reset token sent. Check your console/logs (or email if configured). Enter it below.", ok: true });
      setView("reset-confirm");
    } catch (err) {
      setResetMsg({ text: (err as Error).message, ok: false });
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/auth/admin/reset-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, token: resetToken, new_password: newPassword }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error ?? "Request failed");
      setResetMsg({ text: "Password reset successfully! You can now log in.", ok: true });
      setTimeout(() => { setView("login"); setResetMsg(null); setResetToken(""); setNewPassword(""); }, 2500);
    } catch (err) {
      setResetMsg({ text: (err as Error).message, ok: false });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* ════ GLOBAL DARK BACKGROUND ════ */}
      <div className="absolute inset-0 z-0">
        <Image src="/dark-section-bg.png" alt="" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-slate-950/90" />
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      </div>
      
      {/* ════ LEFT SIDE ════ */}
      <div className="hidden md:flex md:w-1/2 relative z-10 flex-col items-center justify-center p-12 border-r border-slate-800/50">
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="mb-8">
            <Image src="/admin_flat_cartoon.png" alt="Admin Character" width={400} height={400}
              className="object-contain drop-shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-transform duration-500 rounded-[3rem] bg-white/10 backdrop-blur-md opacity-95 p-6 border border-white/20"
              priority draggable={false}
            />
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="text-3xl font-extrabold text-white mb-4 tracking-tight">
            Manage Your Platform
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}
            className="text-slate-400 text-lg leading-relaxed font-medium">
            Log in to access your dashboard, monitor performance, and configure system settings.
          </motion.p>
        </div>
      </div>

      {/* ════ RIGHT SIDE ════ */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-sm bg-slate-900/60 backdrop-blur-xl p-8 sm:p-10 rounded-3xl border border-slate-700/50 shadow-2xl">

          <AnimatePresence mode="wait">

            {/* ── LOGIN PANEL ── */}
            {view === "login" && (
              <motion.div key="login" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                <div className="mb-10 text-center md:text-left">
                  <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center mb-6 mx-auto md:mx-0 shadow-inner border border-indigo-500/20">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Admin Login</h1>
                  <p className="text-slate-400 font-medium">Please enter your credentials to continue.</p>
                </div>

                <AnimatePresence>
                  {errorMsg && (
                    <motion.div initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 24 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} className="overflow-hidden">
                      <div className="flex items-start gap-3 p-4 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 shadow-sm">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p className="text-sm font-semibold">{errorMsg}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500"><Mail className="w-5 h-5" /></div>
                      <input type="email" className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-white placeholder-slate-500"
                        value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@bookit4u.shop" required />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-bold text-slate-300">Password</label>
                      <button type="button" onClick={() => { setView("reset-request"); setResetEmail(email); setResetMsg(null); }}
                        className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Forgot?</button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500"><KeyRound className="w-5 h-5" /></div>
                      <input type="password" className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-white placeholder-slate-500"
                        value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>
                  </div>
                  <button type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                    disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Authenticating...
                      </span>
                    ) : (
                      <>
                        Login to Dashboard
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                <p className="mt-8 text-center text-sm font-medium text-slate-500">
                  Secure admin portal &copy; {new Date().getFullYear()} BookIt Inc.
                </p>
              </motion.div>
            )}

            {/* ── RESET REQUEST PANEL ── */}
            {view === "reset-request" && (
              <motion.div key="reset-request" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                <div className="mb-8">
                  <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center mb-6 shadow-inner border border-amber-500/20">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
                  <p className="text-slate-400 text-sm">Enter your admin email. A one-time token (valid 15 minutes) will be generated.</p>
                </div>

                {resetMsg && (
                  <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm font-semibold mb-5 ${ resetMsg.ok ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20" }`}>
                    {resetMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    {resetMsg.text}
                  </div>
                )}

                <form onSubmit={handleResetRequest} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Admin Email</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500"><Mail className="w-5 h-5" /></div>
                      <input type="email" className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:bg-slate-800 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all font-medium text-white placeholder-slate-500"
                        value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="admin@bookit4u.shop" required />
                    </div>
                  </div>
                  <button type="submit" disabled={resetLoading}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                    {resetLoading ? "Sending..." : "Send Reset Token"}
                  </button>
                </form>

                <button onClick={() => { setView("login"); setResetMsg(null); }} className="mt-5 w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors">
                  ← Back to Login
                </button>
              </motion.div>
            )}

            {/* ── RESET CONFIRM PANEL ── */}
            {view === "reset-confirm" && (
              <motion.div key="reset-confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                <div className="mb-8">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mb-6 shadow-inner border border-emerald-500/20">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">Set New Password</h1>
                  <p className="text-slate-400 text-sm">Enter the token from your logs/email and choose a new password. Token expires in 15 minutes.</p>
                </div>

                {resetMsg && (
                  <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm font-semibold mb-5 ${ resetMsg.ok ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20" }`}>
                    {resetMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    {resetMsg.text}
                  </div>
                )}

                <form onSubmit={handleResetConfirm} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Reset Token</label>
                    <input type="text" className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all font-mono text-white placeholder-slate-500 tracking-widest"
                      value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="xxxxxxxxxxxxxxxx" required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-1.5">New Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500"><Lock className="w-5 h-5" /></div>
                      <input type="password" className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all font-medium text-white placeholder-slate-500"
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" minLength={8} required />
                    </div>
                  </div>
                  <button type="submit" disabled={resetLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                    {resetLoading ? "Resetting..." : "Reset Password"}
                  </button>
                </form>

                <button onClick={() => setView("reset-request")} className="mt-5 w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors">
                  ← Back
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
