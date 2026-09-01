/* eslint-disable no-unused-vars */
"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Pagination from "../../Pagination";

import Badge from "../../panel/ui/Badge";
import KpiCard from "../../panel/ui/KpiCard";
import ChartCard from "../../panel/ui/ChartCard";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  AGENT_NEXT_STATUS,
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_STYLE,
  ORDER_STATUS_LABEL,
  HELP_CATEGORIES,
  DONUT_PRIORITY_COLORS,
  DONUT_DISPUTE_COLORS,
  PAGE_SIZE,
} from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";

export default // ─── Tickets Section ──────────────────────────────────────────────────────────

function TicketsSection({ token, statusFilter, setStatusFilter, userRole }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  function closeTicket() {
    setClosingTicket(true);
    setTimeout(() => {
      setSelectedTicket(null);
      setClosingTicket(false);
      setActionError("");
    }, 280);
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      scope: "all",
    });
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    apiFetch(`/api/support/tickets/queue?${params}`, { token })
      .then((data) => {
        setItems(data.items || []);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, q, statusFilter, priorityFilter, token, refreshKey]);

  function refreshAfterAction() {
    setRefreshKey((k) => k + 1);
    if (selectedTicket) {
      apiFetch(`/api/support/tickets/${selectedTicket.id}`, { token })
        .then(setSelectedTicket)
        .catch((err) => setActionError(err.message));
    }
  }

  async function handleAssign() {
    if (!selectedTicket) return;
    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/support/tickets/${selectedTicket.id}/assign`, {
        method: "POST",
        token,
      });
      refreshAfterAction();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStatusChange(status) {
    if (!selectedTicket) return;
    const reason =
      status === "ESCALATED"
        ? window.prompt("เหตุผลที่ยกระดับ (ไม่บังคับ)")
        : null;
    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/support/tickets/${selectedTicket.id}/status`, {
        method: "PATCH",
        token,
        body: { status, reason: reason || undefined },
      });
      refreshAfterAction();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <>
      <div className="animate-fade-in-up flex flex-col min-h-full">
        {/* Search & Filters */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQ(qInput);
              setPage(1);
            }}
            className="relative flex-1"
          >
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-400">
              search
            </span>
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search tickets..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium outline-none shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 hover:border-slate-300"
            />
          </form>
          <DropdownFilter
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "สถานะทั้งหมด" },
              { value: "NEW", label: "ตั๋วใหม่" },
              { value: "ASSIGNED", label: "มอบหมายแล้ว" },
              { value: "IN_PROGRESS", label: "กำลังดำเนินการ" },
              { value: "PENDING_USER", label: "รอลูกค้าตอบกลับ" },
              { value: "RESOLVED", label: "แก้ไขสำเร็จ" },
              { value: "CLOSED", label: "ปิดตั๋วแล้ว" },
              // ESCALATED is deliberately excluded — those tickets are handed
              // off to Admin and only ever browsable from "เคสระดับแอดมิน"
              // (AdminInboxSection), not the general Tickets tab.
            ]}
          />
          <DropdownFilter
            value={priorityFilter}
            onChange={(v) => {
              setPriorityFilter(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "ความสำคัญทั้งหมด" },
              { value: "LOW", label: "ต่ำ" },
              { value: "NORMAL", label: "ปานกลาง" },
              { value: "HIGH", label: "สูง" },
              { value: "URGENT", label: "ด่วนที่สุด" },
            ]}
          />
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
          <table className="w-full min-w-[750px] border-collapse text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-transparent text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-4 text-left">Ticket ID</th>
                <th className="px-5 py-4 text-left">รหัสลูกค้า (ID)</th>
                <th className="px-5 py-4 text-left">หัวข้อปัญหา</th>
                <th className="px-5 py-4">ความสำคัญ</th>
                <th className="px-5 py-4">สถานะ</th>
                <th className="px-5 py-4">ผู้รับผิดชอบ</th>
                <th className="px-5 py-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-sm font-medium text-slate-400"
                  >
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-sm font-medium text-slate-400"
                  >
                    ไม่มีตั๋วในหมวดนี้
                  </td>
                </tr>
              )}
              {items.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className="group hover:bg-slate-50/80 hover:shadow-sm transition-all duration-200 cursor-pointer"
                >
                  <td className="px-5 py-4 font-mono text-[13px] font-semibold tracking-tight text-slate-500 text-left">
                    {t.ticketNumber}
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700 text-left">
                    {t.requesterId?.slice(0, 12) ?? "—"}
                  </td>
                  <td className="max-w-[200px] truncate px-5 py-4 text-sm font-medium text-slate-900 group-hover:text-emerald-700 transition-colors text-left">
                    {t.subject}
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      text={PRIORITY_LABEL[t.priority] || t.priority}
                      style={
                        PRIORITY_STYLE[t.priority] ||
                        "bg-gray-100 text-gray-600"
                      }
                    />
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      text={TICKET_STATUS_LABEL[t.status] || t.status}
                      style={
                        TICKET_STATUS_STYLE[t.status] ||
                        "bg-slate-100 text-slate-600"
                      }
                    />
                  </td>
                  <td className="px-5 py-4 text-xs font-medium text-slate-500">
                    {t.assigneeId ? (
                      t.assigneeId.slice(0, 12)
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs font-medium text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString("th-TH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-right text-xs font-medium text-slate-400">
          คลิกที่แถวตั๋วเพื่อเปิดหน้าต่างแชท (Chat) เพื่อจัดการคำร้อง
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {selectedTicket && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeTicket()}
          className={`fixed inset-0 z-drawer flex justify-end bg-slate-900/50 backdrop-blur-sm ${
            closingTicket ? "animate-fade-out" : "animate-fade-in"
          }`}
        >
          <div
            className={`w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 ${
              closingTicket
                ? "animate-slide-out-right"
                : "animate-slide-in-right"
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 bg-white px-7 py-5">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-mono text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                    {selectedTicket.ticketNumber}
                  </span>
                  <Badge
                    text={
                      TICKET_STATUS_LABEL[selectedTicket.status] ||
                      selectedTicket.status
                    }
                    style={
                      TICKET_STATUS_STYLE[selectedTicket.status] ||
                      "bg-slate-100 text-slate-600"
                    }
                  />
                  <Badge
                    text={
                      PRIORITY_LABEL[selectedTicket.priority] ||
                      selectedTicket.priority
                    }
                    style={
                      PRIORITY_STYLE[selectedTicket.priority] ||
                      "bg-slate-100 text-slate-600"
                    }
                  />
                </div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {selectedTicket.subject}
                </h2>
              </div>
              <button
                onClick={closeTicket}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full aspect-square text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] leading-none block">
                  close
                </span>
              </button>
            </div>

            {/* Info Strip */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/70">
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  ผู้แจ้ง (Requester)
                </p>
                <p className="font-mono text-xs font-semibold text-slate-700 truncate">
                  {selectedTicket.requesterId?.slice(0, 14) ?? "—"}
                </p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  ผู้รับผิดชอบ (Agent)
                </p>
                <p className="font-mono text-xs font-semibold text-slate-700 truncate">
                  {selectedTicket.assigneeId ? (
                    selectedTicket.assigneeId.slice(0, 14)
                  ) : (
                    <span className="italic text-slate-300">ยังไม่มอบหมาย</span>
                  )}
                </p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  วันที่เปิด
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  {new Date(selectedTicket.createdAt).toLocaleDateString(
                    "th-TH",
                    { year: "numeric", month: "long", day: "numeric" },
                  )}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 bg-slate-50/30">
              {/* Subject detail card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">
                    info
                  </span>
                  สาระคำร้อง
                </h3>
                <p className="text-sm text-slate-800 leading-relaxed font-medium">
                  {selectedTicket.subject}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">
                    รหัส:{" "}
                    <span className="font-semibold text-slate-600">
                      {selectedTicket.ticketNumber}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">
                    เปิด:{" "}
                    <span className="font-semibold text-slate-600">
                      {new Date(selectedTicket.createdAt).toLocaleDateString(
                        "th-TH",
                        { day: "numeric", month: "long", year: "numeric" },
                      )}
                    </span>
                  </span>
                </div>
              </div>

              {/* Requester card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">
                    person
                  </span>
                  ข้อมูลผู้แจ้ง
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-base shadow">
                    {selectedTicket.requesterId?.slice(0, 1).toUpperCase() ??
                      "U"}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      รหัส: {selectedTicket.requesterId?.slice(0, 16) ?? "—"}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">
                      {selectedTicket.requesterId}
                    </p>
                  </div>
                </div>
              </div>

              {/* Agent assignment card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">
                    support_agent
                  </span>
                  เจ้าหน้าที่รับผิดชอบ
                </h3>
                {selectedTicket.assigneeId ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-base shadow">
                      <span className="material-symbols-outlined text-[20px]">
                        support_agent
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        รหัส: {selectedTicket.assigneeId.slice(0, 16)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">
                        {selectedTicket.assigneeId}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-4 py-3">
                    <span className="material-symbols-outlined text-amber-400 text-[22px]">
                      person_search
                    </span>
                    <p className="text-sm text-amber-700 font-medium">
                      ยังไม่ได้มอบหมายเจ้าหน้าที่
                    </p>
                  </div>
                )}
              </div>

              {/* Chat placeholder - Coming Soon */}
              <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-500">
                  <span className="material-symbols-outlined text-[15px]">
                    chat
                  </span>
                  สนทนากับลูกค้า
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold shadow">
                    {selectedTicket.requesterId?.slice(0, 1).toUpperCase() ??
                      "U"}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">
                      ผู้ใช้: #{selectedTicket.requesterId?.slice(0, 12)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      กำลังพัฒนาระบบแชท
                    </p>
                  </div>
                  <button className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 opacity-50 cursor-not-allowed">
                    <span className="material-symbols-outlined text-[16px]">
                      chat
                    </span>
                    แชท (Soon)
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">
                    build
                  </span>
                  จัดการคำร้อง (Actions)
                </h3>
                {actionError && (
                  <p className="mb-3 text-xs font-semibold text-red-600">
                    {actionError}
                  </p>
                )}
                {(() => {
                  const nextStatuses =
                    AGENT_NEXT_STATUS[selectedTicket.status] || [];
                  return (
                    <div className="flex gap-2">
                      {!selectedTicket.assigneeId && (
                        <button
                          onClick={handleAssign}
                          disabled={actionBusy}
                          className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          รับงาน (Assign)
                        </button>
                      )}
                      {nextStatuses.includes("CLOSED") && (
                        <button
                          onClick={() => handleStatusChange("CLOSED")}
                          disabled={actionBusy}
                          className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          ปิดงาน (Close)
                        </button>
                      )}
                      {nextStatuses.includes("ESCALATED") && (
                        <button
                          onClick={() => handleStatusChange("ESCALATED")}
                          disabled={actionBusy}
                          className="flex-1 rounded-lg bg-red-50 text-red-600 py-2.5 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          ส่งต่อ Admin
                        </button>
                      )}
                      {nextStatuses.length === 0 &&
                        selectedTicket.assigneeId && (
                          <p className="text-xs font-medium text-slate-400">
                            ไม่มีการดำเนินการเพิ่มเติมสำหรับสถานะนี้
                          </p>
                        )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
