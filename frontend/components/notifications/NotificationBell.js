"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "../../lib/auth";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "../../lib/notifications";
import { useChatSocket, useChatSocketEvent } from "../chat/ChatSocketProvider";
import ReportDecisionModal from "./ReportDecisionModal";


function formatRelativeTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return "เมื่อสักครู่";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
}

const TYPE_CONFIG = {
  LIKE: {
    icon: "favorite",
    color: "bg-pink-100 text-pink-700",
    badgeLabel: "ถูกใจ",
  },
  DISCOUNT: {
    icon: "confirmation_number",
    color: "bg-amber-100 text-amber-700",
    badgeLabel: "ส่วนลด",
  },
  AUCTION: {
    icon: "gavel",
    color: "bg-purple-100 text-purple-700",
    badgeLabel: "การประมูล",
  },
  ORDER: {
    icon: "shopping_bag",
    color: "bg-emerald-100 text-emerald-700",
    badgeLabel: "คำสั่งซื้อ",
  },
  DISPUTE: {
    icon: "warning",
    color: "bg-rose-100 text-rose-700",
    badgeLabel: "ข้อพิพาท",
  },
  REVIEW: {
    icon: "rate_review",
    color: "bg-teal-100 text-teal-700",
    badgeLabel: "ความคิดเห็น",
  },
  REPORT: {
    icon: "flag",
    color: "bg-amber-100 text-amber-700",
    badgeLabel: "รายงาน",
  },
  SYSTEM: {
    icon: "notifications",
    color: "bg-blue-100 text-blue-700",
    badgeLabel: "ระบบ",
  },
};

export default function NotificationBell({ user }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // 'all' | 'unread'
  const [selectedReportDecision, setSelectedReportDecision] = useState(null);
  const dropdownRef = useRef(null);

  const buttonRef = useRef(null);
  const { connected: socketConnected } = useChatSocket();

  const loadUnreadCount = useCallback(() => {
    const token = getAccessToken();
    if (!token || !user) return;
    getUnreadNotificationCount(token)
      .then((data) => setUnreadCount(data.total || 0))
      .catch((err) =>
        console.error("โหลดจำนวนการแจ้งเตือนไม่สำเร็จ:", err),
      );
  }, [user]);

  const loadNotificationList = useCallback(() => {
    const token = getAccessToken();
    if (!token || !user) return;
    setLoading(true);
    getNotifications(token, { limit: 40 })
      .then((data) => {
        setNotifications(data.items || []);
      })
      .catch((err) =>
        console.error("โหลดรายการการแจ้งเตือนไม่สำเร็จ:", err),
      )
      .finally(() => setLoading(false));
  }, [user]);

  // Initial load on mount or user change
  useEffect(() => {
    if (user) {
      loadUnreadCount();
    } else {
      setUnreadCount(0);
      setNotifications([]);
    }
  }, [user, loadUnreadCount]);

  // Load list when dropdown is opened
  useEffect(() => {
    if (open && user) {
      loadNotificationList();
    }
  }, [open, user, loadNotificationList]);

  // Re-read count on socket reconnect
  useEffect(() => {
    if (socketConnected && user) {
      loadUnreadCount();
    }
  }, [socketConnected, user, loadUnreadCount]);

  // Real-time socket event: receive new or updated notification instantly
  useChatSocketEvent("notification:new", (newNotif) => {
    if (!user) return;
    setNotifications((prev) => {
      const incoming = {
        id: newNotif.id || `notif-${Date.now()}`,
        userId: newNotif.userId,
        type: newNotif.type || "SYSTEM",
        title: newNotif.title,
        message: newNotif.message,
        link: newNotif.link,
        metadata: newNotif.metadata,
        entityId: newNotif.entityId,
        read: false,
        createdAt: newNotif.createdAt || new Date().toISOString(),
      };

      const isSameEntity = (n) => {
        if (!n) return false;
        if (newNotif.id && n.id === newNotif.id) return true;
        const targetIds = [
          newNotif.entityId,
          newNotif.metadata?.orderId,
          newNotif.metadata?.auctionId,
        ].filter(Boolean);
        const currentIds = [
          n.entityId,
          n.metadata?.orderId,
          n.metadata?.auctionId,
        ].filter(Boolean);
        return targetIds.some((id) => currentIds.includes(id));
      };

      const existingIndex = prev.findIndex(isSameEntity);

      if (existingIndex >= 0) {
        const wasRead = prev[existingIndex].read;
        if (wasRead) {
          setUnreadCount((c) => c + 1);
        }
        const updated = prev.filter(
          (n, idx) => idx !== existingIndex && !isSameEntity(n),
        );
        return [incoming, ...updated];
      }

      setUnreadCount((prev) => prev + 1);
      return [incoming, ...prev];
    });
  });

  // Click outside and escape key handling
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function handleNotificationClick(notif) {
    const token = getAccessToken();
    if (!notif.read && token) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      markNotificationRead(token, notif.id).catch(() => {});
    }

    const isReportResult =
      notif.type === "REPORT" ||
      notif.type === "DISPUTE" ||
      Boolean(notif.metadata?.decision) ||
      Boolean(notif.metadata?.reportId) ||
      Boolean(notif.metadata?.disputeId) ||
      (notif.title &&
        (notif.title.includes("ผลการ") ||
          notif.title.includes("รายงาน") ||
          notif.title.includes("ข้อพิพาท") ||
          notif.title.includes("ระงับ") ||
          notif.title.includes("คำเตือน")));

    if (isReportResult) {
      setOpen(false);
      setSelectedReportDecision(notif);
      return;
    }

    setOpen(false);
    const orderId = notif.metadata?.orderId || notif.entityId;
    let targetLink = notif.link;

    if (!targetLink && notif.type === "ORDER" && orderId) {
      targetLink = `/orders?orderId=${orderId}`;
    }

    if (targetLink) {
      if (
        user?.role === "SELLER" &&
        notif.type === "ORDER" &&
        orderId &&
        (targetLink.startsWith("/seller/dashboard") ||
          targetLink.startsWith("/products/"))
      ) {
        targetLink = `/seller/dashboard?section=orders&orderId=${orderId}`;
      } else if (
        notif.type === "ORDER" &&
        orderId &&
        (targetLink === "/orders" || targetLink.startsWith("/orders?"))
      ) {
        targetLink = `/orders?orderId=${orderId}`;
      }

      if (user?.role === "SELLER" && notif.type === "AUCTION") {
        const isCancellation =
          notif.metadata?.event?.includes("cancelled") ||
          notif.metadata?.event?.includes("rejected") ||
          notif.title?.includes("ยกเลิก") ||
          notif.title?.includes("ไม่อนุมัติ") ||
          notif.title?.includes("ปฏิเสธ");
        if (isCancellation || targetLink.startsWith("/auctions")) {
          targetLink = "/seller/auctions";
        }
      }

      if (notif.type === "ORDER" && orderId && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("reloop:open-order-detail", {
            detail: { orderId },
          }),
        );
      }

      router.push(targetLink);
    }
  }

  async function handleDeleteNotification(e, notif) {
    e.stopPropagation();
    const token = getAccessToken();
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    if (!notif.read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    if (token) {
      deleteNotification(token, notif.id).catch((err) => {
        console.error("ลบการแจ้งเตือนไม่สำเร็จ:", err);
      });
    }
  }


  async function handleMarkAllAsRead() {
    const token = getAccessToken();
    if (!token) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead(token);
    } catch (err) {
      console.error("อ่านการแจ้งเตือนทั้งหมดไม่สำเร็จ:", err);
    }
  }

  const readCount = Math.max(0, notifications.length - unreadCount);

  const displayedNotifications =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : filter === "read"
        ? notifications.filter((n) => n.read)
        : notifications;

  if (!user) return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`การแจ้งเตือน${unreadCount > 0 ? ` มี ${unreadCount} รายการที่ยังไม่อ่าน` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring relative grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-surface-panel hover:text-ink"
      >
        <span
          className="material-symbols-outlined text-[20px] sm:text-[21px] leading-none"
          aria-hidden="true"
        >
          notifications
        </span>
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="หน้าต่างการแจ้งเตือน"
          className="fixed inset-x-3 top-[68px] max-w-[400px] mx-auto sm:inset-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-[400px] sm:max-w-none sm:mx-0 z-dropdown rounded-2xl border border-line bg-white shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col max-h-[calc(100dvh-80px)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface-subtle/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink text-sm sm:text-base">
                การแจ้งเตือน
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                  {unreadCount} ใหม่
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1 transition"
              >
                <span className="material-symbols-outlined text-[15px]">
                  done_all
                </span>
                <span>อ่านทั้งหมด</span>
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-line bg-surface-subtle/20 px-4 pt-1 gap-4 text-xs font-medium">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`pb-2 border-b-2 transition ${filter === "all" ? "border-brand-600 text-brand-600 font-semibold" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              ทั้งหมด ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`pb-2 border-b-2 transition ${filter === "unread" ? "border-brand-600 text-brand-600 font-semibold" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              ยังไม่อ่าน ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("read")}
              className={`pb-2 border-b-2 transition ${filter === "read" ? "border-brand-600 text-brand-600 font-semibold" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              อ่านแล้ว ({readCount})
            </button>
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] flex-1 overflow-y-auto divide-y divide-line/60">
            {loading && notifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-ink-muted">
                กำลังโหลดการแจ้งเตือน...
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-12 text-center text-ink-muted flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-[36px] text-ink-subtle">
                  notifications_off
                </span>
                <span className="text-xs">
                  {filter === "unread"
                    ? "ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน"
                    : filter === "read"
                      ? "ยังไม่มีการแจ้งเตือนที่อ่านแล้ว"
                      : "ไม่มีการแจ้งเตือนในขณะนี้"}
                </span>
              </div>
            ) : (
              displayedNotifications.map((notif) => {
                const orderReason = notif.type === "ORDER" && typeof notif.metadata?.reason === "string"
                  ? notif.metadata.reason.trim()
                  : "";
                const config =
                  TYPE_CONFIG[notif.type] || TYPE_CONFIG.SYSTEM;
                const isReportResult =
                  notif.type === "REPORT" ||
                  notif.type === "DISPUTE" ||
                  Boolean(notif.metadata?.decision) ||
                  Boolean(notif.metadata?.reportId) ||
                  Boolean(notif.metadata?.disputeId) ||
                  (notif.title &&
                    (notif.title.includes("ผลการ") ||
                      notif.title.includes("รายงาน") ||
                      notif.title.includes("ข้อพิพาท") ||
                      notif.title.includes("ระงับ") ||
                      notif.title.includes("คำเตือน")));
                const isAuctionCancelled =
                  notif.type === "AUCTION" &&
                  (notif.metadata?.event?.includes("cancelled") ||
                    notif.metadata?.event?.includes("rejected") ||
                    notif.title?.includes("ยกเลิก") ||
                    notif.title?.includes("ไม่อนุมัติ") ||
                    notif.title?.includes("ปฏิเสธ"));

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        handleNotificationClick(notif);
                      }
                    }}
                    className={`group relative w-full text-left p-3.5 flex items-start gap-3 transition cursor-pointer hover:bg-surface-subtle/80 ${!notif.read ? "bg-brand-50/30" : "bg-white"}`}
                  >
                    <div
                      className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${
                        isAuctionCancelled ? "bg-rose-100 text-rose-700" : config.color
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {config.icon}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 pr-6">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-ink line-clamp-1">
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-ink-subtle shrink-0">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>
                      {orderReason && (
                        <p className="mt-1.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-md bg-rose-50 px-2 py-1.5 text-xs leading-relaxed text-rose-800">
                          <span className="font-semibold">เหตุผล: </span>
                          {orderReason}
                        </p>
                      )}
                      {isReportResult ? (
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md hover:bg-amber-100 transition">
                          <span className="material-symbols-outlined text-[13px]">
                            gavel
                          </span>
                          <span>ดูรายละเอียดผลการตัดสิน</span>
                        </span>
                      ) : (notif.link || (notif.type === "ORDER" && (notif.metadata?.orderId || notif.entityId))) ? (
                        <span className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-brand-600">
                          <span>
                            {user?.role === "SELLER" && isAuctionCancelled
                              ? "ไปที่หน้าจัดการประมูล"
                              : "ดูรายละเอียด"}
                          </span>
                          <span className="material-symbols-outlined text-[13px]">
                            chevron_right
                          </span>
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleDeleteNotification(e, notif)}
                        className="p-1 text-ink-subtle hover:text-rose-600 hover:bg-rose-50 rounded-full transition opacity-70 group-hover:opacity-100 focus:opacity-100"
                        title="ลบการแจ้งเตือนนี้"
                        aria-label="ลบการแจ้งเตือน"
                      >
                        <span className="material-symbols-outlined text-[15px] leading-none block">
                          close
                        </span>
                      </button>
                      {!notif.read && (
                        <span
                          className="h-2 w-2 rounded-full bg-brand-600"
                          title="ยังไม่ได้อ่าน"
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <ReportDecisionModal
        open={Boolean(selectedReportDecision)}
        onClose={() => setSelectedReportDecision(null)}
        notification={selectedReportDecision}
      />
    </div>
  );
}

