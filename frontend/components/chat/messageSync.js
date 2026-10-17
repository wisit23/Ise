"use client";

import { useEffect, useRef } from "react";
import config from "../../lib/customerServiceConfig";

function timeOf(message) {
  const t = Date.parse(message.createdAt);
  return Number.isNaN(t) ? 0 : t;
}

/** Merges messages by id, ordered the way chat-service pages them
 * (createdAt, then id — see its cursor.js). Sorting by id alone misplaces
 * messages whose id is a hash of an idempotency key rather than an ObjectId,
 * which matters once a poll or a reconnect re-merges a whole page. */
export function mergeMessages(existing, incoming) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => {
    const diff = timeOf(a) - timeOf(b);
    if (diff !== 0) return diff;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * Keeps an open chat in step with the server whenever live delivery can't be
 * trusted: `resync` runs every `intervalMs` while `live` is false, and once
 * more when `live` flips back to true — Socket.IO never replays events that
 * were emitted while a client was disconnected, so the moment it reconnects
 * is exactly when a refetch is required.
 *
 * `active` gates the whole thing (no room open yet → nothing to poll).
 */
export function useSocketResync({
  active,
  live,
  resync,
  intervalMs = config.timing.socketFallbackPollMs,
}) {
  const resyncRef = useRef(resync);
  resyncRef.current = resync;
  const wasLive = useRef(live);

  useEffect(() => {
    if (!active) {
      wasLive.current = live;
      return undefined;
    }
    if (live) {
      if (wasLive.current === false) resyncRef.current();
      wasLive.current = true;
      return undefined;
    }
    wasLive.current = false;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      resyncRef.current();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, live, intervalMs]);
}
