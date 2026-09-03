"use client";

import { useEffect, useState } from "react";

import Alert from "../../ui/Alert";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { useToast } from "../../ui/ToastProvider";
import AdminInboxTable from "./admin-inbox/AdminInboxTable";
import CaseDrawer from "./case/CaseDrawer";
import ReportCasePanel from "./admin-inbox/ReportCasePanel";
import TicketCasePanel from "./case/TicketCasePanel";
import { PAGE_SIZE } from "../../../lib/supportConstants";
import { apiFetch } from "../../../lib/api";

const DRAWER_EXIT_MS = 280;

/* Admin's escalation queue: escalated support tickets and user reports in one
   list. This component owns the data and the actions; the queue table and the
   report panel live in ./admin-inbox, while the drawer shell and the ticket
   panel are shared with the CS Tickets tab in ./case. */
export default function AdminInboxSection({ token }) {
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [selectedTicket, setSelectedTicket] = useState(null);
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
    setClosingTicket(true);
    setTimeout(() => {
      setSelectedTicket(null);
      setClosingTicket(false);
      setActionError("");
    }, DRAWER_EXIT_MS);
  }

  useEffect(() => {
    setLoading(true);

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
                `Banned from Admin Inbox (Ticket: ${selectedTicket?.ticketNumber})`,
            },
          }),
        "ระงับบัญชีผู้ใช้สำเร็จ",
      );
    }

    return runAction(
      () =>
        apiFetch(`/api/auth/admin/users/${action.userId}/warn`, {
          method: "POST",
          token,
          body: { reason },
        }),
      "บันทึกการตักเตือนสำเร็จ",
    );
  }

  const confirmCopy =
    {
      ban: {
        title: "ระงับบัญชีผู้ใช้นี้?",
        description:
          "ผู้ใช้จะเข้าสู่ระบบไม่ได้ทันที (SUSPEND_USER) และจะถูกบันทึกใน Audit Log",
        confirmLabel: "ระงับบัญชี",
        tone: "danger",
        reason: "optional",
        reasonLabel: "เหตุผลในการระงับ",
      },
      warn: {
        title: "ตักเตือนผู้ใช้นี้?",
        description: "คำเตือนจะถูกบันทึกไว้ในประวัติผู้ใช้",
        confirmLabel: "บันทึกการตักเตือน",
        tone: "primary",
        reason: "required",
        reasonLabel: "เหตุผลในการตักเตือน",
      },
      escalate: {
        title: "ส่งต่อให้ Admin?",
        description: "ตั๋วจะถูกยกระดับไปยังคิวของ Admin",
        confirmLabel: "ส่งต่อ",
        tone: "primary",
        reason: "optional",
        reasonLabel: "เหตุผลที่ยกระดับ",
      },
    }[pendingAction?.kind] ?? {};

  return (
    <>
      <div className="animate-fade-in-up flex min-h-full flex-col">
        {error && <Alert className="mb-3">{error}</Alert>}

        <AdminInboxTable
          items={items}
          loading={loading}
          qInput={qInput}
          onQInputChange={setQInput}
          onSearch={() => {
            setQ(qInput);
            setPage(1);
          }}
          statusFilter={statusFilter}
          onStatusFilterChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onSelectTicket={setSelectedTicket}
        />
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
              actionBusy={actionBusy}
              actionError={actionError}
              onAssign={handleAssign}
              onStatusChange={handleStatusChange}
              onWarnUser={(userId) =>
                setPendingAction({ kind: "warn", userId })
              }
              onBanUser={(userId) => setPendingAction({ kind: "ban", userId })}
            />
          ))}
      </CaseDrawer>

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
