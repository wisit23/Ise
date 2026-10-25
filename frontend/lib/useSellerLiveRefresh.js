"use client";

import { useEffect, useRef } from "react";
import { useChatSocket } from "../components/chat/ChatSocketProvider";

/** Refresh seller-owned data after live events and recover from missed events. */
export default function useSellerLiveRefresh(onRefresh, { enabled = true, events = [] } = {}) {
  const { socket, connected } = useChatSocket();
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const wasConnected = useRef(connected);
  const eventNames = events.join("|");

  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let running = false;
    let queued = false;
    let debounceTimer;

    const run = async () => {
      if (disposed || document.visibilityState === "hidden") return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      do {
        queued = false;
        try {
          await refreshRef.current();
        } catch {
          // Keep the last known data and try again on the next event or interval.
        }
      } while (queued && !disposed);
      running = false;
    };
    const schedule = () => {
      if (disposed || document.visibilityState === "hidden") return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(run, 150);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    const names = eventNames ? eventNames.split("|") : [];
    names.forEach((name) => socket?.on(name, schedule));
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(schedule, 30000);
    if (connected && !wasConnected.current) schedule();
    wasConnected.current = connected;

    return () => {
      disposed = true;
      clearTimeout(debounceTimer);
      clearInterval(interval);
      names.forEach((name) => socket?.off(name, schedule));
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [socket, connected, enabled, eventNames]);
}
