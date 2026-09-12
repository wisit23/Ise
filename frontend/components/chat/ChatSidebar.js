"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConversationRow from "./ConversationRow";
import Alert from "../ui/Alert";
import { otherParticipant, hasUnread } from "../../lib/chat";
import { useChatSocket, useChatSocketEvent } from "./ChatSocketProvider";

export default function ChatSidebar({
  conversations,
  currentUserId,
  activeId,
  onSelectConversation,
  loading = false,
  error = "",
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState({});
  const { socket, connected: socketConnected } = useChatSocket();
  const listRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({
    top: 0,
    height: 0,
    opacity: 0,
  });

  const nonSupportConversations = useMemo(() => {
    if (!conversations) return null;
    return conversations.filter((c) => c.contextType !== "SUPPORT");
  }, [conversations]);

  // Query online status for all participants visible in the sidebar
  useEffect(() => {
    if (!socket || !socketConnected || !nonSupportConversations || !currentUserId) return;
    const userIds = nonSupportConversations
      .map((c) => otherParticipant(c, currentUserId)?.userId)
      .filter(Boolean);

    if (userIds.length === 0) return;

    socket.emit("presence:query", { userIds }, (res) => {
      if (res?.presence) {
        setOnlineUsers((prev) => ({ ...prev, ...res.presence }));
      }
    });
  }, [socket, socketConnected, nonSupportConversations, currentUserId]);

  useChatSocketEvent("presence", ({ userId, online }) => {
    if (!userId) return;
    setOnlineUsers((prev) => ({ ...prev, [userId]: Boolean(online) }));
  });

  const unreadTotal = useMemo(() => {
    if (!nonSupportConversations || !currentUserId) return 0;
    return nonSupportConversations.filter(
      (c) => c.id !== activeId && hasUnread(c, currentUserId),
    ).length;
  }, [nonSupportConversations, currentUserId, activeId]);

  const filteredConversations = useMemo(() => {
    if (!nonSupportConversations) return null;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return nonSupportConversations;

    return nonSupportConversations.filter((c) => {
      const other = otherParticipant(c, currentUserId);
      const name = (other?.displayName || "").toLowerCase();
      const preview = (c.lastMessagePreview || "").toLowerCase();
      return name.includes(query) || preview.includes(query);
    });
  }, [nonSupportConversations, searchQuery, currentUserId]);

  useEffect(() => {
    if (!activeId || !listRef.current) {
      setIndicatorStyle((prev) =>
        prev.opacity === 0 ? prev : { ...prev, opacity: 0 },
      );
      return;
    }

    const updateIndicator = () => {
      const activeEl = listRef.current?.querySelector(
        `[data-conversation-id="${activeId}"]`,
      );
      if (activeEl) {
        setIndicatorStyle({
          top: activeEl.offsetTop,
          height: activeEl.offsetHeight || 68,
          opacity: 1,
        });
      } else {
        setIndicatorStyle((prev) =>
          prev.opacity === 0 ? prev : { ...prev, opacity: 0 },
        );
      }
    };

    updateIndicator();
    const frameId = requestAnimationFrame(updateIndicator);
    return () => cancelAnimationFrame(frameId);
  }, [activeId, filteredConversations]);

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden bg-white">
      {/* Sidebar Header */}
      <div className="shrink-0 border-b border-gray-100 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              ข้อความ
            </h1>
            {unreadTotal > 0 && (
              <span
                aria-label={`มี ${unreadTotal} การสนทนาที่ยังไม่ได้อ่าน`}
                className="flex h-5 items-center justify-center rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-800"
              >
                {unreadTotal}
              </span>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400"
            aria-hidden="true"
          >
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาการสนทนา..."
            aria-label="ค้นหาการสนทนา"
            className="w-full rounded-xl border border-gray-200 bg-gray-50/70 py-2 pl-9 pr-8 text-xs text-gray-900 placeholder:text-gray-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="ล้างการค้นหา"
            >
              <span className="material-symbols-outlined text-[16px]">
                close
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Error / Loading / Content */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {loading && !error && (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-center gap-3 animate-pulse">
                <div className="h-11 w-11 rounded-2xl bg-gray-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-28 rounded bg-gray-100" />
                  <div className="h-2.5 w-44 rounded bg-gray-100" />
                </div>
              </div>
            ))}
            <p className="pt-2 text-center text-xs text-gray-400">
              กำลังโหลด...
            </p>
          </div>
        )}

        {filteredConversations?.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-gray-400">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 mb-2">
              <span className="material-symbols-outlined text-[24px]">
                chat_bubble
              </span>
            </div>
            {searchQuery ? (
              <>
                <p className="text-sm font-medium text-gray-600">
                  ไม่พบการสนทนา
                </p>
                <p className="mt-1 text-xs text-gray-400">ลองค้นหาด้วยคำอื่น</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600">
                  ยังไม่มีข้อความ
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  เริ่มคุยกับผู้ขายได้จากหน้าสินค้า
                </p>
              </>
            )}
          </div>
        )}

        {filteredConversations && filteredConversations.length > 0 && (
          <div className="relative">
            {/* Sliding Green Active Indicator (Desktop) */}
            <div
              className="pointer-events-none absolute left-0 z-10 w-1 rounded-r-full bg-emerald-600 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
              style={{
                transform: `translateY(${indicatorStyle.top}px)`,
                height: `${indicatorStyle.height}px`,
                opacity: indicatorStyle.opacity,
              }}
              aria-hidden="true"
            />
            <ul ref={listRef} className="divide-y divide-gray-100/70">
              {filteredConversations.map((c) => {
                const other = otherParticipant(c, currentUserId);
                const isOnline = Boolean(
                  other?.userId && onlineUsers[other.userId],
                );
                return (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    currentUserId={currentUserId}
                    isActive={c.id === activeId}
                    isOnline={isOnline}
                    onSelect={onSelectConversation}
                  />
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
