"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MessageList from "../../../chat/MessageList";
import MessageComposer from "../../../chat/MessageComposer";
import {
  useChatSocket,
  useChatSocketEvent,
} from "../../../chat/ChatSocketProvider";
import { listMessages, sendMessage, markRead } from "../../../../lib/chat";
import { uploadChatAttachment } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
} from "../../../../lib/supportConstants";
import Badge from "../../../panel/ui/Badge";

const PAGE_SIZE = 30;

function mergeById(existing, incoming) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

export default function SupportMainChat({
  ticket,
  loadingTicket,
  onAssignTicket,
  assigning,
  showDetails,
  onToggleDetails,
  onBackToQueue,
}) {
  const [user] = useState(() => getStoredUser());
  const [messages, setMessages] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);

  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const tokenRef = useRef(getAccessToken());
  const roomJoinedRef = useRef(null);
  const initialPresenceMapRef = useRef({});

  const { socket, connected } = useChatSocket();
  const conversationId = ticket?.conversationId;

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

  // ── Load messages on conversationId change ──
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setOlderCursor(null);
      setLoading(false);
      setLocked(ticket?.status === "CLOSED");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setOlderCursor(null);
    setError("");
    setLocked(ticket?.status === "CLOSED");
    roomJoinedRef.current = null;

    const token = getAccessToken();
    tokenRef.current = token;

    listMessages(conversationId, { limit: PAGE_SIZE }, token)
      .then((page) => {
        if (cancelled) return;
        setMessages([...page.items].reverse());
        setOlderCursor(page.nextCursor);
        setLoading(false);
        scrollToBottom(false);
        markRead(conversationId, token).catch(() => {});
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, ticket?.status, scrollToBottom]);

  // ── Join socket room ──
  useEffect(() => {
    if (!socket || !connected || !conversationId) return;
    if (roomJoinedRef.current === conversationId) return;

    socket.emit("join", { conversationId }, (ack) => {
      if (ack?.ok) {
        roomJoinedRef.current = conversationId;
        if (ack.onlineUsers) {
          ack.onlineUsers.forEach((uId) => {
            initialPresenceMapRef.current[uId] = true;
          });
          if (
            ticket?.requesterId &&
            ack.onlineUsers.includes(ticket.requesterId)
          ) {
            setOtherOnline(true);
          }
        }
      }
    });

    return () => {
      if (roomJoinedRef.current === conversationId) {
        socket.emit("leave", { conversationId });
        roomJoinedRef.current = null;
      }
    };
  }, [socket, connected, conversationId, ticket?.requesterId]);

  // ── Presence query for requester ──
  useEffect(() => {
    if (!ticket?.requesterId || !socket || !connected) return;
    socket.emit("presence:query", { userIds: [ticket.requesterId] }, (res) => {
      if (res?.presence && res.presence[ticket.requesterId] !== undefined) {
        setOtherOnline(Boolean(res.presence[ticket.requesterId]));
      }
    });
  }, [ticket?.requesterId, socket, connected]);

  // ── Socket event listeners ──
  useChatSocketEvent("presence", ({ userId, online }) => {
    if (userId === ticket?.requesterId) {
      setOtherOnline(Boolean(online));
    }
  });

  useChatSocketEvent("message:new", (msg) => {
    if (msg.conversationId !== conversationId) return;
    setMessages((prev) => {
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

  useChatSocketEvent("typing", ({ userId, typing }) => {
    if (userId === ticket?.requesterId) {
      setOtherTyping(typing);
      if (typing) scrollToBottom(true);
    }
  });

  useChatSocketEvent("conversation:status", (data) => {
    if (data.conversationId !== conversationId) return;
    if (data.status === "LOCKED") setLocked(true);
    else if (data.status === "ACTIVE") setLocked(false);
  });

  // ── Send message ──
  async function handleSend(text) {
    if (!text?.trim() || !conversationId) return;
    const token = tokenRef.current || getAccessToken();
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      clientId: optimisticId,
      conversationId,
      senderId: user?.id,
      senderRole: "AGENT",
      type: "TEXT",
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom(true);

    try {
      const saved = await sendMessage(conversationId, text, token);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...saved, clientId: optimisticId } : m,
        ),
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    }
  }

  // ── Attach file ──
  async function handleAttach(file, caption) {
    if (!file || !conversationId) return;
    const token = tokenRef.current || getAccessToken();
    try {
      const saved = await uploadChatAttachment(
        conversationId,
        file,
        caption,
        token,
      );
      setMessages((prev) => mergeById(prev, [saved]));
      scrollToBottom(true);
    } catch {
      setError("ส่งไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    }
  }

  // ── Load older ──
  async function handleLoadOlder() {
    if (!olderCursor || loadingOlder || !conversationId) return;
    setLoadingOlder(true);
    try {
      const page = await listMessages(
        conversationId,
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

  function handleTyping(isTyping) {
    if (!socket || !conversationId) return;
    socket.emit(isTyping ? "typing:start" : "typing:stop", { conversationId });
  }

  if (loadingTicket) {
    return (
      <div
        className="flex flex-1 flex-col bg-white"
        aria-busy="true"
        aria-label="กำลังโหลดตั๋ว"
      >
        <div className="h-[73px] animate-pulse border-b border-slate-200 px-4 py-3">
          <div className="h-5 w-48 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-72 max-w-full rounded bg-slate-100" />
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          กำลังโหลดบทสนทนา...
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="hidden flex-1 flex-col items-center justify-center bg-slate-50 p-8 text-center text-slate-400 md:flex">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
          <span className="material-symbols-outlined text-[32px]">
            chat_bubble_outline
          </span>
        </div>
        <h2 className="text-sm font-bold text-slate-700">
          ยังไม่ได้เลือกตั๋วสนทนา
        </h2>
        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          กรุณาเลือกตั๋วจากคิวด้านซ้ายมือเพื่อเริ่มการสนทนาสดกับลูกค้า
        </p>
      </div>
    );
  }

  const isAssigned = Boolean(ticket.assigneeId);

  return (
    <section className="flex min-w-0 flex-1 flex-col h-full overflow-hidden bg-white">
      {/* ── Room Header ── */}
      <div className="z-10 flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToQueue}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="กลับไปที่คิวงาน"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-bold text-white shadow-xs">
            {ticket.requesterId?.slice(0, 1).toUpperCase() || "U"}
            <span
              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                otherOnline ? "bg-emerald-500" : "bg-slate-300"
              }`}
              title={otherOnline ? "ออนไลน์" : "ออฟไลน์"}
            />
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-bold text-slate-900">
                {ticket.subject}
              </h2>
              <Badge
                text={TICKET_STATUS_LABEL[ticket.status] || ticket.status}
                style={
                  TICKET_STATUS_STYLE[ticket.status] ||
                  "bg-slate-100 text-slate-600"
                }
              />
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-bold text-indigo-600">
                {ticket.ticketNumber}
              </span>
              <span>•</span>
              <span className="truncate font-medium text-slate-600">
                ผู้แจ้ง #{ticket.requesterId?.slice(0, 12)} ·{" "}
                {otherOnline ? "ออนไลน์" : "ออฟไลน์"}
              </span>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href={`/support/tickets/${ticket.id}`}
            target="_blank"
            className="hidden min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 lg:flex"
            title="เปิดหน้ารายละเอียดตั๋วแบบเต็มในแท็บใหม่"
          >
            <span>ดูตั๋วเต็ม</span>
            <span className="material-symbols-outlined text-[15px]">
              open_in_new
            </span>
          </Link>

          <button
            type="button"
            onClick={onToggleDetails}
            aria-expanded={showDetails}
            aria-controls="support-case-details"
            aria-label="รายละเอียด Ticket"
            className={`flex min-h-11 items-center gap-1 rounded-lg border px-3 text-xs font-semibold transition ${
              showDetails
                ? "bg-slate-100 border-slate-300 text-slate-800"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            title="ซ่อน/แสดงรายละเอียดเคส"
          >
            <span className="material-symbols-outlined text-[16px]">
              dock_to_left
            </span>
            <span className="hidden sm:inline">รายละเอียด</span>
          </button>
        </div>
      </div>

      {/* ── Error Notification ── */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* ── Messages Stream ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-slate-50/40 px-3 py-4 sm:px-6"
      >
        {!conversationId ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400">
            <span className="material-symbols-outlined text-[36px] mb-2 text-slate-300">
              speaker_notes_off
            </span>
            <p className="text-sm font-semibold text-slate-700">
              ไม่มีห้องแชทสดสำหรับตั๋วนี้
            </p>
            <p className="mt-1 text-xs text-slate-500">
              คุณยังเปิดรายละเอียดเพื่อตรวจสอบและจัดการ Ticket นี้ได้
            </p>
            <button
              type="button"
              onClick={onToggleDetails}
              className="mt-4 min-h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              เปิดรายละเอียด Ticket
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col justify-end space-y-4 py-8 animate-pulse">
            <div className="flex items-start gap-3 max-w-[60%]">
              <div className="h-9 w-9 rounded-full bg-slate-200 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-10 w-48 rounded-2xl bg-slate-200" />
              </div>
            </div>
            <div className="flex justify-end">
              <div className="h-10 w-56 rounded-2xl bg-emerald-100" />
            </div>
          </div>
        ) : (
          <>
            {olderCursor && (
              <div className="py-2 text-center">
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  className="rounded-full bg-white border border-slate-200 px-4 py-1 text-xs font-semibold text-emerald-600 shadow-2xs hover:bg-emerald-50 disabled:text-emerald-300"
                >
                  {loadingOlder ? "กำลังโหลด..." : "โหลดข้อความก่อนหน้านี้"}
                </button>
              </div>
            )}

            <MessageList
              messages={messages}
              currentUserId={user?.id}
              otherName="ลูกค้า"
              activeRoomId={conversationId}
            />

            {/* Typing Indicator */}
            {otherTyping && (
              <div className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500 animate-fade-in">
                <span className="material-symbols-outlined text-[16px] text-emerald-500 animate-pulse">
                  edit
                </span>
                <span>ลูกค้ากำลังพิมพ์ข้อความ...</span>
              </div>
            )}

            <div ref={endRef} className="h-4 shrink-0" aria-hidden="true" />
          </>
        )}
      </div>

      {/* ── Footer / Composer ── */}
      <div className="shrink-0 border-t border-slate-200 bg-white">
        {locked ? (
          <div className="bg-slate-50/90 px-4 py-3.5 text-center text-xs font-medium text-slate-500">
            🔒 การสนทนานี้ถูกปิดแล้ว (ตั๋วสถานะ: {ticket.status})
          </div>
        ) : !isAssigned ? (
          <div className="flex flex-col items-stretch gap-3 border-t border-amber-200 bg-amber-50/90 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
              <span className="material-symbols-outlined text-[20px] text-amber-600">
                assignment_ind
              </span>
              <span>รับงานก่อนจึงจะเริ่มตอบลูกค้าได้</span>
            </div>
            <button
              type="button"
              onClick={onAssignTicket}
              disabled={assigning}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {assigning ? "กำลังรับงาน..." : "รับงานนี้"}
            </button>
          </div>
        ) : (
          <MessageComposer
            onSend={handleSend}
            onAttach={handleAttach}
            onTyping={handleTyping}
            disabled={loading || !conversationId}
          />
        )}
      </div>
    </section>
  );
}
