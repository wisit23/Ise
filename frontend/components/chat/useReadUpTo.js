"use client";

import { useEffect, useMemo, useState } from "react";
import { getConversation } from "../../lib/chat";
import { getAccessToken } from "../../lib/auth";
import { useChatSocketEvent } from "./ChatSocketProvider";

function later(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}

function othersReadTimes(participants, currentUserId) {
  const times = {};
  for (const p of participants || []) {
    if (p.userId === currentUserId || p.leftAt || !p.lastReadAt) continue;
    times[p.userId] = later(times[p.userId], p.lastReadAt);
  }
  return times;
}

function mergeLatest(prev, next) {
  const merged = { ...prev };
  for (const [userId, at] of Object.entries(next)) {
    merged[userId] = later(merged[userId], at);
  }
  return merged;
}

/**
 * How far the other participants have read this conversation: the latest
 * `lastReadAt` among everyone but the current user, or null if nobody has.
 * Like a LINE group, one reader is enough to mark a message read.
 *
 * Seeded from `participants` when the caller already has them (null while
 * they load), otherwise from one conversation fetch, then kept current by
 * the server's
 * "conversation:read" event. Read times only ever move forward, so a stale
 * participants list arriving later never un-reads a message.
 */
export default function useReadUpTo(conversationId, currentUserId, participants) {
  const [readTimes, setReadTimes] = useState({});

  useEffect(() => {
    setReadTimes({});
  }, [conversationId]);

  useEffect(() => {
    // null means the caller will supply participants but hasn't loaded them
    // yet; only undefined asks this hook to fetch them itself.
    if (!conversationId || !currentUserId || participants === null) return undefined;
    if (participants) {
      setReadTimes((prev) => mergeLatest(prev, othersReadTimes(participants, currentUserId)));
      return undefined;
    }
    let cancelled = false;
    Promise.resolve()
      .then(() => getConversation(conversationId, getAccessToken()))
      .then((conv) => {
        if (cancelled) return;
        setReadTimes((prev) =>
          mergeLatest(prev, othersReadTimes(conv?.participants, currentUserId)),
        );
      })
      // Ticks just stay "sent" until a live read event arrives.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId, currentUserId, participants]);

  useChatSocketEvent("conversation:read", (data) => {
    if (data?.conversationId !== conversationId || data.userId === currentUserId) return;
    setReadTimes((prev) => mergeLatest(prev, { [data.userId]: data.lastReadAt }));
  });

  return useMemo(
    () => Object.values(readTimes).reduce((acc, at) => later(acc, at), null),
    [readTimes],
  );
}
