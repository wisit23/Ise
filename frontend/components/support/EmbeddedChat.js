"use client";
import config from "../../lib/customerServiceConfig";

import { useCallback, useEffect, useRef, useState } from "react";
import MessageList from "../chat/MessageList";
import MessageComposer from "../chat/MessageComposer";
import TypingIndicator from "../chat/TypingIndicator";
import { useChatSocket, useChatSocketEvent } from "../chat/ChatSocketProvider";
import { listMessages, sendMessage, markRead } from "../../lib/chat";
import { uploadChatAttachment } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";

const PAGE_SIZE = config.pagination.messages;

function mergeById(existing, incoming) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** A compact, self-contained chat window meant to be embedded inside a
 * workspace panel (TicketCasePanel, DisputeChatPanel, etc.).
 *
 * Unlike the full chat room page, this component does NOT include NavBar,
 * ChatSidebar, or the room header — just the message list and composer.
 * It connects to the shared ChatSocketProvider already mounted by the app
 * layout, so no extra socket connections are created.
 *
 * Props:
 *  - conversationId: The chat-service conversation ID to display.
 *  - maxHeight: CSS max-height for the chat container (default "400px").
 */
export default function EmbeddedChat({
  conversationId,
  maxHeight = "400px",
  readOnly = false,
  draftKey,
  onBusyChange,
  hideInternal = false,
  onAccessDenied,
  recipientId,
  otherName = "ผู้ใช้",
  onCommitted,
  recipientLabel,
}) {
  const [user] = useState(() => getStoredUser());
  const [messages, setMessages] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [peerOnline, setPeerOnline] = useState(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimer = useRef(null);

  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const tokenRef = useRef(getAccessToken());
  const roomJoinedRef = useRef(null);
  const activeRoom = useRef(conversationId);
  activeRoom.current = conversationId;
  useEffect(() => {
    activeRoom.current = conversationId;
    return () => {
      activeRoom.current = null;
    };
  }, [conversationId]);

  const { socket, connected } = useChatSocket();
  useEffect(() => {
    setPeerOnline(null);
    setPeerTyping(false);
    return () => clearTimeout(typingTimer.current);
  }, [conversationId, recipientId]);

  // ── Scroll to bottom helper ──
  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (smooth && typeof el.scrollTo === "function") {
        el.scrollTo({ top: el.scrollHeight + 500, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    if (peerTyping) scrollToBottom(true);
  }, [peerTyping, scrollToBottom]);

  // ── Load messages on mount / conversationId change ──
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setOlderCursor(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setOlderCursor(null);
    setError("");
    setLocked(false);
    roomJoinedRef.current = null;

    const token = getAccessToken();
    tokenRef.current = token;

    listMessages(conversationId, { limit: PAGE_SIZE }, token)
      .then((page) => {
        if (cancelled) return;
        setMessages(
          [...page.items]
            .filter(
              (message) => !hideInternal || message.visibility !== "INTERNAL",
            )
            .reverse(),
        );
        setOlderCursor(page.nextCursor);
        setLoading(false);
        scrollToBottom(false);
        markRead(conversationId, token).catch(() => {});
      })
      .catch((err) => {
        if (!cancelled) {
          if ([403, 409].includes(err.status)) {
            setLocked(true);
            onAccessDenied?.();
          }
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, scrollToBottom, retry, hideInternal]);

  // ── Socket room join / leave ──
  useEffect(() => {
    if (!socket || !connected || !conversationId) return;
    if (roomJoinedRef.current === conversationId) return;

    let active = true;
    socket.emit("join", conversationId, (ack) => {
      if (active && ack?.ok) {
        roomJoinedRef.current = conversationId;
        if (typeof ack.onlineUsers?.[recipientId] === "boolean")
          setPeerOnline(ack.onlineUsers[recipientId]);
      }
    });

    return () => {
      active = false;
      clearTimeout(typingTimer.current);
      socket.emit("typing:stop", conversationId);
      // Leave even if the join acknowledgement is still in flight.
      socket.emit("leave", conversationId);
      if (roomJoinedRef.current === conversationId)
        roomJoinedRef.current = null;
      setPeerTyping(false);
    };
  }, [socket, connected, conversationId, recipientId]);
  useChatSocketEvent("presence", (data) => {
    if (data.userId === recipientId) {
      setPeerOnline(Boolean(data.online));
      if (!data.online) setPeerTyping(false);
    }
  });
  useChatSocketEvent("typing", (data) => {
    if (
      data.userId === user?.id ||
      (recipientId && data.userId !== recipientId) ||
      (data.conversationId && data.conversationId !== conversationId)
    )
      return;
    clearTimeout(typingTimer.current);
    setPeerTyping(Boolean(data.typing));
    if (data.typing)
      typingTimer.current = setTimeout(
        () => setPeerTyping(false),
        config.timing.typingExpiryMs,
      );
  });

  // ── Realtime: new messages ──
  useChatSocketEvent("message:new", (msg) => {
    if (msg.conversationId !== conversationId) return;
    if (hideInternal && msg.visibility === "INTERNAL") return;
    setMessages((prev) => {
      // Deduplicate optimistic messages by matching clientId or body+sender
      const isDuplicate = prev.some(
        (m) => m.id === msg.id || (m.clientId && m.clientId === msg.clientId),
      );
      if (isDuplicate) {
        return prev.map((m) =>
          m.clientId && m.clientId === msg.clientId ? msg : m,
        );
      }
      return [...prev, msg];
    });
    scrollToBottom(true);
    markRead(conversationId, tokenRef.current).catch(() => {});
  });

  // ── Realtime: conversation status change (e.g. LOCKED) ──
  useChatSocketEvent("conversation:status", (data) => {
    if (data.conversationId !== conversationId) return;
    if (data.status === "LOCKED") setLocked(true);
    else if (data.status === "ACTIVE") setLocked(false);
  });

  // ── Send message ──
  async function handleSend(text) {
    if (!text?.trim() || !conversationId || readOnly || locked)
      throw new Error("ไม่สามารถส่งข้อความในห้องนี้ได้");
    const token = tokenRef.current || getAccessToken();
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      clientId: optimisticId,
      conversationId,
      senderId: user?.id,
      senderRole: "USER",
      type: "TEXT",
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom(true);

    try {
      const saved = await sendMessage(conversationId, text, token);
      if (activeRoom.current !== conversationId) return;
      onCommitted?.();
      setMessages((prev) =>
        mergeById(
          prev.filter((m) => m.id !== optimisticId),
          [saved],
        ),
      );
    } catch (err) {
      if (activeRoom.current !== conversationId) throw err;
      if ([403, 409].includes(err.status)) {
        setLocked(true);
        onAccessDenied?.();
      }
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError(`ส่งข้อความไม่สำเร็จ: ${err.message}`);
      throw err;
    }
  }

  // ── Attach file ──
  async function handleAttach(file, caption) {
    if (!file || !conversationId || readOnly || locked)
      throw new Error("ไม่สามารถส่งไฟล์ในห้องนี้ได้");
    const token = tokenRef.current || getAccessToken();
    try {
      const saved = await uploadChatAttachment(
        conversationId,
        file,
        caption,
        token,
      );
      if (activeRoom.current !== conversationId) return;
      onCommitted?.();
      setMessages((prev) => mergeById(prev, [saved]));
      scrollToBottom(true);
    } catch (err) {
      if (activeRoom.current !== conversationId) throw err;
      if ([403, 409].includes(err.status)) {
        setLocked(true);
        onAccessDenied?.();
      }
      setError(`ส่งไฟล์ไม่สำเร็จ: ${err.message}`);
      throw err;
    }
  }

  // ── Load older messages ──
  async function handleLoadOlder() {
    if (!olderCursor || loadingOlder || !conversationId) return;
    setLoadingOlder(true);
    try {
      const page = await listMessages(
        conversationId,
        { before: olderCursor, limit: PAGE_SIZE },
        tokenRef.current,
      );
      if (activeRoom.current !== conversationId) return;
      setMessages((prev) => [
        ...[...page.items]
          .filter(
            (message) => !hideInternal || message.visibility !== "INTERNAL",
          )
          .reverse(),
        ...prev,
      ]);
      setOlderCursor(page.nextCursor);
    } catch (err) {
      if (activeRoom.current === conversationId) setError(err.message);
    } finally {
      if (activeRoom.current === conversationId) setLoadingOlder(false);
    }
  }

  // ── Typing indicator ──
  function handleTyping(isTyping) {
    if (!socket || !connected || !conversationId || readOnly || locked) return;
    socket.emit(isTyping ? "typing:start" : "typing:stop", conversationId);
  }

  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-8 text-slate-400">
        <span className="material-symbols-outlined text-[28px]">
          chat_bubble_outline
        </span>
        <p className="text-xs font-medium">ยังไม่มีห้องแชท</p>
        <p className="text-[11px] text-slate-400">
          ตั๋วนี้สร้างก่อนระบบแชทเปิดใช้งาน
        </p>
      </div>
    );
  }

  return (
    <div
      style={{ maxHeight }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50/30"
    >
      {recipientId && peerOnline !== null && connected && (
        <p className="border-b bg-white px-3 py-2 text-xs text-slate-500">
          {otherName} · {peerOnline ? "ออนไลน์" : "ออฟไลน์"}
        </p>
      )}
      {/* Error */}
      {error && (
        <div className="border-b border-red-100 bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-600">
          {error}
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="ml-3 min-h-11 underline"
          >
            ลองโหลดประวัติอีกครั้ง
          </button>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pt-2 pb-2">
        {loading ? (
          <div className="flex flex-col justify-end space-y-3 py-6 animate-pulse">
            <div className="flex items-start gap-2">
              <div className="h-7 w-7 rounded-full bg-gray-200" />
              <div className="h-8 w-36 rounded-2xl bg-gray-200/80" />
            </div>
            <div className="flex justify-end">
              <div className="h-8 w-28 rounded-2xl bg-emerald-100/80" />
            </div>
          </div>
        ) : (
          <>
            {olderCursor && (
              <div className="py-1.5 text-center">
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  className="rounded-full bg-white border border-gray-200 px-3 py-0.5 text-[11px] font-semibold text-emerald-600 shadow-xs hover:bg-emerald-50 disabled:text-emerald-300"
                >
                  {loadingOlder ? "กำลังโหลด..." : "ข้อความเก่ากว่านี้"}
                </button>
              </div>
            )}

            <MessageList
              messages={messages}
              currentUserId={user?.id}
              otherName={otherName}
              resolveSenderName={
                recipientId
                  ? (message) =>
                      message.senderId === recipientId
                        ? otherName
                        : ["AGENT", "ADMIN", "TRUST_AND_SAFETY"].includes(
                              message.senderRole,
                            )
                          ? `เจ้าหน้าที่ #${message.senderId?.slice(0, 8) || "ไม่ระบุ"}`
                          : otherName
                  : undefined
              }
              activeRoomId={conversationId}
            />
            <TypingIndicator typing={peerTyping && !locked} name={otherName} />
            <div ref={endRef} className="h-2 shrink-0" aria-hidden="true" />
          </>
        )}
      </div>

      {/* Composer / Locked */}
      <div className="shrink-0 border-t border-slate-200 bg-white">
        {recipientLabel && (
          <p
            role="status"
            className="truncate px-4 pt-2 text-[11px] font-medium text-slate-600"
            title={recipientLabel}
          >
            {recipientLabel}
          </p>
        )}
        {locked || readOnly ? (
          <div className="px-3 py-2 text-center text-[11px] font-medium text-slate-400">
            {locked
              ? "การสนทนานี้ถูกปิดแล้ว คุณดูประวัติได้ แต่ส่งข้อความไม่ได้"
              : "ดูประวัติแบบอ่านอย่างเดียว"}
          </div>
        ) : (
          <MessageComposer
            key={draftKey || conversationId}
            draftKey={draftKey}
            onBusyChange={onBusyChange}
            onSend={handleSend}
            onAttach={handleAttach}
            onTyping={handleTyping}
            disabled={loading}
          />
        )}
      </div>
    </div>
  );
}
