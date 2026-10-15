"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useChatSocketEvent } from "../../chat/ChatSocketProvider";

export default function useCaseUnread(domain, token, account) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(false);
  const refresh = useRef(() => {});
  useChatSocketEvent("conversation:activity", () => refresh.current());
  useEffect(() => {
    let active = true,
      pending = false,
      queued = false;
    setSummary(null);
    const base =
      domain === "tickets" ? "/api/support/tickets" : "/api/orders/disputes";
    async function load() {
      if (!active || !token) return;
      if (pending) {
        queued = true;
        return;
      }
      pending = true;
      try {
        const data = await apiFetch(`${base}/unread-summary`, { token });
        if (active) {
          setSummary(data);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
        if (queued && active) {
          queued = false;
          void load();
        }
      }
    }
    refresh.current = load;
    void load();
    // Unassigned conversations may not yet contain this agent as a participant.
    // Poll as well as listening to socket and successful mark-read events.
    const timer = setInterval(load, 15000);
    window.addEventListener("case-chat:read", load);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("case-chat:read", load);
      window.removeEventListener("focus", load);
    };
  }, [domain, token, account]);
  return { summary, error };
}
