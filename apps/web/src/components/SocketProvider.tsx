"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";

interface SocketContextType {
  socket: WebSocket | null;
  isConnected: boolean;
  subscribe: (showtimeId: number) => void;
  unsubscribe: (showtimeId: number) => void;
  lockSeats: (showtimeId: number, seatIds: number[]) => void;
  unlockSeats: (showtimeId: number, seatIds: number[]) => void;
  syncLocks: (showtimeId: number) => void;
  lastMessage: any;
  tokenExpired: boolean;
  tokenError: string | null;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  const connect = useCallback(() => {
    let token = "mock_token";
    if (typeof window !== "undefined") {
      token = localStorage.getItem("user_token") || "mock_token";
    }

    // Check if user token is expired
    if (token && token !== "mock_token") {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            console.error("User token is expired!");
            setTokenExpired(true);
            setTokenError("Your session token has expired. Real-time updates and seat locking are disabled. Please log in again.");
            return;
          }
        }
      } catch (e) {
        console.error("Failed to parse token expiration", e);
      }
    }

    const wsBaseUrl = process.env.NEXT_PUBLIC_WS_BASE_URL || "ws://localhost:8081";
    const wsUrl = `${wsBaseUrl}/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Connected to WS");
      setIsConnected(true);
      setTokenExpired(false);
      setTokenError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch (e) {
        console.error("Failed to parse WS msg", e);
      }
    };

    ws.onerror = (err) => {
      console.error("WS error:", err);
    };

    ws.onclose = () => {
      console.log("WS closed. Reconnecting in 3s...");
      setIsConnected(false);
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    setSocket(ws);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      setSocket((s) => {
        s?.close();
        return null;
      });
    };
  }, [connect]);

  const subscribe = useCallback((showtimeId: number) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "Subscribe", room_id: showtimeId }));
    }
  }, [socket]);

  const unsubscribe = useCallback((showtimeId: number) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "Unsubscribe", room_id: showtimeId }));
    }
  }, [socket]);

  const lockSeats = useCallback((showtimeId: number, seatIds: number[]) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "LockSeats", room_id: showtimeId, seat_ids: seatIds }));
    }
  }, [socket]);

  const unlockSeats = useCallback((showtimeId: number, seatIds: number[]) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "UnlockSeats", room_id: showtimeId, seat_ids: seatIds }));
    }
  }, [socket]);

  const syncLocks = useCallback((showtimeId: number) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "SyncLocks", room_id: showtimeId }));
    }
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, subscribe, unsubscribe, lockSeats, unlockSeats, syncLocks, lastMessage, tokenExpired, tokenError }}>
      {tokenError && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 999999, background: "#ef4444", color: "#ffffff", padding: "12px 20px",
          borderRadius: "12px", boxShadow: "0 10px 25px rgba(239, 68, 68, 0.4)",
          display: "flex", alignItems: "center", gap: "12px", fontWeight: 600, fontSize: "14px",
          border: "1px solid #f87171"
        }}>
          <span>⚠️ {tokenError}</span>
          <a
            href="/login"
            style={{
              background: "#ffffff", color: "#ef4444", padding: "6px 12px",
              borderRadius: "8px", textDecoration: "none", fontWeight: 700, fontSize: "13px"
            }}
          >
            Log In
          </a>
          <button
            onClick={() => setTokenError(null)}
            style={{ background: "transparent", border: "none", color: "#ffffff", cursor: "pointer", fontWeight: "bold", fontSize: "16px" }}
          >
            ✕
          </button>
        </div>
      )}
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
