"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import ChatSidebar from "../../components/chat/ChatSidebar";
import { listConversations, setCachedConversations } from "../../lib/chat";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import {
  useChatSocket,
  useChatSocketEvent,
} from "../../components/chat/ChatSocketProvider";

// Only used while the shared socket is NOT connected
const POLL_INTERVAL_MS = 15000;

export default function ChatInboxPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState("");
  const { connected: socketConnected } = useChatSocket();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
    listConversations(token)
      .then((data) => {
        setConversations(data.items);
        setCachedConversations(data.items);
      })
      .catch((err) => setError(err.message));
  }, [router]);

  // Live path: the server nudges every participant's own socket room on any
  // new message, so a new conversation, an updated preview, or an unread
  // dot appears here without the user reloading
  useChatSocketEvent("conversation:activity", () => {
    const token = getAccessToken();
    if (!token) return;
    listConversations(token)
      .then((data) => {
        setConversations(data.items);
        setCachedConversations(data.items);
      })
      .catch(() => {});
  });

  // Fallback path: gated on the socket being down
  useEffect(() => {
    if (!user || socketConnected) return undefined;
    const token = getAccessToken();
    if (!token) return undefined;

    const interval = setInterval(() => {
      if (document.hidden) return;
      listConversations(token)
        .then((data) => setConversations(data.items))
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, socketConnected]);

  // Reconnecting means events were missed while the socket was down
  useEffect(() => {
    if (!user || !socketConnected) return;
    const token = getAccessToken();
    if (!token) return;
    listConversations(token)
      .then((data) => setConversations(data.items))
      .catch(() => {});
  }, [user, socketConnected]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <NavBar />
      <main className="mx-auto flex w-full max-w-7xl flex-1 overflow-hidden p-2 sm:p-4">
        <div className="flex flex-1 h-full overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
          {/* Left Column: Inbox List */}
          <div className="h-full w-full md:w-80 lg:w-96 shrink-0 flex flex-col overflow-hidden border-r border-gray-150">
            <ChatSidebar
              conversations={conversations}
              currentUserId={user?.id}
              activeId={null}
              loading={conversations === null}
              error={error}
            />
          </div>

          {/* Right Column: Empty Selection Canvas (Hidden on Mobile) */}
          <div className="hidden flex-1 h-full flex-col items-center justify-center bg-slate-50/50 p-8 text-center md:flex overflow-hidden">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100/60 text-emerald-600 shadow-2xs mb-4">
              <span className="material-symbols-outlined text-[40px]">
                chat_bubble
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              เลือกการสนทนาเพื่อเริ่มแชท
            </h2>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-gray-400">
              เลือกห้องแชทจากรายการทางซ้าย เพื่อดูข้อความ ต่อรองราคา
              หรือสอบถามข้อมูลสินค้าจากผู้ซื้อและผู้ขาย
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
