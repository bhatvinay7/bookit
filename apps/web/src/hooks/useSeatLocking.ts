/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";
import { useSocket } from "@/components/SocketProvider";
import type { ScheduleSeat } from "@/types/schedule";

export function useSeatLocking(scheduleId: number, seats: ScheduleSeat[], onSuccess?: () => void) {
  const { subscribe, unsubscribe, lockSeats, unlockSeats, syncLocks, lastMessage, socket, isConnected, wsUserId } = useSocket();
  const [lockedSeatIds, setLockedSeatIds] = useState<number[]>([]);
  
  // States specifically for our lock request
  const [isLocking, setIsLocking] = useState(false);
  const [myLockedSeats, setMyLockedSeats] = useState<number[]>([]);
  const [failedSeats, setFailedSeats] = useState<number[]>([]);
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false);
  // Seats that were locked by someone else while we had them selected
  const [externallyLockedSeats, setExternallyLockedSeats] = useState<number[]>([]);

  useEffect(() => {
    if (scheduleId) {
      subscribe(scheduleId);
    }
    return () => {
      if (scheduleId) unsubscribe(scheduleId);
    };
  }, [scheduleId, subscribe, unsubscribe]);

  useEffect(() => {
    if (!scheduleId || !isConnected || !socket) return;
    if (socket.readyState !== WebSocket.OPEN) return;

    subscribe(scheduleId);

    const timeoutId = window.setTimeout(() => {
      syncLocks(scheduleId);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [scheduleId, isConnected, socket, subscribe, syncLocks]);

  const [bookedSeatIds, setBookedSeatIds] = useState<number[]>([]);

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage as any;

    // Someone locked a seat — track it.
    if (msg.event === "seat_locked" && msg.seat_id) {
      if (msg.user_id === wsUserId) {
        setLockedSeatIds(prev => [...new Set([...prev, msg.seat_id])]);
        setMyLockedSeats(prev => [...new Set([...prev, msg.seat_id])]);
      } else {
        setLockedSeatIds(prev => [...new Set([...prev, msg.seat_id])]);
        setExternallyLockedSeats(prev => [...new Set([...prev, msg.seat_id])]);
      }
    }

    // Someone booked a seat
    if (msg.event === "seat_booked" && msg.seat_id) {
      setBookedSeatIds(prev => [...new Set([...prev, msg.seat_id])]);
      setLockedSeatIds(prev => prev.filter(id => id !== msg.seat_id));
      setMyLockedSeats(prev => prev.filter(id => id !== msg.seat_id));
    }

    // Someone unlocked a seat
    if (msg.event === "SeatUnlocked" || msg.event === "unlock_slot" || msg.event === "seat_unlocked") {
      const ids: number[] = msg.seat_ids || (msg.seat_id ? [msg.seat_id] : []);
      if (ids.length > 0) {
        setLockedSeatIds(prev => prev.filter(id => !ids.includes(id)));
        setMyLockedSeats(prev => prev.filter(id => !ids.includes(id)));
      }
    }

    // Response to our LockSeats request
    if (msg.event === "lock_slots_response") {
      setIsLocking(false);
      
      const failed: number[] = msg.failed_seat_ids || [];
      const success: boolean = msg.success;
      
      if (failed.length > 0) {
        setFailedSeats(failed);
        setShowDiscrepancyModal(true);
      } else if (success && onSuccess) {
        onSuccess();
      }
      
      // Always sync from the source of truth (zset) after a lock attempt
      // Add a slight delay to ensure lock-server has processed the queue
      setTimeout(() => syncLocks(scheduleId), 200);
    }

    // Response to our UnlockSeats request
    if (msg.event === "unlock_slots_response") {
      const unlocked: number[] = msg.unlocked_seat_ids || [];
      if (unlocked.length > 0) {
        setLockedSeatIds(prev => prev.filter(id => !unlocked.includes(id)));
        setMyLockedSeats(prev => prev.filter(id => !unlocked.includes(id)));
      }
    }

    // Initial room snapshot from ws-server's Redis bitmap + zset state
    if (msg.event === "room_state_snapshot") {
      const roomSeats = Array.isArray(msg.seats) ? msg.seats : [];
      
      const roomLockedSeats = roomSeats
        .filter((seat: { status?: string }) => (seat.status || "").toUpperCase() === "LOCKED")
        .map((seat: { seat_id: number }) => seat.seat_id);
      
      const roomBookedSeats = roomSeats
        .filter((seat: { status?: string }) => (seat.status || "").toUpperCase() === "BOOKED")
        .map((seat: { seat_id: number }) => seat.seat_id);

      const syncedObjects = Array.isArray(msg.locked_seat_ids) ? msg.locked_seat_ids : [];
      const synced: number[] = syncedObjects.map((obj: { seatId?: number; seat_id?: number } | string | number) => {
        if (typeof obj === 'object' && obj !== null) {
          return Number(obj.seatId ?? obj.seat_id);
        }
        return Number(obj);
      });

      setLockedSeatIds(roomLockedSeats);
      setBookedSeatIds(roomBookedSeats);
      setMyLockedSeats(synced);
    }

    // Refresh response from ws-server's Redis-backed zset state
    if (msg.event === "sync_locks_response") {
      const syncedObjects = Array.isArray(msg.locked_seat_ids) ? msg.locked_seat_ids : [];
      const synced: number[] = syncedObjects.map((obj: { seatId?: number; seat_id?: number } | string | number) => {
        if (typeof obj === 'object' && obj !== null) {
          return Number(obj.seatId ?? obj.seat_id);
        }
        return Number(obj);
      });
      setLockedSeatIds(prev => Array.from(new Set([...prev, ...synced])));
      setMyLockedSeats(synced);
    }
  }, [lastMessage, scheduleId, syncLocks, wsUserId]);

  const requestLock = useCallback((seatIds: number[]) => {
    if (seatIds.length === 0) return;
    const seatIndexById = new Map(seats.map((seat) => [seat.id, seat.seat_index]));
    const seatIndices = seatIds.map((seatId) => seatIndexById.get(seatId));
    if (seatIndices.some((seatIndex) => seatIndex == null)) return;
    setIsLocking(true);
    setFailedSeats([]);
    setShowDiscrepancyModal(false);
    const sent = lockSeats(scheduleId, seatIds, seatIndices as number[], seats.length);
    if (!sent) {
      setIsLocking(false);
      alert("Connection offline. Please wait to reconnect.");
    } else {
      setTimeout(() => setIsLocking(false), 5000);
    }
  }, [lockSeats, scheduleId, seats]);

  const requestUnlock = useCallback((seatIds: number[]) => {
    if (seatIds.length === 0) return;
    const seatIndexById = new Map(seats.map((seat) => [seat.id, seat.seat_index]));
    const seatIndices = seatIds.map((seatId) => seatIndexById.get(seatId));
    if (seatIndices.some((seatIndex) => seatIndex == null)) return;
    unlockSeats(scheduleId, seatIds, seatIndices as number[], seats.length);
    setMyLockedSeats((prev) => prev.filter((id) => !seatIds.includes(id)));
    setLockedSeatIds((prev) => prev.filter((id) => !seatIds.includes(id)));
  }, [scheduleId, seats, unlockSeats]);

  const closeDiscrepancyModal = useCallback(() => {
    setShowDiscrepancyModal(false);
  }, []);

  const clearExternallyLockedSeat = useCallback((seatId: number) => {
    setExternallyLockedSeats(prev => prev.filter(id => id !== seatId));
  }, []);

  return {
    lockedSeatIds,
    setLockedSeatIds,
    bookedSeatIds,
    isLocking,
    myLockedSeats,
    setMyLockedSeats,
    failedSeats,
    showDiscrepancyModal,
    requestLock,
    requestUnlock,
    closeDiscrepancyModal,
    externallyLockedSeats,
    clearExternallyLockedSeat,
  };
}
