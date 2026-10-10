"use client";

import { useEffect, useState } from "react";

import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { useToast } from "../../ui/ToastProvider";
import AdminInboxTable, {
  REPORT_STATUS_OPTIONS,
  TICKET_STATUS_OPTIONS,
} from "./admin-inbox/AdminInboxTable";
import CaseDrawer from "./case/CaseDrawer";
import ReportCasePanel from "./admin-inbox/ReportCasePanel";
import TicketCasePanel from "./case/TicketCasePanel";
import { PAGE_SIZE } from "../../../lib/supportConstants";
import { apiFetch } from "../../../lib/api";

const DRAWER_EXIT_MS = 280;

function mapReport(report) {
  return {
    id: report.id,
    _type: "REPORT",
    ticketNumber: `REP-${report.id.slice(0, 6).toUpperCase()}`,
    subject: report.reason || "รายงาน",
    requesterId: report.reporterId,
    targetId: report.targetId,
    priority: "URGENT",
    status:
      report.status === "OPEN"
        ? "NEW"
        : report.status === "REVIEWED"
          ? "IN_PROGRESS"
          : "RESOLVED",
    createdAt: report.reportedAt,
    rawReport: report,
  };
}

/* Report and escalated-ticket queues deliberately keep separate query state.
   They come from different services and cannot share a page number or total. */
export default function AdminInboxSection({
  token,
  userId,
  userRole,
  onOpenUserHistory,
  initialReportId = "",
}) {
  const toast = useToast();

  const [activeQueue, setActiveQueue] = useState("reports");
  const [reportItems, setReportItems] = useState([]);
  const [reportPage, setReportPage] = useState(1);
  const [reportTotalPages, setReportTotalPages] = useState(1);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState("");
  const [reportQ, setReportQ] = useState("");
  const [reportQInput, setReportQInput] = useState("");
  const [reportStatus, setReportStatus] = useState("OPEN");
  const [reportRefreshKey, setReportRefreshKey] = useState(0);

  const [ticketItems, setTicketItems] = useState([]);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketTotalPages, setTicketTotalPages] = useState(1);
  const [ticketLoading, setTicketLoading] = useState(true);
  const [ticketError, setTicketError] = useState("");
  const [ticketQ, setTicketQ] = useState("");
  const [ticketQInput, setTicketQInput] = useState("");
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

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
      setDetailError("");
    }, DRAWER_EXIT_MS);
  }

  useEffect(() => {
    let cancelled = false;
    setTicketLoading(true);
    setTicketError("");
    const params = new URLSearchParams({
      page: ticketPage,
      limit: PAGE_SIZE,
      scope: "all",
      status: "ESCALATED",
    });
    if (ticketQ) params.set("q", ticketQ);
    apiFetch(`/api/support/tickets/queue?${params}`, { token })
      .then((data) => {
        if (cancelled) return;
        setTicketItems(data.items || []);
        setTicketTotalPages(data.totalPages || 1);
      })
      .catch((err) => !cancelled && setTicketError(err.message))
      .finally(() => !cancelled && setTicketLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ticketPage, ticketQ, token, ticketRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    setReportLoading(true);
    setReportError("");
    const params = new URLSearchParams({
      page: reportPage,
      limit: PAGE_SIZE,
      status: reportStatus,
    });
    if (reportQ) params.set("q", reportQ);
    apiFetch(`/api/auth/admin/reports?${params}`, { token })
      .then((data) => {
        if (cancelled) return;
        setReportItems((data.items || []).map(mapReport));
        setReportTotalPages(data.totalPages || 1);
      })
      .catch((err) => !cancelled && setReportError(err.message))
      .finally(() => !cancelled && setReportLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reportPage, reportQ, reportStatus, token, reportRefreshKey]);

  async function openCase(row) {
    setSelectedTicket(row);
    setDetailLoading(true);
    setDetailError("");
    setActionError("");
    try {
      if (row._type === "REPORT") {
        const detail = await apiFetch(`/api/auth/admin/reports/${row.id}`, {
          token,
        });
        setSelectedTicket(mapReport(detail));
      } else {
        setSelectedTicket(
          await apiFetch(`/api/support/tickets/${row.id}`, { token }),
        );
      }
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!initialReportId) return;
    setActiveQueue("reports");
    openCase({ id: initialReportId, _type: "REPORT" });
  }, [initialReportId, token]);

  function refreshAfterAction() {
    if (selectedTicket?._type === "REPORT") {
      setReportRefreshKey((key) => key + 1);
    } else {
      setTicketRefreshKey((key) => key + 1);
    }
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
        body: {
          status,
          reason: reason || undefined,
          version: selectedTicket.version,
        },
      }),
    );
  }

  function handleReply(body, isInternal) {
    if (!selectedTicket || selectedTicket._type === "REPORT") return;
    return runAction(
      () =>
        apiFetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
          method: "POST",
          token,
          body: { body, isInternal },
        }),
      isInternal ? "บันทึกโน้ตภายในแล้ว" : "ส่งข้อความแล้ว",
    );
  }

  function handleTakeover() {
    if (!selectedTicket || selectedTicket._type === "REPORT") return;
    return runAction(
      () =>
        apiFetch(`/api/support/tickets/${selectedTicket.id}/takeover`, {
          method: "POST",
          token,
          body: {
            version: selectedTicket.version,
            reason: "Trust & Safety takeover from escalated inbox",
          },
        }),
      "รับช่วงเคสเรียบร้อย",
    );
  }

  function handleReportAction(e) {
    e.preventDefault();
    if (actionBusy) return;
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
          apiFetch(`/api/auth/admin/users/${action.userId}/suspend`, {
            method: "POST",
            token,
            body: { reason },
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
            reason: "required",
            reasonLabel: "เหตุผลในการระงับผู้แจ้ง",
          }
        : {
            title: `ระงับบัญชีคู่กรณี (${targetUserId ? targetUserId.slice(0, 8) : ""}...)?`,
            description: `ผู้ใช้เป้าหมาย/คู่กรณี (รหัส: ${targetUserId}) จะเข้าสู่ระบบไม่ได้ทันที (SUSPEND_USER) และจะถูกบันทึกใน Audit Log`,
            confirmLabel: "ระงับบัญชีคู่กรณี",
            tone: "danger",
            reason: "required",
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
        reason: "optional",
        reasonLabel: "เหตุผลที่ยกระดับ",
      },
    }[pendingAction?.kind] ?? {};

  const showingReports = activeQueue === "reports";
  const queueError = showingReports ? reportError : ticketError;

  return (
    <>
      <div className="animate-fade-in-up flex min-h-full flex-col">
        <div
          className="mb-5 inline-flex w-fit rounded-lg border border-slate-200 bg-slate-100 p-1"
          role="tablist"
          aria-label="ประเภทเคส Trust and Safety"
        >
          {[
            ["reports", "รายงาน"],
            ["tickets", "เคสส่งต่อ"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeQueue === value}
              onClick={() => setActiveQueue(value)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                activeQueue === value
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {queueError && (
          <Alert
            className="mb-3"
            title={`โหลด${showingReports ? "รายงาน" : "เคสส่งต่อ"}ไม่สำเร็จ`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{queueError}</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  showingReports
                    ? setReportRefreshKey((key) => key + 1)
                    : setTicketRefreshKey((key) => key + 1)
                }
              >
                ลองใหม่
              </Button>
            </div>
          </Alert>
        )}

        <AdminInboxTable
          items={showingReports ? reportItems : ticketItems}
          loading={showingReports ? reportLoading : ticketLoading}
          qInput={showingReports ? reportQInput : ticketQInput}
          onQInputChange={showingReports ? setReportQInput : setTicketQInput}
          onSearch={() => {
            if (showingReports) {
              setReportQ(reportQInput.trim());
              setReportPage(1);
            } else {
              setTicketQ(ticketQInput.trim());
              setTicketPage(1);
            }
          }}
          statusFilter={showingReports ? reportStatus : "ESCALATED"}
          onStatusFilterChange={(v) => {
            if (showingReports) {
              setReportStatus(v);
              setReportPage(1);
            }
          }}
          statusOptions={
            showingReports ? REPORT_STATUS_OPTIONS : TICKET_STATUS_OPTIONS
          }
          searchPlaceholder={
            showingReports
              ? "ค้นหาด้วยเหตุผล ชื่อ อีเมล หรือรหัส..."
              : "ค้นหาด้วยหัวข้อหรือ Ticket ID..."
          }
          rowActionHint="คลิกที่แถวเพื่อโหลดรายละเอียดล่าสุด"
          page={showingReports ? reportPage : ticketPage}
          totalPages={showingReports ? reportTotalPages : ticketTotalPages}
          onPageChange={showingReports ? setReportPage : setTicketPage}
          onSelectTicket={openCase}
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
              detailLoading={detailLoading}
              detailError={detailError}
              onRetryDetail={() => openCase(selectedTicket)}
              onOpenUserHistory={onOpenUserHistory}
            />
          ) : (
            <TicketCasePanel
              ticket={selectedTicket}
              actionBusy={actionBusy}
              actionError={actionError}
              onAssign={handleAssign}
              onTakeover={handleTakeover}
              canTakeover={
                (userRole === "TRUST_AND_SAFETY" || userRole === "ADMIN") &&
                selectedTicket.status === "ESCALATED" &&
                selectedTicket.assigneeId !== userId
              }
              onStatusChange={handleStatusChange}
              onReply={handleReply}
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
              detailLoading={detailLoading}
              detailError={detailError}
              onRetryDetail={() => openCase(selectedTicket)}
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
