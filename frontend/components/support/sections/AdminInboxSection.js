"use client";

import { useEffect, useRef, useState } from "react";

import Alert from "../../ui/Alert";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { useToast } from "../../ui/ToastProvider";
import AdminInboxTable from "./admin-inbox/AdminInboxTable";
import CaseDrawer from "./case/CaseDrawer";
import ReportCasePanel from "./admin-inbox/ReportCasePanel";
import TicketCasePanel from "./case/TicketCasePanel";
import AdminDisputeAuditPanel from "./admin-inbox/AdminDisputeAuditPanel";
import { PAGE_SIZE } from "../../../lib/supportConstants";
import { apiFetch } from "../../../lib/api";

const DRAWER_EXIT_MS = 280;

/* Admin's escalation queue: escalated support tickets and user reports in one
   list. This component owns the data and the actions; the queue table and the
   report panel live in ./admin-inbox, while the drawer shell and the ticket
   panel are shared with the CS Tickets tab in ./case. */
export default function AdminInboxSection({ token, currentUserId }) {
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [ticketStatus, setTicketStatus] = useState("ESCALATED");
  const [source, setSource] = useState("all");
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const selectionRequest = useRef(0);
  const [closingTicket, setClosingTicket] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [reportReason, setReportReason] = useState("");
  const [reportDecision, setReportDecision] = useState("");

  // Pending moderation action awaiting confirmation, e.g.
  // { kind: "ban" | "warn" | "escalate", userId }. Replaces window.confirm and
  // window.prompt, which blocked the tab and could not be styled or localised.
  const [pendingAction, setPendingAction] = useState(null);

  function closeTicket() {
    selectionRequest.current += 1;
    setClosingTicket(true);
    setTimeout(() => {
      setSelectedTicket(null);
      setConversationId(null);
      setClosingTicket(false);
      setActionError("");
    }, DRAWER_EXIT_MS);
  }

  async function selectCase(item) {
    if (item._type === "DISPUTE") {
      setSelectedDispute(item);
      return;
    }
    const request = ++selectionRequest.current;
    setSelectedTicket(item);
    setConversationId(null);
    setActionError("");
    setReportReason("");
    setReportDecision("");
    if (item._type === "REPORT") return;
    setChatLoading(true);
    try {
      const detail = await apiFetch(`/api/support/tickets/${item.id}`, {
        token,
      });
      if (request !== selectionRequest.current) return;
      setSelectedTicket(detail);
      const room = await apiFetch(`/api/support/tickets/${item.id}/join`, {
        method: "POST",
        token,
      });
      if (request !== selectionRequest.current) return;
      if (!room?.conversationId) throw new Error("ไม่พบห้องสนทนาของคำร้อง");
      setConversationId(room.conversationId);
    } catch (err) {
      if (request === selectionRequest.current) setActionError(err.message);
    } finally {
      if (request === selectionRequest.current) setChatLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);

    const params = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      scope: "all",
    });
    if (q) params.set("q", q);
    if (source === "all" || ticketStatus !== "ALL") params.set("status", source === "all" ? "ESCALATED" : ticketStatus);

    const repParams = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      status: statusFilter || "ALL",
    });
    const disputeParams = new URLSearchParams({ page, limit: PAGE_SIZE, status: "OPEN", assignedRole: "ADMIN" });
    if (q) disputeParams.set("q", q);
    const request = source === "all"
      ? Promise.all([
          apiFetch(`/api/support/tickets/queue?${params}`, { token }),
          apiFetch(`/api/orders/disputes/queue?${disputeParams}`, { token }),
        ]).then(([tickets, disputes]) => ({
          items: [...(tickets.items || []).map((t) => ({ ...t, _type: "TICKET" })), ...(disputes.items || []).map((d) => ({ ...d, _type: "DISPUTE" }))]
            .sort((a, b) => new Date(a.slaExpiresAt || a.slaDueAt || a.createdAt) - new Date(b.slaExpiresAt || b.slaDueAt || b.createdAt)),
          totalPages: Math.max(tickets.totalPages || 1, disputes.totalPages || 1),
        }))
      : source === "disputes"
        ? apiFetch(`/api/orders/disputes/queue?${disputeParams}`, { token })
        : source === "tickets"
          ? apiFetch(`/api/support/tickets/queue?${params}`, { token })
          : apiFetch(`/api/auth/admin/reports?${repParams}`, { token });

    let cancelled = false;
    request
      .then((data) => {
        if (cancelled) return;
        setError("");
        const rows =
          source === "tickets" || source === "all" || source === "disputes"
            ? (data.items || []).map((row) => source === "disputes" ? { ...row, _type: "DISPUTE" } : row)
            : (data.items || []).map((r) => ({
                id: r.id,
                _type: "REPORT",
                ticketNumber: `REP-${r.id.slice(0, 6).toUpperCase()}`,
                subject: r.reason || "รายงาน",
                requesterId: r.reporterId,
                targetId: r.targetId,
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
        setItems((previous) => source === "all" && page > 1
          ? [...previous, ...rows].sort((a, b) => new Date(a.slaExpiresAt || a.slaDueAt || a.createdAt) - new Date(b.slaExpiresAt || b.slaDueAt || b.createdAt))
          : rows);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, q, statusFilter, ticketStatus, source, token, refreshKey]);

  function refreshAfterAction() {
    setPage(1);
    setItems([]);
    setRefreshKey((k) => k + 1);
    if (selectedTicket) {
      if (selectedTicket._type === "REPORT") {
        closeTicket();
      } else {
        apiFetch(`/api/support/tickets/${selectedTicket.id}`, { token })
          .then(setSelectedTicket)
          // A failed *refresh* is not a failed action. Admin can act on a
          // ticket from this inbox but cannot always re-read its detail
          // (the queue returns it, GET /tickets/:id can still 403), which
          // used to paint "you do not have access to this ticket" in red
          // directly under a warning that had in fact been recorded. The
          // toast already reported the outcome; leave the panel on the
          // pre-action snapshot rather than contradicting it.
          .catch((err) =>
            console.error("Could not refresh ticket after action:", err),
          );
      }
    }
  }

  /* Every action below shares the same busy/error/refresh shape, so they run
     through one runner instead of repeating try/catch/finally six times. */
  async function runAction(fn, successMessage) {
    setActionBusy(true);
    setActionError("");
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
      refreshAfterAction();
    } catch (err) {
      setActionError(err.message);
      toast.error(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  function handleAssign() {
    if (!selectedTicket) return;
    return runAction(() =>
      apiFetch(`/api/support/tickets/${selectedTicket.id}/assign`, {
        method: "POST",
        token,
      }),
    );
  }

  function handleStatusChange(status, reason) {
    if (!selectedTicket) return;
    // Escalation is the one transition that wants a note, so it goes through
    // the confirm dialog first and comes back here with the reason.
    if (status === "ESCALATED" && reason === undefined) {
      setPendingAction({ kind: "escalate" });
      return;
    }
    return runAction(() =>
      apiFetch(`/api/support/tickets/${selectedTicket.id}/status`, {
        method: "PATCH",
        token,
        body: { status, reason: reason || undefined },
      }),
    );
  }

  function handleReportAction(e) {
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

    return runAction(async () => {
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
    }, "บันทึกผลการพิจารณาแล้ว");
  }

  function confirmPendingAction(reason) {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;

    if (action.kind === "escalate") {
      return handleStatusChange("ESCALATED", reason);
    }

    if (action.kind === "ban") {
      return runAction(
        () =>
          apiFetch(`/api/auth/admin/bulk`, {
            method: "POST",
            token,
            body: {
              action: "SUSPEND_USER",
              ids: [action.userId],
              reason:
                reason ||
                `Banned ${action.roleLabel || "user"} from Admin Inbox (Ticket: ${selectedTicket?.ticketNumber})`,
            },
          }),
        `ระงับบัญชี${action.roleLabel || "ผู้ใช้"}สำเร็จ`,
      );
    }

    return runAction(
      () =>
        apiFetch(`/api/auth/admin/users/${action.userId}/warn`, {
          method: "POST",
          token,
          body: { reason },
        }),
      `บันทึกการตักเตือน${action.roleLabel || "ผู้ใช้"}สำเร็จ`,
    );
  }

  const isRequester = pendingAction?.isRequester;
  const targetUserId = pendingAction?.userId;
  const roleLabel = pendingAction?.roleLabel || "ผู้ใช้";

  const confirmCopy =
    {
      ban: isRequester
        ? {
            title: "⚠️ ยืนยันการระงับบัญชีผู้แจ้งปัญหา?",
            description: `คุณกำลังจะระงับบัญชี (SUSPEND) ของ "${roleLabel}" (รหัส: ${targetUserId}) ซึ่งเป็นผู้ส่งคำร้องเข้ามา ไม่ใช่คู่กรณี บัญชีนี้จะไม่สามารถเข้าใช้งานระบบได้ทันที`,
            confirmLabel: "ยืนยันระงับบัญชีผู้แจ้ง",
            tone: "danger",
            reason: "optional",
            reasonLabel: "เหตุผลในการระงับผู้แจ้ง",
          }
        : {
            title: `ระงับบัญชีคู่กรณี (${targetUserId ? targetUserId.slice(0, 8) : ""}...)?`,
            description: `ผู้ใช้เป้าหมาย/คู่กรณี (รหัส: ${targetUserId}) จะเข้าสู่ระบบไม่ได้ทันที (SUSPEND_USER) และจะถูกบันทึกใน Audit Log`,
            confirmLabel: "ระงับบัญชีคู่กรณี",
            tone: "danger",
            reason: "optional",
            reasonLabel: "เหตุผลในการระงับคู่กรณี",
          },
      warn: isRequester
        ? {
            title: `ตักเตือนผู้แจ้งปัญหา (${targetUserId ? targetUserId.slice(0, 8) : ""}...)?`,
            description: `บันทึกคำเตือนไปยังประวัติของ "${roleLabel}" (ผู้ส่งคำร้อง)`,
            confirmLabel: "ตักเตือนผู้แจ้ง",
            tone: "primary",
            reason: "required",
            reasonLabel: "เหตุผลในการตักเตือนผู้แจ้ง",
          }
        : {
            title: `ตักเตือนคู่กรณี (${targetUserId ? targetUserId.slice(0, 8) : ""}...)?`,
            description: `บันทึกคำเตือนไปยังประวัติของคู่กรณี (รหัส: ${targetUserId})`,
            confirmLabel: "ตักเตือนคู่กรณี",
            tone: "primary",
            reason: "required",
            reasonLabel: "เหตุผลในการตักเตือนคู่กรณี",
          },
      escalate: {
        title: "ส่งต่อให้ทีม Trust & Safety?",
        description: "ตั๋วจะถูกยกระดับไปยังคิวของ Trust & Safety",
        confirmLabel: "ส่งต่อ",
        tone: "primary",
        reason: "required",
        reasonLabel: "เหตุผลที่ยกระดับ",
      },
    }[pendingAction?.kind] ?? {};

  return (
    <>
      <div className="animate-fade-in-up flex min-h-full flex-col">
        <div
          className="mb-4 flex gap-2"
          role="tablist"
          aria-label="ประเภทเคส Admin"
        >
          {[
            ["all", "ทั้งหมด"],
            ["disputes", "ข้อพิพาทรอตัดสินเงิน"],
            ["tickets", "ทิกเก็ตขออนุมัติพิเศษ"],
            ["reports", "รายงานผู้ใช้"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={source === key}
              onClick={() => {
                selectionRequest.current += 1;
                setSelectedTicket(null);
                setSelectedDispute(null);
                setConversationId(null);
                setSource(key);
                setPage(1);
                setItems([]);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${source === key ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <Alert className="mb-3">{error} <button type="button" className="ml-2 font-semibold underline" onClick={() => setRefreshKey((k) => k + 1)}>ลองใหม่</button></Alert>}

        {(source === "all" || source === "disputes") ? <div className="space-y-2">
          <form onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); setPage(1); setItems([]); }} className="mb-3 flex gap-2"><input value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="ค้นหาเคส Admin" placeholder="ค้นหาเลขออเดอร์หรือเหตุผล" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm" /><button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">ค้นหา</button></form>
          {loading && <p className="text-sm text-slate-500">กำลังโหลดคิวงาน...</p>}
          {!loading && items.length === 0 && <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">ไม่มีเคสที่รอ Admin</p>}
          {items.map((item) => {
            const isDispute = item._type === "DISPUTE";
            const amount = item.order?.finalPrice ?? item.order?.price;
            const deadline = item.slaExpiresAt || item.slaDueAt;
            return <button type="button" key={`${item._type || "TICKET"}-${item.id}`} onClick={() => selectCase(item)} className="grid w-full grid-cols-1 gap-2 rounded-xl border bg-white p-4 text-left shadow-sm hover:border-indigo-300 sm:grid-cols-5">
              <span className="text-sm font-bold"><span className={`mr-2 rounded px-2 py-1 text-[10px] ${isDispute ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>{isDispute ? "DISPUTE" : "TICKET"}</span>{isDispute ? item.orderId?.slice(0, 10) : item.ticketNumber}</span>
              <span className="truncate text-sm">{isDispute ? item.reason : item.subject}</span>
              <span className="text-xs">Hold: {isDispute && typeof amount === "number" ? `฿${amount.toLocaleString("th-TH")}` : "—"}</span>
              <span className="text-xs">SLA: {deadline ? new Date(deadline).toLocaleString("th-TH") : "—"}</span>
              <span className="truncate text-xs">CS: {isDispute ? item.escalatedBy || "—" : item.assigneeId || "—"}</span>
            </button>;
          })}
          {source === "all" && page < totalPages && <button type="button" onClick={() => setPage((p) => p + 1)} className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-indigo-700">โหลดเคสเพิ่ม</button>}
        </div> : <AdminInboxTable
          items={items}
          source={source}
          loading={loading}
          qInput={qInput}
          onQInputChange={setQInput}
          onSearch={() => {
            setQ(qInput);
            setPage(1);
          }}
          statusFilter={statusFilter}
          ticketStatus={ticketStatus}
          onTicketStatusChange={(v) => { setTicketStatus(v); setPage(1); }}
          onStatusFilterChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onSelectTicket={selectCase}
        />}
      </div>

      <CaseDrawer
        ticket={selectedTicket}
        closing={closingTicket}
        onClose={closeTicket}
      >
        {selectedTicket &&
          (selectedTicket._type === "REPORT" ? (
            <ReportCasePanel
              report={selectedTicket.rawReport}
              decision={reportDecision}
              onDecisionChange={setReportDecision}
              reason={reportReason}
              onReasonChange={setReportReason}
              error={actionError}
              busy={actionBusy}
              onSubmit={handleReportAction}
            />
          ) : (
            <TicketCasePanel
              ticket={selectedTicket}
              auditReadOnly
              conversationId={conversationId}
              chatLoading={chatLoading}
              actionBusy={actionBusy}
              actionError={actionError}
              onAssign={handleAssign}
              onStatusChange={handleStatusChange}
              onWarnUser={(userId, rLabel) =>
                setPendingAction({
                  kind: "warn",
                  userId,
                  roleLabel: rLabel || "คู่กรณี",
                  isRequester: rLabel?.includes("ผู้แจ้ง"),
                })
              }
              onBanUser={(userId, rLabel) =>
                setPendingAction({
                  kind: "ban",
                  userId,
                  roleLabel: rLabel || "คู่กรณี",
                  isRequester: rLabel?.includes("ผู้แจ้ง"),
                })
              }
            />
          ))}
      </CaseDrawer>

      {selectedDispute && <AdminDisputeAuditPanel dispute={selectedDispute} token={token} currentUserId={currentUserId} onClose={() => setSelectedDispute(null)} onUpdated={() => { setPage(1); setItems([]); setRefreshKey((k) => k + 1); }} />}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        busy={actionBusy}
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
        {...confirmCopy}
      />
    </>
  );
}
