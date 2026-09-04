"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import Alert from "../../../components/ui/Alert";
import MessageList from "../../../components/chat/MessageList";
import MessageComposer from "../../../components/chat/MessageComposer";
import {
  getConversation,
  listMessages,
  sendMessage,
  markRead,
  otherParticipant,
  participantRoleLabel,
} from "../../../lib/chat";
import {
  useChatSocket,
  useChatSocketEvent,
} from "../../../components/chat/ChatSocketProvider";
import { uploadChatAttachment } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

// REST polling is now the FALLBACK, not the primary delivery path (CHAT-006)
// — it only runs while `realtime` is false, i.e. while no Socket.IO
// connection is currently joined to this room. Every poll re-fetches only
// the most recent page and merges by id, so a missed tick (or the gap while
// falling back after a dropped socket) self-heals on the next one instead
// of needing an "after" cursor.
const POLL_INTERVAL_MS = 4000;
const PAGE_SIZE = 30;

function mergeById(existing, incoming) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  // ObjectId string comparison sorts chronologically — see cursor.js's
  // comment in chat-service for why.
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

export default function ChatRoomPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [conversation, setConversation] = useState(null);
  const [otherName, setOtherName] = useState("");
  const [messages, setMessages] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [realtime, setRealtime] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const { socket, connected: socketConnected } = useChatSocket();

  // Derived, not state: which side the other person is on in THIS room is a
  // fact about the conversation already in hand, so keeping a copy in state
  // would just be one more thing that could fall out of sync with it.
  const otherRoleLabel =
    conversation && user
      ? participantRoleLabel(otherParticipant(conversation, user.id)?.role)
      : null;

  const tokenRef = useRef(null);

  const loadInitial = useCallback(
    async (currentUser) => {
      const token = tokenRef.current;
      try {
        const conv = await getConversation(id, token);
        setConversation(conv);
        // The name arrives on the conversation itself — chat-service
        // resolves it server-side (see its authClient). The browser has no
        // user-lookup endpoint to call, so it can't be used to enumerate
        // accounts outside the rooms this user belongs to.
        const other = otherParticipant(conv, currentUser.id);
        setOtherName(other?.displayName || "ผู้ใช้");

        const page = await listMessages(id, { limit: PAGE_SIZE }, token);
        setMessages([...page.items].reverse());
        setOlderCursor(page.nextCursor);
        markRead(id, token).catch(() => {});
      } catch (err) {
        setError(err.message);
      }
    },
    [id],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    tokenRef.current = token;
    const currentUser = getStoredUser();
    setUser(currentUser);
    if (currentUser) loadInitial(currentUser);
  }, [router, loadInitial]);

  // Joins THIS room on the app-wide shared socket (ChatSocketProvider) —
  // this page no longer owns a connection of its own. It still owns the
  // join/leave lifecycle though: the room must be re-joined every time the
  // socket (re)connects, since a server-side room membership does not
  // survive the connection that created it.
  useEffect(() => {
    if (!user || !id || !socket || !socketConnected) {
      setRealtime(false);
      return undefined;
    }
    let cancelled = false;
    socket.emit("join", id, (ack) => {
      if (!cancelled) setRealtime(Boolean(ack?.ok));
    });
    return () => {
      cancelled = true;
      // Leaving matters now that the socket outlives this page: without it
      // a user who visits room A then room B would still be joined to A on
      // the server and keep receiving its messages in the background.
      socket.emit("leave", id);
      setRealtime(false);
    };
  }, [id, user, socket, socketConnected]);

  useChatSocketEvent("message:new", (message) => {
    if (!user || message.conversationId !== id) return;
    setMessages((prev) => mergeById(prev, [message]));
    if (message.senderId !== user.id) {
      setOtherTyping(false);
      markRead(id, tokenRef.current).catch(() => {});
    }
  });

  useChatSocketEvent("typing", ({ userId, typing }) => {
    if (!user || userId === user.id) return;
    setOtherTyping(typing);
  });

  function handleTyping(isTyping) {
    if (!realtime || !socket) return;
    socket.emit(isTyping ? "typing:start" : "typing:stop", id);
  }

  // Polling — the FALLBACK path (CHAT-006; see the socket effect above for
  // the primary one), so it's now also gated on `!realtime`: paused while
  // the tab is hidden (plan.md CHAT-004 Step 5), and stopped entirely once
  // the conversation fails to load at all so it does not keep hammering a
  // 403/404.
  useEffect(() => {
    if (!user || !conversation || realtime) return undefined;
    let cancelled = false;

    async function tick() {
      if (document.hidden || cancelled) return;
      try {
        const page = await listMessages(
          id,
          { limit: PAGE_SIZE },
          tokenRef.current,
        );
        if (cancelled) return;
        setMessages((prev) => mergeById(prev, page.items));
        markRead(id, tokenRef.current).catch(() => {});
      } catch {
        // A transient poll failure shouldn't surface as a page-level error —
        // the next tick will just try again.
      }
    }

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, user, conversation, realtime]);

  async function handleSend(body) {
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      senderId: user.id,
      senderRole: user.role,
      type: "TEXT",
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    try {
      const saved = await sendMessage(id, body, tokenRef.current);
      // NOT a plain "replace the optimistic entry with `saved`": the
      // server broadcasts a new message to every participant in the room,
      // INCLUDING the sender's own socket (see broadcast.js) — so when
      // realtime is on, the "message:new" handler above can already have
      // merged `saved` into `messages` by the time this REST response
      // comes back (WebSocket push routinely beats an awaited fetch back
      // to the client). A naive `.map` swap would then leave BOTH the
      // socket-merged copy and this newly-mapped copy in the array, same
      // id, rendered twice. Dropping the optimistic placeholder and then
      // merging `saved` by id is idempotent regardless of which arrives
      // first — reproduced and confirmed by a user report of exactly this
      // duplicate-bubble symptom before this fix (see chat-room.test.js's
      // "reported bug" regression test).
      setMessages((prev) =>
        mergeById(
          prev.filter((m) => m.id !== optimisticId),
          [saved],
        ),
      );
    } catch (err) {
      // Roll the optimistic bubble back out rather than leaving a message
      // on screen that was never actually persisted.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError(err.message);
    }
  }

  // No optimistic bubble here, unlike handleSend: there's nothing to show
  // until the file is actually uploaded (a local preview would need its own
  // object URL and reconciliation), and an upload is slow enough that the
  // composer's own disabled/sending state is the honest feedback.
  async function handleAttach(file, caption) {
    try {
      const saved = await uploadChatAttachment(
        id,
        file,
        caption,
        tokenRef.current,
      );
      // Merged by id for the same reason handleSend does it — the socket
      // echo of this very message may already have landed.
      setMessages((prev) => mergeById(prev, [saved]));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function handleLoadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await listMessages(
        id,
        { before: olderCursor, limit: PAGE_SIZE },
        tokenRef.current,
      );
      setMessages((prev) => [...[...page.items].reverse(), ...prev]);
      setOlderCursor(page.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOlder(false);
    }
  }

  const locked = conversation?.status === "LOCKED";

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div className="flex items-center gap-3 border-b border-gray-200 pb-3">
          <Link
            href="/chat"
            aria-label="กลับไปที่กล่องข้อความ"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <span
              className="material-symbols-outlined text-[20px]"
              aria-hidden="true"
            >
              arrow_back
            </span>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-gray-900">
              {otherName || (error ? "ไม่พบการสนทนา" : "กำลังโหลด...")}
            </h1>
            {otherRoleLabel && (
              <p className="text-xs text-gray-500">{otherRoleLabel}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {!error && conversation && (
          <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex-1 overflow-y-auto px-4">
              {olderCursor && (
                <div className="pt-3 text-center">
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    disabled={loadingOlder}
                    className="text-xs font-medium text-emerald-600 hover:underline disabled:text-gray-400"
                  >
                    {loadingOlder ? "กำลังโหลด..." : "โหลดข้อความเก่ากว่านี้"}
                  </button>
                </div>
              )}
              <MessageList messages={messages} currentUserId={user?.id} />
              {otherTyping && (
                <p className="pb-2 text-xs italic text-gray-400">
                  กำลังพิมพ์...
                </p>
              )}
            </div>
            {locked ? (
              <p className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
                การสนทนานี้ถูกล็อกไว้ ไม่สามารถส่งข้อความเพิ่มได้
              </p>
            ) : (
              <MessageComposer
                onSend={handleSend}
                onAttach={handleAttach}
                onTyping={handleTyping}
              />
            )}
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
