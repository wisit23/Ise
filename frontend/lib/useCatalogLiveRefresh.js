"use client";

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

let catalogSocket;
let subscribers = 0;

// One public connection shared by the home feed and recommendations.
export default function useCatalogLiveRefresh(onRefresh) {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    catalogSocket ||= io(`${process.env.NEXT_PUBLIC_API_URL || ""}/catalog`, {
      path: "/api/chat/socket.io",
      transports: ["websocket", "polling"],
    });
    const socket = catalogSocket;
    subscribers += 1;
    let disposed = false;
    let running = false;
    let queued = false;
    let timer;

    const refresh = async () => {
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
          // Preserve the last successful result until the next retry.
        }
      } while (queued && !disposed);
      running = false;
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    socket.on("catalog:changed", schedule);
    socket.on("connect", schedule);
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", onVisible);
    // Reconcile even when a best-effort product broadcast was missed.
    const interval = setInterval(schedule, 30000);
    if (socket.connected) schedule();

    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      socket.off("catalog:changed", schedule);
      socket.off("connect", schedule);
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", onVisible);
      subscribers -= 1;
      if (!subscribers) {
        socket.close();
        catalogSocket = undefined;
      }
    };
  }, []);
}
