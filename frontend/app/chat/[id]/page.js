"use client";
import ReferenceCode from "../../../components/ui/ReferenceCode";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Alert from "../../../components/ui/Alert";
import MessageList from "../../../components/chat/MessageList";
import MessageComposer from "../../../components/chat/MessageComposer";
import TypingIndicator from "../../../components/chat/TypingIndicator";
import ChatSidebar from "../../../components/chat/ChatSidebar";
import ChatProductHeader from "../../../components/chat/ChatProductHeader";
import ChatSupportHeader from "../../../components/chat/ChatSupportHeader";
import {
  getConversation,
  listMessages,
  listConversations,
  sendMessage,
  markRead,
  otherParticipant,
  participantRoleLabel,
  conversationDisplayName,
  isReadOnlyAuctionConversation,
  getCachedConversations,
  setCachedConversations,
  sendErrorMessage,
} from "../../../lib/chat";
import {
  useChatSocket,
  useChatSocketEvent,
} from "../../../components/chat/ChatSocketProvider";
import {
  mergeMessages,
  useSocketResync,
} from "../../../components/chat/messageSync";
import { apiFetch, uploadChatAttachment } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const PAGE_SIZE = 30;

// In-memory room cache for 0ms instant room transitions
const roomDataCache = new Map();

export default function ChatRoomPage() {
  const { id } = useParams();
  const router = useRouter();
  const [activeRoomId, setActiveRoomId] = useState(id);
  const [user, setUser] = useState(undefined);
  const [conversation, setConversation] = useState(null);
  const [sidebarConversations, setSidebarConversations] = useState(
    () => getCachedConversations() || [],
  );
  const [otherName, setOtherName] = useState("");
  const [messages, setMessages] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [error, setError] = useState("");
  const [realtime, setRealtime] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [autoPrompts, setAutoPrompts] = useState([]);
  const typingExpiryRef = useRef(null);
  useEffect(() => {
    setOtherTyping(false);
    clearTimeout(typingExpiryRef.current);
    return () => clearTimeout(typingExpiryRef.current);
  }, [activeRoomId]);
  const [otherOnline, setOtherOnline] = useState(false);
  const { socket, connected: socketConnected } = useChatSocket();

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const scrollRafRef = useRef(null);
  const tokenRef = useRef(null);
  const initialIdRef = useRef(id);
  const initialPresenceMapRef = useRef({});
  const roomRequestRef = useRef(0);

  useEffect(
    () => () => {
      roomRequestRef.current += 1;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );

  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) {
        if (smooth) {
          if (typeof el.scrollTo === "function") {
            el.scrollTo({
              top: el.scrollHeight + 500,
              behavior: "smooth",
            });
          } else {
            el.scrollTop = el.scrollHeight;
          }
          // After smooth animation finishes, ensure 100% bottom reached with no cutoff
          scrollTimerRef.current = setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop =
                scrollContainerRef.current.scrollHeight;
            }
          }, 250);
        } else {
          el.scrollTop = el.scrollHeight;
        }
      } else if (
        messagesEndRef.current &&
        typeof messagesEndRef.current.scrollIntoView === "function"
      ) {
        messagesEndRef.current.scrollIntoView({
          behavior: smooth ? "smooth" : "auto",
          block: "end",
        });
      }
    });
  }, []);

  const otherParticipantUser =
    conversation && user ? otherParticipant(conversation, user.id) : null;
  const otherUserId = otherParticipantUser?.userId || null;
  const otherUserIdRef = useRef(null);
  otherUserIdRef.current = otherUserId;

  const otherRoleLabel = conversation
    ? participantRoleLabel(
        otherParticipantUser?.role,
        conversation?.contextType,
      )
    : null;

  const selfParticipant =
    conversation && user
      ? conversation.participants?.find((p) => p.userId === user.id)
      : null;
  const selfName =
    selfParticipant?.displayName ||
    user?.firstName ||
    (user?.email ? user.email.split("@")[0] : "คุณ");
  // A buyer is just chatting from their own account, so "ผู้ซื้อ" reads oddly on their own badge.
  const selfRoleLabel = conversation
    ? selfParticipant?.role === "BUYER"
      ? "บัญชี"
      : participantRoleLabel(selfParticipant?.role, conversation?.contextType) || "ผู้ใช้"
    : "ผู้ใช้";

  const updateConversationReadLocally = useCallback(
    (roomId, userId, readTime = new Date().toISOString()) => {
      setSidebarConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== roomId) return c;
          const participants = (c.participants || []).map((p) =>
            p.userId === userId ? { ...p, lastReadAt: readTime } : p,
          );
          return { ...c, participants };
        });
        setCachedConversations(next);
        return next;
      });
    },
    [],
  );

  const loadRoom = useCallback(
    async (roomId, currentUser) => {
      const token = tokenRef.current || getAccessToken();
      if (!token || !roomId || !currentUser) return;
      const requestId = ++roomRequestRef.current;
      try {
        setError("");
        const conv = await getConversation(roomId, token);
        if (requestId !== roomRequestRef.current) return;
        if (conv.contextType?.startsWith("DISPUTE")) {
          router.replace("/orders");
          return;
        }
        setConversation(conv);
        const name = conversationDisplayName(conv, currentUser.id);
        setOtherName(name);

        // If current user is buyer chatting with a seller, fetch seller's auto messages
        const sellerParticipant = conv.participants?.find((p) => p.role === "SELLER");
        const myParticipant = conv.participants?.find((p) => p.userId === currentUser.id);
        const isBuyerUser =
          myParticipant?.role === "BUYER" ||
          (sellerParticipant && sellerParticipant.userId !== currentUser.id);
        if (isBuyerUser && sellerParticipant?.userId) {
          apiFetch(`/api/auth/users/${sellerParticipant.userId}/auto-messages`, { token })
            .then((items) => {
              if (requestId === roomRequestRef.current) {
                setAutoPrompts(Array.isArray(items) ? items : []);
              }
            })
            .catch(() => {
              if (requestId === roomRequestRef.current) setAutoPrompts([]);
            });
        } else {
          setAutoPrompts([]);
        }

        const page = await listMessages(roomId, { limit: PAGE_SIZE }, token);
        if (requestId !== roomRequestRef.current) return;
        const reversed = [...page.items].reverse();
        setMessages(reversed);
        setOlderCursor(page.nextCursor);
        scrollToBottom(false);
        markRead(roomId, token)
          .then(() => {
            updateConversationReadLocally(roomId, currentUser.id);
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("chat:unread-sync"));
            }
          })
          .catch(() => {});
        updateConversationReadLocally(roomId, currentUser.id);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("chat:unread-sync"));
        }

        roomDataCache.set(roomId, {
          conversation: conv,
          messages: reversed,
          olderCursor: page.nextCursor,
          otherName: name,
        });
      } catch (err) {
        if (requestId === roomRequestRef.current) setError(err.message);
      } finally {
        if (requestId === roomRequestRef.current) setRoomLoading(false);
      }
    },
    [updateConversationReadLocally, scrollToBottom, router],
  );

  // Sync ONLY if route param was changed externally by Next.js router
  useEffect(() => {
    if (id && id !== initialIdRef.current) {
      initialIdRef.current = id;
      setActiveRoomId(id);
      const currentUser = user || getStoredUser();
      if (currentUser) {
        loadRoom(id, currentUser);
      }
    }
  }, [id, user, loadRoom]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    tokenRef.current = token;
    const currentUser = getStoredUser();
    setUser(currentUser);
    if (currentUser && activeRoomId) {
      loadRoom(activeRoomId, currentUser);
      // Populate sidebar list on desktop
      listConversations(token)
        .then((data) => {
          const items = (data?.items || []).filter(
            (c) =>
              c.contextType !== "SUPPORT" &&
              !c.contextType?.startsWith("DISPUTE"),
          );
          setSidebarConversations(items);
          setCachedConversations(items);
        })
        .catch(() => {});
    }
  }, [router]);

  const handleSelectConversation = useCallback(
    (newId) => {
      if (newId === activeRoomId) return;
      setActiveRoomId(newId);
      initialPresenceMapRef.current = {};
      setOtherOnline(false);
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", `/chat/${newId}`);
      }

      // Check instant room data cache (0ms instant switch)
      const cached = roomDataCache.get(newId);
      if (cached) {
        setConversation(cached.conversation);
        setMessages(cached.messages);
        setOlderCursor(cached.olderCursor);
        setOtherName(cached.otherName);
        setRoomLoading(false);
        scrollToBottom(false);
      } else {
        setRoomLoading(true);
        setConversation(null);
        setMessages([]);
        setOlderCursor(null);
        const currentUser = user || getStoredUser();
        const target = sidebarConversations.find((c) => c.id === newId);
        if (target && currentUser) {
          setOtherName(conversationDisplayName(target, currentUser.id));
        }
      }

      const currentUser = user || getStoredUser();
      if (currentUser) {
        updateConversationReadLocally(newId, currentUser.id);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("chat:unread-sync"));
        }
        loadRoom(newId, currentUser);
      }
    },
    [
      activeRoomId,
      sidebarConversations,
      user,
      loadRoom,
      updateConversationReadLocally,
      scrollToBottom,
    ],
  );

  useEffect(() => {
    function handlePopState() {
      const match = window.location.pathname.match(/\/chat\/([^/]+)/);
      if (match && match[1] && match[1] !== activeRoomId) {
        const newId = match[1];
        setActiveRoomId(newId);
        initialPresenceMapRef.current = {};
        setOtherOnline(false);
        const cached = roomDataCache.get(newId);
        if (cached) {
          setConversation(cached.conversation);
          setMessages(cached.messages);
          setOlderCursor(cached.olderCursor);
          setOtherName(cached.otherName);
          setRoomLoading(false);
          scrollToBottom(false);
        } else {
          setRoomLoading(true);
          setMessages([]);
          setOlderCursor(null);
        }
        const currentUser = user || getStoredUser();
        if (currentUser) {
          updateConversationReadLocally(newId, currentUser.id);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("chat:unread-sync"));
          }
          loadRoom(newId, currentUser);
        }
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    activeRoomId,
    user,
    loadRoom,
    updateConversationReadLocally,
    scrollToBottom,
  ]);

  // Joins THIS room on the app-wide shared socket
  useEffect(() => {
    if (!user || !activeRoomId || !socket || !socketConnected) {
      setRealtime(false);
      return undefined;
    }
    let cancelled = false;

    function joinRoom() {
      socket.emit("join", activeRoomId, (ack) => {
        if (!cancelled) {
          setRealtime(Boolean(ack?.ok));
          if (ack?.onlineUsers) {
            Object.assign(initialPresenceMapRef.current, ack.onlineUsers);
            const targetId = otherUserIdRef.current;
            if (targetId && ack.onlineUsers[targetId] !== undefined) {
              setOtherOnline(Boolean(ack.onlineUsers[targetId]));
            }
          }
        }
      });
    }

    joinRoom();
    socket.on("connect", joinRoom);

    return () => {
      cancelled = true;
      socket.off("connect", joinRoom);
      socket.emit("leave", activeRoomId);
      setRealtime(false);
    };
  }, [activeRoomId, user, socket, socketConnected]);

  // Query online presence on room load, activeRoomId change, or when socket reconnects
  useEffect(() => {
    if (!otherUserId) return undefined;
    let cancelled = false;

    // If join ack has already provided online status, sync it immediately
    if (initialPresenceMapRef.current[otherUserId] !== undefined) {
      setOtherOnline(Boolean(initialPresenceMapRef.current[otherUserId]));
    }

    if (socket && socketConnected) {
      socket.emit("presence:query", { userIds: [otherUserId] }, (res) => {
        if (
          !cancelled &&
          res?.presence &&
          res.presence[otherUserId] !== undefined
        ) {
          setOtherOnline(Boolean(res.presence[otherUserId]));
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [socket, socketConnected, otherUserId, activeRoomId]);

  useChatSocketEvent("presence", ({ userId: changedUserId, online }) => {
    if (!changedUserId) return;
    initialPresenceMapRef.current[changedUserId] = Boolean(online);
    if (changedUserId === otherUserIdRef.current) {
      setOtherOnline(Boolean(online));
    }
  });

  useChatSocketEvent("message:new", (message) => {
    if (!user || message.conversationId !== activeRoomId) return;
    setMessages((prev) => mergeMessages(prev, [message]));
    scrollToBottom(true);
    if (message.senderId !== user.id) {
      setOtherTyping(false);
      markRead(activeRoomId, tokenRef.current)
        .then(() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("chat:unread-sync"));
          }
        })
        .catch(() => {});
      updateConversationReadLocally(activeRoomId, user.id);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("chat:unread-sync"));
      }
    }
    // Keep desktop sidebar preview fresh on new messages
    const token = tokenRef.current;
    if (token) {
      listConversations(token)
        .then((data) => {
          const items = (data?.items || []).filter(
            (c) => c.contextType !== "SUPPORT",
          );
          setSidebarConversations(items);
          setCachedConversations(items);
        })
        .catch(() => {});
    }
  });

  useChatSocketEvent("typing", ({ userId, typing, conversationId }) => {
    if (!user || userId === user.id || (conversationId && conversationId !== activeRoomId)) return;
    clearTimeout(typingExpiryRef.current);
    setOtherTyping(typing);
    if (typing) {
      typingExpiryRef.current = setTimeout(() => setOtherTyping(false), 6000);
      scrollToBottom(true);
    }
  });

  // Real-time lock/unlock: when CS closes a ticket, chat-service broadcasts
  // conversation:status → the room page immediately hides the composer and
  // shows the locked banner without needing a page refresh.
  useChatSocketEvent("conversation:status", (data) => {
    if (data.conversationId !== activeRoomId) return;
    setConversation((prev) => (prev ? { ...prev, status: data.status } : prev));
  });

  useChatSocketEvent("conversation:activity", () => {
    const token = tokenRef.current;
    if (!token) return;
    listConversations(token)
      .then((data) => {
        const items = (data?.items || []).filter(
          (c) =>
            c.contextType !== "SUPPORT" &&
            !c.contextType?.startsWith("DISPUTE"),
        );
        setSidebarConversations(items);
        setCachedConversations(items);
      })
      .catch(() => {});
  });

  useChatSocketEvent("conversation:deleted", ({ conversationId }) => {
    if (conversationId === activeRoomId) {
      alert("ผลการตัดสินได้รับการรับทราบจากทั้งสองฝ่ายแล้ว ห้องสนทนาข้อพิพาทนี้ถูกปิดและลบออกจากระบบ");
      router.push("/chat");
    }
    setSidebarConversations((prev) =>
      (prev || []).filter((c) => c.id !== conversationId),
    );
  });

  // Auto-scroll when a new message is appended (sent or received)
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (lastMessageId && !loadingOlder) {
      scrollToBottom(true);
    }
  }, [lastMessageId, loadingOlder, scrollToBottom]);

  // Auto-scroll when typing indicator appears
  useEffect(() => {
    if (otherTyping) {
      scrollToBottom(true);
    }
  }, [otherTyping, scrollToBottom]);

  function handleTyping(isTyping) {
    if (isTyping) {
      scrollToBottom(true);
    }
    if (!realtime || !socket || !activeRoomId) return;
    socket.emit(isTyping ? "typing:start" : "typing:stop", activeRoomId);
  }

  // REST is the fallback, not the primary delivery path (CHAT-006): poll
  // while this room isn't joined live, and catch up once it is again, since
  // nothing replays the events missed in between.
  const activeRoomRef = useRef(activeRoomId);
  activeRoomRef.current = activeRoomId;
  const resyncLatest = useCallback(async () => {
    const room = activeRoomRef.current;
    if (!room) return;
    try {
      const page = await listMessages(
        room,
        { limit: PAGE_SIZE },
        tokenRef.current,
      );
      if (activeRoomRef.current !== room) return;
      setMessages((prev) => mergeMessages(prev, page.items));
      markRead(room, tokenRef.current).catch(() => {});
    } catch {
      // Suppress transient poll error
    }
  }, []);
  useSocketResync({
    active: Boolean(user && conversation && activeRoomId),
    live: realtime,
    resync: resyncLatest,
  });

  async function handleSend(body) {
    if (!activeRoomId) return;
    setError("");
    const currentRoom = activeRoomId;
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      clientId: optimisticId,
      senderId: user.id,
      senderRole: user.role,
      type: "TEXT",
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    try {
      const saved = await sendMessage(currentRoom, body, tokenRef.current);
      const savedWithClient = { ...saved, clientId: optimisticId };
      setMessages((prev) =>
        mergeMessages(
          prev.filter((m) => m.id !== optimisticId),
          [savedWithClient],
        ),
      );
      updateConversationReadLocally(currentRoom, user.id);
      if (tokenRef.current) {
        listConversations(tokenRef.current)
          .then((data) => {
            const items = (data?.items || []).filter(
              (c) =>
                c.contextType !== "SUPPORT" &&
                !c.contextType?.startsWith("DISPUTE"),
            );
            setSidebarConversations(items);
            setCachedConversations(items);
          })
          .catch(() => {});
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError(sendErrorMessage(err));
      // MessageComposer catches this to keep the unsent draft in the box.
      throw err;
    }
  }

  async function handleAttach(file, caption) {
    if (!activeRoomId) return;
    try {
      const saved = await uploadChatAttachment(
        activeRoomId,
        file,
        caption,
        tokenRef.current,
      );
      setMessages((prev) => mergeMessages(prev, [saved]));
      scrollToBottom(true);
      updateConversationReadLocally(activeRoomId, user.id);
      if (tokenRef.current) {
        listConversations(tokenRef.current)
          .then((data) => {
            const items = (data?.items || []).filter(
              (c) =>
                c.contextType !== "SUPPORT" &&
                !c.contextType?.startsWith("DISPUTE"),
            );
            setSidebarConversations(items);
            setCachedConversations(items);
          })
          .catch(() => {});
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function handleLoadOlder() {
    if (!olderCursor || loadingOlder || !activeRoomId) return;
    setLoadingOlder(true);
    try {
      const page = await listMessages(
        activeRoomId,
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
  const productId =
    conversation?.contextType === "PRODUCT"
      ? conversation.contextId
      : conversation?.contextType === "AUCTION"
        ? (conversation.productId || messages.find((m) => m.payload?.productId)?.payload?.productId || null)
        : null;
  const auctionId =
    (conversation?.contextType === "AUCTION" ? conversation.contextId : null) ||
    messages.find((m) => m.payload?.auctionId)?.payload?.auctionId ||
    null;
  const supportTicketId =
    conversation?.contextType === "SUPPORT" ? conversation.contextId : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <NavBar />
      <main className="mx-auto flex w-full max-w-7xl flex-1 overflow-hidden p-2 sm:p-4">
        <div className="flex flex-1 h-full overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
          {/* Left Column: Sidebar on Desktop, Hidden on Mobile */}
          <div className="hidden h-full w-80 lg:w-96 shrink-0 flex-col overflow-hidden border-r border-gray-150 md:flex">
            <ChatSidebar
              conversations={sidebarConversations}
              currentUserId={user?.id}
              activeId={activeRoomId}
              onSelectConversation={handleSelectConversation}
              loading={sidebarConversations.length === 0 && !error}
            />
          </div>

          {/* Right Column: Active Chat Room */}
          <div className="flex min-w-0 h-full flex-1 flex-col overflow-hidden bg-slate-50/60">
            {/* Room Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-gray-150 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <Link
                  href="/chat"
                  aria-label="กลับไปที่กล่องข้อความ"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 md:hidden"
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    aria-hidden="true"
                  >
                    arrow_back
                  </span>
                </Link>

                {/* Avatar with live status */}
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-sm font-semibold text-emerald-800 shadow-2xs">
                    {otherName[0]?.toUpperCase() || "?"}
                  </div>
                  <span
                    data-testid="status-indicator-dot"
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white transition-colors duration-200 ${
                      otherOnline ? "bg-emerald-500 shadow-2xs" : "bg-slate-300"
                    }`}
                    aria-hidden="true"
                    title={otherOnline ? "ออนไลน์" : "ออฟไลน์"}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h1
                      className="truncate text-sm font-bold text-gray-900"
                      title={otherName}
                    >
                      {otherName || (error ? "ไม่พบการสนทนา" : "กำลังโหลด...")}
                    </h1>
                    {conversation?.referenceCode && <ReferenceCode value={conversation} className="text-[10px] text-gray-500" />}
                    {otherRoleLabel && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        {otherRoleLabel}
                      </span>
                    )}
                    <span className="text-gray-300 text-xs font-semibold">↔</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
                      <span className="text-gray-400 font-normal">คุณ:</span>
                      <span className="font-semibold">{selfName}</span>
                      {selfRoleLabel && (
                        <span className="text-[10px] text-emerald-600">
                          ({selfRoleLabel})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {otherOnline ? (
                      <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        ออนไลน์
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400 font-medium">
                        ออฟไลน์
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action shortcuts */}
              <div className="flex items-center gap-1">
                <Link
                  href="/chat"
                  aria-label="กลับไปที่กล่องข้อความ"
                  className="hidden min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 md:flex"
                  title="ดูรายการแชททั้งหมด"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    inbox
                  </span>
                  <span className="hidden lg:inline">กล่องข้อความ</span>
                </Link>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="m-4">
                <Alert tone="error">{error}</Alert>
              </div>
            )}

            {/* Sticky Product Header */}
            {productId && (
              <ChatProductHeader
                productId={productId}
                auctionId={auctionId}
              />
            )}
            {/* Sticky Support Ticket Header */}
            {supportTicketId && (
              <ChatSupportHeader ticketId={supportTicketId} />
            )}

            {/* Messages Area - Permanently mounted container */}
            <div className="relative flex flex-1 flex-col overflow-hidden">
              {roomLoading && messages.length === 0 ? (
                <div className="flex flex-1 flex-col justify-end p-4 space-y-4 animate-pulse">
                  <div className="flex items-start gap-2.5 max-w-[70%]">
                    <div className="h-9 w-9 rounded-2xl bg-gray-200 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-9 w-48 rounded-2xl rounded-tl-xs bg-gray-200/80" />
                    </div>
                  </div>
                  <div className="flex items-end justify-end">
                    <div className="h-9 w-44 rounded-2xl rounded-tr-xs bg-emerald-100/80" />
                  </div>
                  <div className="flex items-start gap-2.5 max-w-[70%]">
                    <div className="h-9 w-9 rounded-2xl bg-gray-200 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-12 w-60 rounded-2xl rounded-tl-xs bg-gray-200/80" />
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-y-auto px-4 pt-2 pb-4"
                >
                  <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col">
                    {olderCursor && (
                      <div className="py-2 text-center">
                        <button
                          type="button"
                          onClick={handleLoadOlder}
                          disabled={loadingOlder}
                          className="rounded-full bg-white/90 border border-gray-200 px-3.5 py-1 text-xs font-semibold text-emerald-600 shadow-2xs transition hover:bg-emerald-50 disabled:text-emerald-300"
                        >
                          {loadingOlder
                            ? "กำลังโหลด..."
                            : "โหลดข้อความเก่ากว่านี้"}
                        </button>
                      </div>
                    )}

                    <MessageList
                      messages={messages}
                      currentUserId={user?.id}
                      currentUserRole={
                        conversation?.participants?.find(
                          (p) => p.userId === user?.id,
                        )?.role
                      }
                      otherName={otherName}
                      onPromptClick={handleSend}
                      activeRoomId={activeRoomId}
                      prompts={autoPrompts}
                    />

                    <TypingIndicator typing={otherTyping && !locked} name={otherName} />
                    <div
                      ref={messagesEndRef}
                      className="h-6 shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Quick Prompts Bar for Buyer (if seller has automated questions) */}
            {autoPrompts.length > 0 &&
              !locked &&
              (conversation?.participants?.find((p) => p.userId === user?.id)?.role ===
                "BUYER" ||
                conversation?.participants?.some(
                  (p) => p.role === "SELLER" && p.userId !== user?.id,
                )) && (
                <div className="border-t border-slate-100 bg-emerald-50/50 px-4 py-2">
                  <div className="mx-auto flex max-w-4xl items-center gap-2 overflow-x-auto text-xs">
                    <span className="shrink-0 text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">
                        chat_bubble
                      </span>
                      <span>คำถามด่วน:</span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto py-0.5">
                      {autoPrompts.map((p) => {
                        const text = typeof p === "string" ? p : p.messageText;
                        return (
                          <button
                            key={p.id || text}
                            type="button"
                            onClick={() => handleSend(text)}
                            className="shrink-0 rounded-full border border-emerald-200/90 bg-white px-3 py-1 text-[11px] font-medium text-emerald-700 shadow-2xs hover:border-emerald-400 hover:bg-emerald-50 active:scale-95 transition cursor-pointer"
                          >
                            {text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

            {/* Composer / Locked notice - PERMANENTLY MOUNTED AT THE BOTTOM */}
            <div className="shrink-0 border-t border-gray-150 bg-white">
              {locked ? (
                <div className="bg-gray-50/90 px-4 py-3 text-center text-xs text-gray-500">
                  การสนทนานี้ถูกล็อกไว้ ไม่สามารถส่งข้อความเพิ่มได้
                </div>
              ) : isReadOnlyAuctionConversation(conversation) ? (
                <div
                  data-testid="auction-readonly-banner"
                  className="bg-slate-50 px-4 py-3 text-center text-xs font-medium text-slate-600"
                >
                  ห้องแจ้งเตือนจากระบบฝ่ายการตลาด (อ่านอย่างเดียว
                  ไม่สามารถส่งข้อความตอบกลับได้)
                </div>
              ) : (
                <div className="mx-auto w-full max-w-4xl">
                  <MessageComposer
                    onSend={handleSend}
                    onAttach={handleAttach}
                    onTyping={handleTyping}
                    onFocus={() => scrollToBottom(true)}
                    disabled={roomLoading && !conversation}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
