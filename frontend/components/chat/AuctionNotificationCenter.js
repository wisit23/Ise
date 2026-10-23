"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import {
  getConversation,
  hasUnread,
  listConversations,
  listMessages,
  markRead,
} from "../../lib/chat";
import {
  getAccessToken,
  getCurrentRoles,
  getStoredUser,
  isCustomerAccountRoles,
} from "../../lib/auth";
import { useChatSocket, useChatSocketEvent } from "./ChatSocketProvider";

const FALLBACK_POLL_INTERVAL_MS = 15000;

function notificationSummary(message) {
  if (typeof message?.payload?.summary === "string") {
    return message.payload.summary;
  }

  const labels = {
    "auction.item_rejected": "รายการประมูลถูกปฏิเสธ",
    "auction.item_cancelled": "รายการประมูลถูกยกเลิก",
    "auction.round_cancelled": "รอบประมูลถูกยกเลิก",
    "auction.round_updated": "เวลารอบประมูลมีการเปลี่ยนแปลง",
    "auction.winner_assigned": "คุณชนะการประมูล",
    "auction.winner_promoted": "คุณได้รับเลื่อนเป็นผู้ชนะการประมูล",
    "auction.payment_expired": "สิทธิ์ชำระเงินประมูลสิ้นสุดแล้ว",
    "auction.seller_winner_assigned": "สินค้าประมูลมีผู้ชนะแล้ว",
    "auction.seller_winner_changed": "ผู้ชนะและราคาประมูลถูกเปลี่ยนแล้ว",
    "auction.action_required": "สินค้าประมูลรอให้ผู้ขายดำเนินการ",
  };
  return labels[message?.payload?.event] || "มีการเปลี่ยนแปลงเกี่ยวกับการประมูล";
}

export default function AuctionNotificationCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const { connected } = useChatSocket();
  const [token, setToken] = useState(() => getAccessToken());
  const [notification, setNotification] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledgeError, setAcknowledgeError] = useState("");
  const requestRevision = useRef(0);
  const handledMessageIds = useRef(new Set());

  useEffect(() => {
    const syncToken = () => setToken(getAccessToken());
    window.addEventListener("reloop:auth", syncToken);
    window.addEventListener("storage", syncToken);
    window.addEventListener("focus", syncToken);
    return () => {
      window.removeEventListener("reloop:auth", syncToken);
      window.removeEventListener("storage", syncToken);
      window.removeEventListener("focus", syncToken);
    };
  }, []);

  useEffect(() => {
    requestRevision.current += 1;
    handledMessageIds.current.clear();
    setNotification(null);
    setAcknowledgeError("");
  }, [token]);

  const showLatestMessage = useCallback(
    async (conversationId, currentToken = token) => {
      if (!currentToken || pathname === `/chat/${conversationId}`) return;
      const revision = ++requestRevision.current;
      const page = await listMessages(
        conversationId,
        { limit: 1 },
        currentToken,
      );
      const message = page.items?.[0];
      if (
        revision !== requestRevision.current ||
        handledMessageIds.current.has(message?.id) ||
        message?.type !== "SYSTEM" ||
        !String(message?.payload?.event || "").startsWith("auction.")
      ) {
        return;
      }
      setNotification({ conversationId, message });
    },
    [pathname, token],
  );

  const refreshUnreadAuction = useCallback(async () => {
    const currentToken = token || getAccessToken();
    const userId = getStoredUser()?.id;
    if (
      !currentToken ||
      !userId ||
      !isCustomerAccountRoles(getCurrentRoles()) ||
      notification
    ) {
      return;
    }
    const result = await listConversations(currentToken, {
      contextType: "AUCTION",
    });
    const unreadConversation = (result.items || []).find((conversation) =>
      hasUnread(conversation, userId),
    );
    if (unreadConversation) {
      await showLatestMessage(unreadConversation.id, currentToken);
    }
  }, [notification, showLatestMessage, token]);

  useEffect(() => {
    refreshUnreadAuction().catch(() => {});
  }, [refreshUnreadAuction]);

  useChatSocketEvent("conversation:activity", (activity) => {
    const currentToken = getAccessToken();
    if (
      !currentToken ||
      !activity?.conversationId ||
      !isCustomerAccountRoles(getCurrentRoles())
    ) {
      return;
    }
    getConversation(activity.conversationId, currentToken)
      .then((conversation) => {
        if (conversation?.contextType === "AUCTION") {
          return showLatestMessage(activity.conversationId, currentToken);
        }
        return undefined;
      })
      .catch(() => {});
  });

  useEffect(() => {
    if (!token || connected) return undefined;
    const interval = setInterval(() => {
      if (!document.hidden) refreshUnreadAuction().catch(() => {});
    }, FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [connected, refreshUnreadAuction, token]);

  async function acknowledge() {
    if (!notification || acknowledging) return;
    setAcknowledging(true);
    setAcknowledgeError("");
    try {
      await markRead(notification.conversationId, token || getAccessToken());
      handledMessageIds.current.add(notification.message.id);
      setNotification(null);
      window.dispatchEvent(new CustomEvent("chat:unread-sync"));
    } catch {
      setAcknowledgeError(
        "ยังบันทึกการรับทราบไม่ได้ กรุณาลองอีกครั้งหรือเปิดรายละเอียดในแชท",
      );
    } finally {
      setAcknowledging(false);
    }
  }

  function openChat() {
    if (!notification) return;
    const conversationId = notification.conversationId;
    handledMessageIds.current.add(notification.message.id);
    setNotification(null);
    router.push(`/chat/${conversationId}`);
  }

  return (
    <Modal
      open={Boolean(notification)}
      onClose={acknowledge}
      title="การแจ้งเตือนการประมูล"
      description="รายละเอียดฉบับเต็มและลิงก์รายการอยู่ในแชท"
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={acknowledge}
            loading={acknowledging}
          >
            รับทราบ
          </Button>
          <Button icon="chat" onClick={openChat}>
            เปิดรายละเอียดในแชท
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <span
          className="material-symbols-outlined mt-0.5 text-[24px] text-amber-600"
          aria-hidden="true"
        >
          notifications_active
        </span>
        <p className="min-w-0 break-words text-sm font-semibold leading-relaxed">
          {notificationSummary(notification?.message)}
        </p>
      </div>
      {acknowledgeError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {acknowledgeError}
        </p>
      )}
    </Modal>
  );
}

export { notificationSummary };
