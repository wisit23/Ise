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

export default // ─── Admin Inbox Section ────────────────────────────────────────────────────────

function AdminInboxSection({ token }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN"); // NEW, OPEN, RESOLVED, etc.
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [reportReason, setReportReason] = useState("");
  const [reportDecision, setReportDecision] = useState("");

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

    // Fetch ESCALATED tickets
    const params = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      scope: "all",
      status: "ESCALATED",
    });
    if (q) params.set("q", q);

    const pTickets = apiFetch(`/api/support/tickets/queue?${params}`, {
      token,
    }).catch(() => ({ items: [], totalPages: 1 }));

    // Fetch Reports
    const repParams = new URLSearchParams();
    repParams.set("status", statusFilter || "OPEN");
    const pReports = apiFetch(`/api/auth/admin/reports?${repParams}`, {
      token,
    }).catch(() => ({ items: [], totalPages: 1 }));

    Promise.all([pTickets, pReports])
      .then(([tData, rData]) => {
        let merged = tData.items || [];
        if (rData && rData.items) {
          const mapped = rData.items.map((r) => ({
            id: r.id,
            _type: "REPORT",
            ticketNumber: `REP-${r.id.slice(0, 6).toUpperCase()}`,
            subject: r.reason || "รายงาน",
            requesterId: r.reporterId,
            priority: "URGENT",
            status:
              r.status === "OPEN"
                ? "NEW"
                : r.status === "REVIEWED"
                  ? "IN_PROGRESS"
                  : "RESOLVED",
            // Report rows use `reportedAt`, not `createdAt` (see the Report
            // model) — using the wrong field here produced "Invalid Date" in
            // the table and broke the merged sort (NaN comparisons).
            createdAt: r.reportedAt,
            rawReport: r,
          }));
          merged = [...merged, ...mapped].sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
          );
        }
        setItems(merged);
        setTotalPages(Math.max(tData.totalPages || 1, rData.totalPages || 1));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, q, statusFilter, token, refreshKey]);

  function refreshAfterAction() {
    setRefreshKey((k) => k + 1);
    if (selectedTicket) {
      if (selectedTicket._type === "REPORT") {
        closeTicket();
      } else {
        apiFetch(`/api/support/tickets/${selectedTicket.id}`, { token })
          .then(setSelectedTicket)
          .catch((err) => setActionError(err.message));
      }
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

  async function handleReportAction(e) {
    e.preventDefault();
    if (!selectedTicket || selectedTicket._type !== "REPORT") return;
    if (!reportDecision) {
      setActionError("กรุณาเลือกการตัดสินใจ");
      return;
    }
    if (!reportReason.trim()) {
      setActionError("กรุณาระบุเหตุผล");
      return;
    }

    setActionBusy(true);
    setActionError("");
    try {
      // A report must pass through REVIEWED before it can be actioned
      // (reportService.actionReport enforces the OPEN -> REVIEWED ->
      // ACTIONED|DISMISSED lifecycle strictly) — this inbox opens straight
      // on OPEN reports, so review it first if it hasn't been already.
      if (selectedTicket.rawReport.status === "OPEN") {
        await apiFetch(`/api/auth/admin/reports/${selectedTicket.id}/review`, {
          method: "POST",
          token,
        });
      }
      await apiFetch(`/api/auth/admin/reports/${selectedTicket.id}/action`, {
        method: "POST",
        token,
        body: { decision: reportDecision, reason: reportReason.trim() },
      });
      setReportDecision("");
      setReportReason("");
      refreshAfterAction();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleBanUser(userId) {
    if (
      !window.confirm("คุณแน่ใจหรือไม่ที่จะระงับบัญชีผู้ใช้นี้? (SUSPEND_USER)")
    )
      return;

    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/auth/admin/bulk`, {
        method: "POST",
        token,
        body: {
          action: "SUSPEND_USER",
          ids: [userId],
          reason: `Banned from Admin Inbox (Ticket: ${selectedTicket?.ticketNumber})`,
        },
      });
      alert("ระงับบัญชีผู้ใช้สำเร็จ");
      refreshAfterAction();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleWarnUser(userId) {
    const reason = window.prompt(
      "เหตุผลในการตักเตือน (จะถูกบันทึกไว้ในประวัติผู้ใช้)",
    );
    if (!reason || !reason.trim()) return;

    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/auth/admin/users/${userId}/warn`, {
        method: "POST",
        token,
        body: { reason: reason.trim() },
      });
      alert("บันทึกการตักเตือนสำเร็จ");
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
              placeholder="ค้นหาเคส..."
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
              { value: "OPEN", label: "รอดำเนินการ (OPEN)" },
              { value: "ACTIONED", label: "จัดการแล้ว (ACTIONED)" },
              { value: "DISMISSED", label: "ยกเลิกแล้ว (DISMISSED)" },
              { value: "", label: "ทั้งหมด (ALL)" },
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
                    {t._type === "REPORT" ? (
                      <Badge
                        text="ด่วนที่สุด (CRITICAL)"
                        style="bg-red-100 text-red-700 border border-red-200"
                      />
                    ) : (
                      <Badge
                        text={PRIORITY_LABEL[t.priority] || t.priority}
                        style={
                          PRIORITY_STYLE[t.priority] ||
                          "bg-gray-100 text-gray-600"
                        }
                      />
                    )}
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
          className={`fixed inset-0 z-[100] flex justify-end bg-slate-900/50 backdrop-blur-sm ${
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

            {selectedTicket._type === "REPORT" ? (
              <div className="flex-1 overflow-y-auto bg-slate-50 p-7">
                <div className="bg-white border border-red-100 rounded-xl p-6 shadow-sm mb-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 bg-red-50 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
                  <h3 className="font-bold text-lg text-slate-900 mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-500">
                      warning
                    </span>
                    รายงานปัญหาร้ายแรง (REPORT)
                  </h3>
                  <div className="space-y-3">
                    <div className="flex gap-4">
                      <span className="w-24 text-sm font-medium text-slate-500">
                        ผู้รายงาน:
                      </span>
                      <span className="text-sm font-mono">
                        {selectedTicket.rawReport.reporterId}
                      </span>
                    </div>
                    {selectedTicket.rawReport.targetId && (
                      <div className="flex gap-4">
                        <span className="w-24 text-sm font-medium text-slate-500">
                          ผู้ใช้เป้าหมาย:
                        </span>
                        <span className="text-sm font-mono text-red-600">
                          {selectedTicket.rawReport.targetId}
                        </span>
                      </div>
                    )}
                    {selectedTicket.rawReport.productId && (
                      <div className="flex gap-4">
                        <span className="w-24 text-sm font-medium text-slate-500">
                          สินค้าเป้าหมาย:
                        </span>
                        <span className="text-sm font-mono text-red-600">
                          {selectedTicket.rawReport.productId}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-4 pt-3 border-t border-slate-100 mt-3">
                      <span className="w-24 text-sm font-medium text-slate-500">
                        รายละเอียด:
                      </span>
                      <span className="text-sm font-medium text-slate-800">
                        {selectedTicket.rawReport.reason}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedTicket.rawReport.status !== "ACTIONED" &&
                selectedTicket.rawReport.status !== "DISMISSED" ? (
                  <form
                    onSubmit={handleReportAction}
                    className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"
                  >
                    <h4 className="font-bold text-slate-900 mb-4">
                      พิจารณาและจัดการ
                    </h4>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        การตัดสินใจ
                      </label>
                      <select
                        value={reportDecision}
                        onChange={(e) => setReportDecision(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      >
                        <option value="">-- เลือกการตัดสินใจ --</option>
                        {selectedTicket.rawReport.targetId && (
                          <option value="SUSPEND_USER">
                            ระงับบัญชีผู้ใช้ (SUSPEND_USER)
                          </option>
                        )}
                        {selectedTicket.rawReport.targetId && (
                          <option value="WARN_USER">
                            ตักเตือนผู้ใช้ ไม่ระงับบัญชี (WARN_USER)
                          </option>
                        )}
                        {selectedTicket.rawReport.productId && (
                          <option value="REMOVE_PRODUCT">
                            ลบสินค้า (REMOVE_PRODUCT)
                          </option>
                        )}
                        <option value="DISMISS">
                          ยกเลิกรายงาน / ไม่พบความผิด (DISMISS)
                        </option>
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        หมายเหตุ (ภายใน / ส่งให้ผู้ใช้)
                      </label>
                      <textarea
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        rows={3}
                        placeholder="ระบุเหตุผลในการตัดสินใจ..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      />
                    </div>

                    {actionError && (
                      <p className="mb-4 text-sm text-red-600">{actionError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {actionBusy ? "กำลังดำเนินการ..." : "ยืนยันการพิจารณา"}
                    </button>
                  </form>
                ) : (
                  <div className="bg-slate-100 text-slate-500 text-center py-6 rounded-xl text-sm font-medium border border-slate-200">
                    เคสนี้ถูกพิจารณาและปิดไปแล้ว
                  </div>
                )}
              </div>
            ) : (
              <>
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
                        <span className="italic text-slate-300">
                          ยังไม่มอบหมาย
                        </span>
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
                          {new Date(
                            selectedTicket.createdAt,
                          ).toLocaleDateString("th-TH", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Requester card — the person who filed the ticket. Not
                  necessarily who's at fault, so it gets its own actions
                  rather than being assumed to be the wrongdoer. */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <span className="material-symbols-outlined text-[15px]">
                          person
                        </span>
                        ผู้แจ้ง (Requester)
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleWarnUser(selectedTicket.requesterId)
                          }
                          disabled={actionBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            warning
                          </span>
                          ตักเตือน
                        </button>
                        <button
                          onClick={() =>
                            handleBanUser(selectedTicket.requesterId)
                          }
                          disabled={actionBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            block
                          </span>
                          แบนผู้ใช้นี้
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-base shadow">
                        {selectedTicket.requesterId
                          ?.slice(0, 1)
                          .toUpperCase() ?? "U"}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          รหัส:{" "}
                          {selectedTicket.requesterId?.slice(0, 16) ?? "—"}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">
                          {selectedTicket.requesterId}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Counterparty card — only exists when the requester tied the
                  ticket to one of their orders on submission (see
                  frontend/app/support/tickets/page.js), which lets us derive
                  the other party of that transaction. This is who Admin
                  usually actually needs to act against (e.g. "seller never
                  shipped my order"), not the requester above. */}
                  {selectedTicket.targetId && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-5 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-600">
                          <span className="material-symbols-outlined text-[15px]">
                            gavel
                          </span>
                          คู่กรณี (Target)
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleWarnUser(selectedTicket.targetId)
                            }
                            disabled={actionBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              warning
                            </span>
                            ตักเตือน
                          </button>
                          <button
                            onClick={() =>
                              handleBanUser(selectedTicket.targetId)
                            }
                            disabled={actionBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              block
                            </span>
                            แบนผู้ใช้นี้
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold text-base shadow">
                          {selectedTicket.targetId.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            รหัส: {selectedTicket.targetId.slice(0, 16)}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono">
                            {selectedTicket.targetId}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

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
                        {selectedTicket.requesterId
                          ?.slice(0, 1)
                          .toUpperCase() ?? "U"}
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
