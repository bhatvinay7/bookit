"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLogin } from "@/hooks/useApi";
import Image from "next/image";
import { Lock, Mail, KeyRound, AlertCircle, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const loginMutation = useLogin();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    loginMutation.mutate({ email, password }, {
      onSuccess: (data) => {
        if (data.user.role !== "admin") {
          setErrorMsg("Unauthorized: Admin access required. You are logged in as a normal user.");
          return;
        }
        localStorage.setItem("admin_token", data.token);
        router.push("/admin/dashboard");
      },
      onError: (err: any) => {
        setErrorMsg(err.response?.data?.error || "Invalid credentials");
      }
    });
  };

  return (
    <div className="min-h-screen relative flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* ════ GLOBAL DARK BACKGROUND (Matches Dashboard Showcase) ════ */}
      <div className="absolute inset-0 z-0">
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
      
      {/* ════ LEFT SIDE: Marketing / Cartoon Split ════ */}
      <div className="hidden md:flex md:w-1/2 relative z-10 flex-col items-center justify-center p-12 border-r border-slate-800/50">
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mb-8"
          >
            <Image 
              src="/admin_flat_cartoon.png"
              alt="Admin Character"
              width={400}
              height={400}
              className="object-contain drop-shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-transform duration-500 rounded-[3rem] bg-white/10 backdrop-blur-md opacity-95 p-6 border border-white/20"
              priority
              draggable={false}
            />
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-3xl font-extrabold text-white mb-4 tracking-tight"
          >
            Manage Your Platform
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="text-slate-400 text-lg leading-relaxed font-medium"
          >
            Log in to access your dashboard, monitor performance, and configure system settings with ease.
          </motion.p>
        </div>
      </div>

      {/* ════ RIGHT SIDE: Login Form ════ */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-sm bg-slate-900/60 backdrop-blur-xl p-8 sm:p-10 rounded-3xl border border-slate-700/50 shadow-2xl">
          
          <div className="mb-10 text-center md:text-left">
            <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center mb-6 mx-auto md:mx-0 shadow-inner border border-indigo-500/20">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Admin Login</h1>
            <p className="text-slate-400 font-medium">Please enter your credentials to continue.</p>
          </div>

          <AnimatePresence>
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="overflow-hidden"
              >
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
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-5 h-5" />
                </div>
                <input 
                  type="email" 
                  className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-white placeholder-slate-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@bookit.com"
                  required
                />
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-bold text-slate-300">Password</label>
                <a href="#" className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Forgot?</a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-5 h-5" />
                </div>
                <input 
                  type="password" 
                  className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-white placeholder-slate-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            
            <button 
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed mt-4"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
        </div>
      </div>
    </div>
  );
}
