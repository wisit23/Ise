"use client";
import Icon from "../../ui/Icon";


import { formatReferenceCode } from "../../../lib/referenceCodes";


import { useEffect, useRef, useState } from "react";

import Alert from "../../ui/Alert";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { useToast } from "../../ui/ToastProvider";
import AdminInboxTable from "./admin-inbox/AdminInboxTable";
import CaseDrawer from "./case/CaseDrawer";
import ReportCasePanel from "./admin-inbox/ReportCasePanel";
import TicketCasePanel from "./case/TicketCasePanel";
import AdminDisputeAuditPanel from "./admin-inbox/AdminDisputeAuditPanel";
import CaseDate from "./case/CaseDate";
import { PAGE_SIZE } from "../../../lib/supportConstants";
import { apiFetch } from "../../../lib/api";

const DRAWER_EXIT_MS = 280;
const REPORT_ACTION_LABEL = {
  SUSPEND_USER: "ระงับบัญชีผู้ใช้",
  WARN_USER: "ตักเตือนผู้ใช้",
  RESTRICT_BUYER: "เพิกถอนสิทธิ์ซื้อ",
  RESTRICT_SELLER: "เพิกถอนสิทธิ์ขาย",
  REMOVE_PRODUCT: "ลบสินค้า",
  REMOVE_REVIEW: "ลบรีวิวที่ถูกรายงาน",
  DISMISS: "ยกเลิกรายงาน",
};

async function ticketPartyNames(ticket, token) {
  const parties = [
    ["requesterName", ticket.requesterId],
    ["assigneeName", ticket.assigneeId],
    ["targetName", ticket.targetId],
  ].filter(([field, id]) => id && !ticket[field]);
  const users = new Map(await Promise.all(
    [...new Set(parties.map(([, id]) => id))].map(async (id) => {
      try {
        const user = await apiFetch(`/api/auth/admin/users/${encodeURIComponent(id)}`, { token });
        return [id, [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || ""];
      } catch {
        return [id, ""];
      }
    }),
  ));
  return Object.fromEntries(parties
    .map(([field, id]) => [field, users.get(id)])
    .filter(([, name]) => name));
}

/* Separate escalation and report queues share the same case actions and
   detail panels. This component owns the data and the actions; the table and
   report panel live in ./admin-inbox, while the drawer shell and the ticket
   panel are shared with the CS Tickets tab in ./case. */
export default function AdminInboxSection({ token, currentUserId, userRole = "ADMIN", initialReportId = "", reportsOnly = false }) {
  const toast = useToast();

  const savedPages = useRef({all:1,tickets:1,reports:1,disputes:1});
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [ticketStatus, setTicketStatus] = useState("ESCALATED");
  const [workScope, setWorkScope] = useState("unassigned");
  const [reportType, setReportType] = useState("ALL");
  const showHistory = workScope === "history";
  const [source, setSource] = useState(reportsOnly || initialReportId ? "reports" : "disputes");
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
  const [pendingReportDecision, setPendingReportDecision] = useState(false);

  function showTicketDetail(detail, request = selectionRequest.current) {
    if (request !== selectionRequest.current) return;
    setSelectedTicket(detail);
    ticketPartyNames(detail, token).then((names) => {
      if (request !== selectionRequest.current) return;
      setSelectedTicket((current) => current?.id === detail.id
        ? { ...current, ...names }
        : current);
    });
  }

  function closeTicket() {
    setPendingReportDecision(false);
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
    setPendingReportDecision(false);
    const request = ++selectionRequest.current;
    if (item._type === "DISPUTE") {
      setSelectedTicket(null);
      setConversationId(null);
      setSelectedDispute(item);
      return;
    }
    setSelectedDispute(null);
    setSelectedTicket(item);
    setConversationId(null);
    setActionError("");
    setReportReason("");
    setReportDecision("");
    if (item._type === "REPORT") {
      // Queue snapshots cannot authorize actions while fresh detail is pending.
      setSelectedTicket({ ...item, rawReport: null });
      try {
        const report=await apiFetch(`/api/auth/admin/reports/${item.id}`,{token});
        if(request===selectionRequest.current) {
          setSelectedTicket({...item,rawReport:report});
          setReportDecision(report.targetId ? "SUSPEND_USER" : "DISMISS");
        }
      } catch(err){if(request===selectionRequest.current)setActionError(err.message);}
      return;
    }
    setChatLoading(true);
    try {
      const detail = await apiFetch(`/api/support/tickets/${item.id}`, {
        token,
      });
      if (request !== selectionRequest.current) return;
      showTicketDetail(detail, request);
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

  useEffect(()=>{
    if(initialReportId)selectCase({id:initialReportId,_type:"REPORT"});
  },[initialReportId,token]);
  useEffect(() => {
    const refresh = () => setRefreshKey((key) => key + 1);
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    setLoading(true);

    const params = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      scope: workScope,
    });
    if (q) params.set("q", q);
    if (source === "all" || ticketStatus !== "ALL") params.set("status", source === "all" ? "ESCALATED" : ticketStatus);
    if (showHistory) { params.delete("status"); params.set("sort", "newest"); }

    const repParams = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      status: statusFilter || "ALL",
      scope: workScope,
    });
    if(q) repParams.set("q",q);
    if (reportsOnly) repParams.set("type", reportType);
    const disputeParams = new URLSearchParams({ page, limit: PAGE_SIZE, assignedRole: userRole === "TRUST_AND_SAFETY" ? "TRUST_AND_SAFETY" : "SAFETY", scope: workScope });
    if (showHistory) { disputeParams.set("status", "DECIDED"); disputeParams.set("sort", "newest"); }
    else disputeParams.set("work", "open");
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
                referenceCode: r.referenceCode,
                ticketNumber: formatReferenceCode(r),
                subject: r.reason || "รายงาน",
                requesterId: r.reporterId,
                requesterName: [r.reporter?.firstName, r.reporter?.lastName].filter(Boolean).join(" ") || r.reporter?.email,
                targetId: r.targetId,
                assigneeId: r.reviewedBy,
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
  }, [page, q, statusFilter, ticketStatus, workScope, source, token, refreshKey, userRole, reportsOnly, reportType]);

  function refreshAfterAction(request) {
    setPage(1);
    setItems([]);
    setRefreshKey((k) => k + 1);
    if (selectedTicket && request === selectionRequest.current) {
      if (selectedTicket._type === "REPORT") {
        closeTicket();
      } else {
        apiFetch(`/api/support/tickets/${selectedTicket.id}`, { token })
          .then((detail) => showTicketDetail(detail, request))
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
    const request = selectionRequest.current;
    setActionBusy(true);
    setActionError("");
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
      refreshAfterAction(request);
    } catch (err) {
      if (request === selectionRequest.current) setActionError(err.message);
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

  function handleTakeover(){
    if(!selectedTicket)return;
    return runAction(()=>apiFetch(`/api/support/tickets/${selectedTicket.id}/takeover`,{method:"POST",token,body:{version:selectedTicket.version,reason:"รับผิดชอบการตรวจสอบเคสที่ส่งต่อ"}}));
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
        body: { status, version:selectedTicket.version, reason: reason || undefined },
      }),
    );
  }

  function handleReportAction(e) {
    e.preventDefault();
    if (!selectedTicket || selectedTicket._type !== "REPORT" || !selectedTicket.rawReport) return;
    if (!reportDecision) {
      setActionError("กรุณาเลือกการตัดสินใจ");
      return;
    }
    if (!reportReason.trim()) {
      setActionError("กรุณาระบุเหตุผล");
      return;
    }
    setActionError("");
    setPendingReportDecision(true);
  }

  async function handleClaimReport() {
    if (!selectedTicket || selectedTicket._type !== "REPORT") return;
    const reportId = selectedTicket.id;
    const request = selectionRequest.current;
    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/auth/admin/reports/${reportId}/review`, { method: "POST", token });
      const report = await apiFetch(`/api/auth/admin/reports/${reportId}`, { token });
      if (request !== selectionRequest.current) return;
      setSelectedTicket((current) => current?.id === reportId ? { ...current, rawReport: report, assigneeId: report.reviewedBy, status: "IN_PROGRESS" } : current);
      if (reportsOnly) {
        setWorkScope("mine");
        setStatusFilter("PENDING");
        setPage(1);
        setItems([]);
      }
      setRefreshKey((key) => key + 1);
      toast.success("รับรายงานแล้ว");
    } catch (error) {
      setActionError(error.message);
      toast.error(error.message);
      setRefreshKey((key) => key + 1);
    } finally { setActionBusy(false); }
  }

  function confirmReportDecision() {
    if (!selectedTicket || selectedTicket._type !== "REPORT") return;
    setPendingReportDecision(false);
    return runAction(async () => {
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

    if (!selectedTicket?.capabilities?.canModerateUsers) {
      setActionError("ต้องรับผิดชอบเคสนี้ก่อน จึงจะดำเนินการกับบัญชีได้");
      return;
    }
    return runAction(
      () => apiFetch(`/api/support/tickets/${selectedTicket.id}/moderation`, {
        method: "POST", token,
        body: { action: action.kind === "restrict" ? action.scope === "BUYER" ? "restrictBuyer" : "restrictSeller" : action.kind, targetId: action.userId, reason, version: selectedTicket.version },
      }),
      "ดำเนินการกับบัญชีเรียบร้อยแล้ว",
    );
  }

  const isRequester = pendingAction?.isRequester;
  const targetUserId = pendingAction?.userId;
  const roleLabel = pendingAction?.roleLabel || "ผู้ใช้";

  const confirmCopy =
    {
      ban: isRequester
        ? {
            title: <><Icon name="warning" /> ยืนยันการระงับบัญชีผู้แจ้งปัญหา?</>,
            description: `คุณกำลังจะระงับบัญชี ของ "${roleLabel}" (รหัส: ${formatReferenceCode(targetUserId)}) ซึ่งเป็นผู้ส่งคำร้องเข้ามา ไม่ใช่คู่กรณี บัญชีนี้จะไม่สามารถเข้าใช้งานระบบได้ทันที`,
            confirmLabel: "ยืนยันระงับบัญชีผู้แจ้ง",
            tone: "danger",
            reason: "required",
            reasonLabel: "เหตุผลในการระงับผู้แจ้ง",
          }
        : {
            title: `ระงับบัญชีคู่กรณี (${targetUserId ? formatReferenceCode(targetUserId) : ""})?`,
            description: `ผู้ใช้เป้าหมาย/คู่กรณี (รหัส: ${formatReferenceCode(targetUserId)}) จะเข้าสู่ระบบไม่ได้ทันที และจะถูกบันทึกใน ประวัติการดำเนินการ`,
            confirmLabel: "ระงับบัญชีคู่กรณี",
            tone: "danger",
            reason: "required",
            reasonLabel: "เหตุผลในการระงับคู่กรณี",
          },
      warn: isRequester
        ? {
            title: `ตักเตือนผู้แจ้งปัญหา (${targetUserId ? formatReferenceCode(targetUserId) : ""})?`,
            description: `บันทึกคำเตือนไปยังประวัติของ "${roleLabel}" (ผู้ส่งคำร้อง)`,
            confirmLabel: "ตักเตือนผู้แจ้ง",
            tone: "primary",
            reason: "required",
            reasonLabel: "เหตุผลในการตักเตือนผู้แจ้ง",
          }
        : {
            title: `ตักเตือนคู่กรณี (${targetUserId ? formatReferenceCode(targetUserId) : ""})?`,
            description: `บันทึกคำเตือนไปยังประวัติของคู่กรณี (รหัส: ${formatReferenceCode(targetUserId)})`,
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
      restrict: {
        title: `ยืนยันเพิกถอนสิทธิ์${pendingAction?.scope === "BUYER" ? "ซื้อ" : "ขาย"}?`,
        description: `${roleLabel} (รหัส: ${formatReferenceCode(targetUserId)}) จะ${pendingAction?.scope === "BUYER" ? "ซื้อ" : "ขาย"}สินค้าไม่ได้ทันที แต่ยังเข้าสู่ระบบได้`,
        confirmLabel: "ยืนยันเพิกถอนสิทธิ์",
        tone: "danger",
        reason: "required",
        reasonLabel: "เหตุผลในการเพิกถอนสิทธิ์",
      },
    }[pendingAction?.kind] ?? {};

  return (
    <>
      <div className="animate-fade-in-up flex min-h-full min-w-0 flex-col">
        {reportsOnly ? <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="ประเภทรายงาน">
          {[["ALL", "ทั้งหมด"], ["USER", "รายงานร้านค้า"], ["PRODUCT", "รายงานสินค้า"], ["COMMENT", "รายงานรีวิว"]].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={reportType === value} onClick={() => {
              selectionRequest.current += 1;
              setSelectedTicket(null);
              setReportType(value);
              setPage(1);
              setItems([]);
            }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${reportType === value ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>
          ))}
        </div> : <div
          className="mb-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="ประเภทเคส Trust and Safety"
        >
          {[
            ["disputes", "ข้อพิพาท"],
            ["tickets", "ทิกเก็ต"],
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
                savedPages.current[source]=page;
                setSource(key);
                setPage(savedPages.current[key] || 1);
                setItems([]);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${source === key ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>}
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="กรองเจ้าของงาน">
          <span className="text-sm text-slate-600">งาน:</span>
          {(reportsOnly ? [["unassigned", "ยังไม่มีคนรับ"], ["mine", "งานของฉัน"], ["history", "ประวัติงานของฉัน"]] : [["mine", "งานของฉัน"], ["unassigned", "ยังไม่มีคนรับ"], ["history", "ประวัติงานของฉัน"]]).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={workScope === value} onClick={() => { selectionRequest.current += 1; setSelectedTicket(null); setSelectedDispute(null); setConversationId(null); savedPages.current = {all:1,tickets:1,reports:1,disputes:1}; setWorkScope(value); setPage(1); setItems([]); }} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${workScope === value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>
          ))}
        </div>
        {error && <Alert className="mb-3">{source === "reports" && <span>โหลดรายงานไม่สำเร็จ</span>} {error} <button type="button" className="ml-2 font-semibold underline" onClick={() => setRefreshKey((k) => k + 1)}>ลองใหม่</button></Alert>}

        {showHistory && <p className="mb-3 text-sm text-slate-500">แสดงเคสของคุณที่ตัดสิน แก้ไข ปิดงาน หรือจัดการรายงานเสร็จแล้ว คลิกเคสเพื่อดูรายละเอียด</p>}
        {(source === "all" || source === "disputes") ? <div className="space-y-2">
          <form onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); setPage(1); setItems([]); }} className="mb-3 flex gap-2"><input value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="ค้นหาเคส Trust and Safety" placeholder="ค้นหาเลขออเดอร์หรือเหตุผล" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm" /><button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">ค้นหา</button></form>
          {loading && <p className="text-sm text-slate-500">กำลังโหลดคิวงาน...</p>}
          {!loading && !error && items.length === 0 && <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">{showHistory ? "ยังไม่มีประวัติงานที่คุณดำเนินการเสร็จแล้ว" : "ไม่มีเคสที่รอทีม Trust & Safety"}</p>}
          <p className="text-xs text-slate-500">วันและเวลาแสดงตามเวลาไทย (UTC+7) · วันที่แจ้งปัญหาแยกจากกำหนด SLA</p>
          {items.map((item) => {
            const isDispute = item._type === "DISPUTE";
            const isReport = item._type === "REPORT";
            const amount = item.order?.finalPrice ?? item.order?.price;
            const deadline = item.slaExpiresAt || item.slaDueAt;
            return <button type="button" key={`${item._type || "TICKET"}-${item.id}`} onClick={() => selectCase(item)} className={`grid w-full grid-cols-1 gap-2 rounded-xl border bg-white p-4 text-left shadow-sm hover:border-indigo-300 ${showHistory ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
              <span className="text-sm font-bold"><span className={`mr-2 rounded px-2 py-1 text-[10px] ${isDispute ? "bg-amber-100 text-amber-800" : isReport ? "bg-red-100 text-red-800" : "bg-indigo-100 text-indigo-800"}`}>{isDispute ? "ข้อพิพาท" : isReport ? "รายงาน" : "คำร้อง"}</span>{isDispute ? formatReferenceCode(item.orderId) : item.ticketNumber}</span>
              <span className="min-w-0 break-words text-sm">{isDispute ? item.reason : item.subject}</span>
              {showHistory && <span className="text-xs font-semibold text-emerald-700">{isDispute ? "ตัดสินแล้ว" : isReport ? item.rawReport?.status === "DISMISSED" ? "ยกเลิกรายงานแล้ว" : "จัดการรายงานแล้ว" : item.status === "CLOSED" ? "ปิดแล้ว" : "แก้ไขแล้ว"}</span>}
              <span className="text-xs">Hold: {isDispute && typeof amount === "number" ? `฿${amount.toLocaleString("th-TH")}` : "—"}</span>
              <span className="flex flex-col gap-1 text-xs"><span className="text-slate-500">กำหนด SLA</span><CaseDate value={deadline} /></span>
              <span className="min-w-0 break-words text-xs">ผู้รับผิดชอบ: {item.assigneeName || formatReferenceCode(item.assigneeId || item.assignedTo) || "ยังไม่มีคนรับ"}</span>
              <span className="col-span-full grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                <span className="flex flex-col gap-1"><span className="text-slate-500">วันที่แจ้งปัญหา</span><CaseDate value={item.createdAt} /></span>
                {item.escalatedAt && <span className="flex flex-col gap-1"><span className="text-slate-500">วันที่ส่งต่อ T&S</span><CaseDate value={item.escalatedAt} /></span>}
                {(item.assignedTo || item.assigneeId || showHistory) && <span className="flex flex-col gap-1"><span className="text-slate-500">วันที่รับงาน</span><CaseDate value={item.assignedAt} /></span>}
                {showHistory && <span className="flex flex-col gap-1"><span className="text-slate-500">{isDispute ? "วันที่ตัดสิน" : "วันที่ปิด / แก้ไข"}</span><CaseDate value={item.decidedAt || item.closedAt || item.resolvedAt} /></span>}
              </span>
            </button>;
          })}
          {page < totalPages && <button type="button" onClick={() => setPage((p) => p + 1)} className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-indigo-700">{source === "all" ? "โหลดเคสเพิ่ม" : "หน้าถัดไป"}</button>}
          {source === "disputes" && page > 1 && <button type="button" onClick={() => setPage((p) => p - 1)} className="rounded-lg border bg-white px-4 py-2 text-sm font-bold">ก่อนหน้า</button>}
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
          history={showHistory}
          hideStatusFilter={reportsOnly && workScope === "unassigned"}
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
              report={selectedTicket.rawReport || {status:"OPEN"}}
              detailLoading={!selectedTicket.rawReport}
              detailError={actionError}
              onRetryDetail={()=>selectCase(selectedTicket)}
              decision={reportDecision}
              onDecisionChange={setReportDecision}
              reason={reportReason}
              onReasonChange={setReportReason}
              error={actionError}
              busy={actionBusy}
              onSubmit={handleReportAction}
              onClaim={handleClaimReport}
              currentUserId={currentUserId}
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
              onTakeover={handleTakeover}
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
              onRestrictBuyer={(userId, rLabel) => setPendingAction({kind:"restrict", scope:"BUYER", userId, roleLabel:rLabel})}
              onRestrictSeller={(userId, rLabel) => setPendingAction({kind:"restrict", scope:"SELLER", userId, roleLabel:rLabel})}
            />
          ))}
      </CaseDrawer>

      {selectedDispute && <AdminDisputeAuditPanel key={selectedDispute.id} dispute={selectedDispute} token={token} currentUserId={currentUserId} onClose={() => setSelectedDispute(null)} onUpdated={() => { setPage(1); setItems([]); setRefreshKey((k) => k + 1); }} />}

      <ConfirmDialog
        open={pendingReportDecision}
        busy={actionBusy}
        onCancel={() => setPendingReportDecision(false)}
        onConfirm={confirmReportDecision}
        title="ยืนยันการตัดสินรายงาน"
        description={`กำลังจะ${REPORT_ACTION_LABEL[reportDecision] || "ดำเนินการ"}ตามรายงานนี้ เหตุผล: ${reportReason.trim()}`}
        confirmLabel="ยืนยันคำสั่ง"
        tone="danger"
      />
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
