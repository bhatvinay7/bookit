"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "authorized" | "unauthorized">("loading");
  const redirected = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem("user_token");
    if (token) {
      setStatus("authorized");
    } else {
      setStatus("unauthorized");
      if (!redirected.current) {
        redirected.current = true;
        router.replace("/login");
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading" || status === "unauthorized") {
    return (
      <div className="min-h-screen bg-[#0d0c18] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-5 border-4 border-[#151228] border-t-[#f5c518] rounded-full animate-spin" />
          <p className="text-white/60 text-sm font-medium">{status === "unauthorized" ? "Redirecting to login..." : "Loading..."}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
