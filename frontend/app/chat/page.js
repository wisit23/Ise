"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import Alert from "../../components/ui/Alert";
import ConversationRow from "../../components/chat/ConversationRow";
import { listConversations } from "../../lib/chat";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import {
  useChatSocket,
  useChatSocketEvent,
} from "../../components/chat/ChatSocketProvider";

// Only used while the shared socket is NOT connected — see the effect below.
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
      .then((data) => setConversations(data.items))
      .catch((err) => setError(err.message));
  }, [router]);

  // Live path: the server nudges every participant's own socket room on any
  // new message, so a new conversation, an updated preview, or an unread
  // dot appears here without the user reloading — even though this page
  // has no particular conversation open. The whole list is re-read rather
  // than patched in place, because the server already returns it correctly
  // ordered by lastMessageAt and that ordering is exactly what changes.
  useChatSocketEvent("conversation:activity", () => {
    const token = getAccessToken();
    if (!token) return;
    listConversations(token)
      .then((data) => setConversations(data.items))
      .catch(() => {});
  });

  // Fallback path: gated on the socket being down, so the list is never
  // both pushed and polled at the same time.
  useEffect(() => {
    if (!user || socketConnected) return undefined;
    const token = getAccessToken();
    if (!token) return undefined;

    const interval = setInterval(() => {
      if (document.hidden) return;
      listConversations(token)
        .then((data) => setConversations(data.items))
        .catch(() => {
          // A transient poll failure shouldn't blank out an already-loaded
          // list — the next tick just tries again.
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, socketConnected]);

  // Reconnecting means events were missed while the socket was down, so the
  // list has to be re-read at that moment rather than waiting for the next
  // message to arrive.
  useEffect(() => {
    if (!user || !socketConnected) return;
    const token = getAccessToken();
    if (!token) return;
    listConversations(token)
      .then((data) => setConversations(data.items))
      .catch(() => {});
  }, [user, socketConnected]);

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900">ข้อความ</h1>

        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {conversations === null && !error && (
          <p className="mt-6 text-sm text-gray-500">กำลังโหลด...</p>
        )}

        {conversations?.length === 0 && (
          <div className="mt-14 flex flex-col items-center gap-2 text-center text-gray-400">
            <span
              className="material-symbols-outlined text-[40px] text-gray-300"
              aria-hidden="true"
            >
              chat_bubble
            </span>
            <p className="text-sm text-gray-500">ยังไม่มีข้อความ</p>
            <p className="text-xs">เริ่มคุยกับผู้ขายได้จากหน้าสินค้า</p>
          </div>
        )}

        {conversations?.length > 0 && user && (
          <ul className="mt-6 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                currentUserId={user.id}
              />
            ))}
          </ul>
        )}
      </section>
      <Footer />
    </main>
  );
}
