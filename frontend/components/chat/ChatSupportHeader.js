"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

const STATUS_CONFIG = {
  NEW: {
    label: "รอรับเรื่อง",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: "fiber_new",
  },
  ASSIGNED: {
    label: "รับเรื่องแล้ว",
    className: "bg-sky-50 text-sky-700 border-sky-200",
    icon: "person_check",
  },
  IN_PROGRESS: {
    label: "กำลังดำเนินการ",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: "pending",
  },
  PENDING_USER: {
    label: "รอข้อมูลจากคุณ",
    className: "bg-orange-50 text-orange-700 border-orange-200",
    icon: "hourglass_top",
  },
  RESOLVED: {
    label: "แก้ไขแล้ว",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: "check_circle",
  },
  CLOSED: {
    label: "ปิดเรื่อง",
    className: "bg-gray-100 text-gray-500 border-gray-200",
    icon: "lock",
  },
  ESCALATED: {
    label: "ยกระดับ",
    className: "bg-red-50 text-red-700 border-red-200",
    icon: "priority_high",
  },
};

const PRIORITY_CONFIG = {
  URGENT: { label: "ด่วนมาก", className: "bg-red-100 text-red-700" },
  HIGH: { label: "ด่วน", className: "bg-amber-100 text-amber-700" },
  NORMAL: { label: "ปกติ", className: "bg-slate-100 text-slate-600" },
  LOW: { label: "ต่ำ", className: "bg-gray-100 text-gray-500" },
};

/** Context header for SUPPORT-type conversations. Shows ticket number,
 * subject, status badge, and priority — mirrors the ChatProductHeader's
 * role for PRODUCT conversations. */
export default function ChatSupportHeader({ ticketId }) {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(Boolean(ticketId));

  useEffect(() => {
    if (!ticketId) {
      setTicket(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const token = getAccessToken();
    apiFetch(`/api/support/tickets/${ticketId}`, { token })
      .then((t) => {
        if (!cancelled) {
          setTicket(t);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (!ticketId || (!loading && !ticket)) return null;

  if (loading && !ticket) {
    return (
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-2 text-xs text-gray-400">
        <span className="h-9 w-9 animate-pulse rounded-lg bg-gray-200" />
        <div className="flex-1 space-y-1">
          <div className="h-3.5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.NEW;
  const priorityInfo = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.NORMAL;

  return (
    <div className="shrink-0 sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-100 bg-white/95 px-4 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        {/* Ticket Icon */}
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-indigo-100">
          <span className="material-symbols-outlined text-[22px] text-indigo-500">
            confirmation_number
          </span>
        </div>

        {/* Ticket Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-xs font-bold text-indigo-600">
              {ticket.ticketNumber}
            </span>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusInfo.className}`}
            >
              {statusInfo.label}
            </span>
            {ticket.priority && ticket.priority !== "NORMAL" && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${priorityInfo.className}`}
              >
                {priorityInfo.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-600">
            {ticket.subject}
          </p>
        </div>
      </div>

      {/* View Ticket CTA */}
      <Link
        href={`/support/tickets/${ticket.id}`}
        className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-xs transition hover:border-indigo-400 hover:bg-indigo-50"
      >
        <span>ดูรายละเอียด</span>
        <span
          className="material-symbols-outlined text-[15px]"
          aria-hidden="true"
        >
          open_in_new
        </span>
      </Link>
    </div>
  );
}
