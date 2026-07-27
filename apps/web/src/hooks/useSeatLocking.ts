import { useState, useEffect, useCallback } from "react";
import { useSocket } from "@/components/SocketProvider";

export function useSeatLocking(scheduleId: number) {
  const { subscribe, unsubscribe, lockSeats, unlockSeats, syncLocks, lastMessage, socket, isConnected } = useSocket();
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

    // Someone else locked a seat — track it as externally locked
    // (the server already excludes the locker from this broadcast)
    if (lastMessage.event === "lock_slot" && lastMessage.seat_id) {
      setLockedSeatIds(prev => [...new Set([...prev, lastMessage.seat_id])]);
      setExternallyLockedSeats(prev => [...new Set([...prev, lastMessage.seat_id])]);
    }

    // Someone booked a seat
    if (lastMessage.event === "seat_booked" && lastMessage.seat_id) {
      setBookedSeatIds(prev => [...new Set([...prev, lastMessage.seat_id])]);
      setLockedSeatIds(prev => prev.filter(id => id !== lastMessage.seat_id));
      setMyLockedSeats(prev => prev.filter(id => id !== lastMessage.seat_id));
    }

    // Someone unlocked a seat
    if ((lastMessage.event === "SeatUnlocked" || lastMessage.event === "unlock_slot") && lastMessage.seat_id) {
      setLockedSeatIds(prev => prev.filter(id => id !== lastMessage.seat_id));
      setMyLockedSeats(prev => prev.filter(id => id !== lastMessage.seat_id));
    }

    // Response to our LockSeats request
    if (lastMessage.event === "lock_slots_response") {
      setIsLocking(false);
      
      const locked: number[] = lastMessage.locked_seat_ids || [];
      const failed: number[] = lastMessage.failed_seat_ids || [];
      
      if (locked.length > 0) {
        setMyLockedSeats(locked);
        // Also add them to the global locked state so UI updates
        setLockedSeatIds(prev => [...new Set([...prev, ...locked])]);
      }
      
      if (failed.length > 0) {
        setFailedSeats(failed);
        setShowDiscrepancyModal(true);
      } else if (locked.length > 0) {
        // 100% success, no failed seats
      }
    }

    // Response to our UnlockSeats request
    if (lastMessage.event === "unlock_slots_response") {
      const unlocked: number[] = lastMessage.unlocked_seat_ids || [];
      if (unlocked.length > 0) {
        setLockedSeatIds(prev => prev.filter(id => !unlocked.includes(id)));
        setMyLockedSeats(prev => prev.filter(id => !unlocked.includes(id)));
      }
    }

    // Initial room snapshot from ws-server's Redis bitmap + zset state
    if (lastMessage.event === "room_state_snapshot") {
      const roomSeats = Array.isArray(lastMessage.seats) ? lastMessage.seats : [];
      
      const roomLockedSeats = roomSeats
        .filter((seat: { status?: string }) => (seat.status || "").toUpperCase() === "LOCKED")
        .map((seat: { seat_id: number }) => seat.seat_id);
      
      const roomBookedSeats = roomSeats
        .filter((seat: { status?: string }) => (seat.status || "").toUpperCase() === "BOOKED")
        .map((seat: { seat_id: number }) => seat.seat_id);

      const synced: number[] = Array.isArray(lastMessage.locked_seat_ids) ? lastMessage.locked_seat_ids : [];

      setLockedSeatIds(roomLockedSeats);
      setBookedSeatIds(roomBookedSeats);
      setMyLockedSeats(synced);
    }

    // Refresh response from ws-server's Redis-backed zset state
    if (lastMessage.event === "sync_locks_response") {
      const synced: number[] = lastMessage.locked_seat_ids || [];
      setLockedSeatIds(prev => Array.from(new Set([...prev, ...synced])));
      setMyLockedSeats(synced);
    }
  }, [lastMessage]);

  const requestLock = useCallback((seatIds: number[]) => {
    if (seatIds.length === 0) return;
    setIsLocking(true);
    setMyLockedSeats([]);
    setFailedSeats([]);
    setShowDiscrepancyModal(false);
    lockSeats(scheduleId, seatIds);
  }, [lockSeats, scheduleId]);

  const requestUnlock = useCallback((seatIds: number[]) => {
    if (seatIds.length === 0) return;
    unlockSeats(scheduleId, seatIds);
  }, [scheduleId, unlockSeats]);

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
