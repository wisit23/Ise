"use client";
import SafetyOrderChatPanel from "../sections/disputes/SafetyOrderChatPanel";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../../../lib/api";
import { getStoredUser } from "../../../lib/auth";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  ORDER_STATUS_LABEL,
  STAFF_ROLE_LABEL,
} from "../../../lib/supportConstants";
import { useToast } from "../../ui/ToastProvider";
import Button from "../../ui/Button";
import Alert from "../../ui/Alert";
import Modal from "../../ui/Modal";
import DataTable from "../../ui/DataTable";
import Pagination from "../../Pagination";
import EmbeddedChat from "../EmbeddedChat";
import SupportQueueSidebar from "../sections/live-support/SupportQueueSidebar";
import useCaseWorkspace from "./useCaseWorkspace";
import useCaseUnread from "./useCaseUnread";
import SlaIndicator from "./SlaIndicator";
import CaseFilters from "./CaseFilters";
import CaseContextPanel from "./CaseContextPanel";
import EscalationMemoDialog from "./EscalationMemoDialog";
import EvidenceInspector from "./EvidenceInspector";
import StaffReassignDialog from "./StaffReassignDialog";
import ReturnToCsDialog from "./ReturnToCsDialog";
import CaseHandoffBanner from "./CaseHandoffBanner";
import CsatCell from "./CsatCell";
import CsatSummary from "./CsatSummary";
import layoutStyles from "./workspace.module.css";
import contextStyles from "./CaseContextPanel.module.css";

const ROLE_LABEL = STAFF_ROLE_LABEL;
const ACTION_LABEL = {
  IN_PROGRESS: "เริ่มดำเนินการ",
  PENDING_USER: "รอลูกค้าตอบ",
  RESOLVED: "แจ้งว่าแก้ไขแล้ว",
  CLOSED: "ปิดเคส",
};
const fallback = (name, id) =>
  name || (id ? `ผู้ใช้ #${id.slice(0, 10)}` : "ยังไม่มี");
const currency = (value) =>
  value != null && Number.isFinite(Number(value))
    ? `฿${Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "ไม่พบยอดเงิน";

export default function CaseWorkspace({
  domain,
  token,
  currentUser,
  viewMode,
  setViewMode,
  statusFilter,
}) {
  const [safetyChat,setSafetyChat] = useState(null);
  const user = currentUser || getStoredUser() || {};
  const dispute = domain === "disputes";
  const w = useCaseWorkspace(domain, token, user.id);
  const unread = useCaseUnread(domain, token, user.id);
  const { state, detail, queue, busy } = w;
  const toast = useToast();
  const personIdentity = (name, id) => (
    <span>
      <span>{name || (id ? "ผู้ใช้" : "ยังไม่มี")}</span>
      {id && (
        <button
          type="button"
          className={contextStyles.personId}
          aria-label={`คัดลอกรหัสผู้ใช้เต็ม ${id}`}
          title="คัดลอกรหัสผู้ใช้เต็มสำหรับค้นหา"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(id);
              toast.success("คัดลอกรหัสผู้ใช้เต็มแล้ว");
            } catch {
              toast.error("คัดลอกไม่ได้ กรุณาเลือกรหัสเต็มด้านล่างเพื่อคัดลอก");
            }
          }}
        >
          <span>{id}</span>
          <span className="material-symbols-outlined" aria-hidden="true">content_copy</span>
        </button>
      )}
    </span>
  );
  const [context, setContext] = useState(false);
  const [memo, setMemo] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [room, setRoom] = useState(null);
  const [joining, setJoining] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [reassign, setReassign] = useState(false);
  const [decision, setDecision] = useState(null);
  const [reason, setReason] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [returnDialog, setReturnDialog] = useState(false);
  const deniedRoom = useRef(null);
  const [modeHost, setModeHost] = useState(null);
  useEffect(() => {
    setModeHost(document.getElementById("workspace-view-control"));
  }, []);
  const roomGeneration = useRef(0);
  const contextTrigger = useRef(null);
  const closeContext = useCallback(() => {
    setContext(false);
    requestAnimationFrame(() => contextTrigger.current?.focus());
  }, []);
  const currentId = useRef(state.selectedId);
  const initialFilter = useRef(statusFilter);
  currentId.current = state.selectedId;
  const base = dispute ? "/api/orders/disputes" : "/api/support/tickets";
  const caps = detail?.capabilities || {};
  const labels = dispute ? DISPUTE_STATUS_LABEL : TICKET_STATUS_LABEL;
  const selected = detail?.id === state.selectedId ? detail : null;
  const elevated = [user.role, ...(user.roles || [])].some((role) =>
    ["ADMIN", "TRUST_AND_SAFETY"].includes(role),
  );
  // The chat inbox keeps three tabs; the table view carries the full set.
  const sidebarScopes = elevated
    ? [
        { value: "mine", label: "งานของฉัน" },
        { value: "unassigned", label: "รอรับเรื่อง" },
        { value: "all", label: "ทุกงาน" },
      ]
    : [
        { value: "mine", label: "งานของฉัน" },
        { value: "unassigned", label: "รอรับเรื่อง" },
        { value: "escalated", label: "ส่งต่อแล้ว" },
      ];
  const tableScopes = [
    { value: "mine", label: "งานของฉัน" },
    ...(dispute && !elevated ? [{ value: "returned", label: "ตีกลับจาก T&S" }] : []),
    { value: "unassigned", label: "รอรับเรื่อง" },
    {
      value: "escalated",
      label: elevated ? "เคสที่ถูกส่งต่อ" : `ส่งต่อแล้ว (รอ T&S)`,
    },
    { value: "closed", label: "ปิดแล้ว" },
    { value: "all", label: "ทุกงาน" },
  ];
  const closedView = state.scope === "closed";
  const setView = (value) => {
    if (!chatBusy && !busy) w.update({ view: value });
  };
  useEffect(() => {
    if (viewMode && viewMode !== state.view) w.update({ view: viewMode }, true);
  }, [viewMode]); // External top-bar control.
  useEffect(() => {
    if (statusFilter !== initialFilter.current) {
      initialFilter.current = statusFilter;
      w.update({ status: statusFilter || "", page: 1 }, true);
    }
  }, [statusFilter, w.update]);
  useEffect(() => {
    setViewMode?.(state.view);
  }, [state.view, setViewMode]);
  useEffect(() => {
    // Table-only tabs fold back into "mine" in the compact chat inbox.
    if (state.view === "workspace" && !sidebarScopes.some((item) => item.value === state.scope))
      w.update({ scope: "mine", page: 1 }, true);
  }, [state.view, state.scope, elevated, w.update]);
  useEffect(() => {
    setRoom(null);
    setJoining(false);
    setRoomError("");
    setContext(false);
    setMemo(false);
    setReassign(false);
    setDecision(null);
    setNote("");
    setReason("");
    setReturnDialog(false);
    setChatBusy(false);
    roomGeneration.current++;
  }, [state.selectedId]);
  const join = useCallback(
    async (side) => {
      const id = selected?.id;
      if (!id) return;
      const request = ++roomGeneration.current;
      setJoining(true);
      setRoomError("");
      try {
        const data = await apiFetch(
          `${base}/${encodeURIComponent(id)}/${dispute ? "conversation" : "join"}`,
          { method: "POST", token, body: dispute ? { side } : undefined },
        );
        if (request !== roomGeneration.current || currentId.current !== id)
          return;
        if (!data.conversationId || (dispute && data.side !== side))
          throw new Error("ห้องสนทนาไม่ตรงกับผู้รับที่เลือก");
        setRoom({ ...data, side, id });
        if (dispute) w.update({ side }, true);
        return true;
      } catch (err) {
        if (request === roomGeneration.current) {
          setRoomError(err.message);
          if (err.status === 403) w.refresh();
        }
        return false;
      } finally {
        if (request === roomGeneration.current) setJoining(false);
      }
    },
    [selected?.id, base, dispute, token, w.update, w.refresh],
  );
  useEffect(() => {
    if (!selected) return;
    if (
      !dispute ||
      caps.canReply ||
      caps.isWatching ||
      (selected.status === "DECIDED" && selected.assignedTo === user.id) ||
      elevated
    ) {
      if (room?.id !== selected.id || room.side !== state.side)
        join(state.side);
    } else setJoining(false);
    return () => {
      roomGeneration.current++;
    };
  }, [
    selected?.id,
    selected?.assignedTo,
    selected?.assigneeId,
    selected?.status,
    join,
    user.id,
    user.role,
    caps.canReply,
    state.side,
    room?.id,
    room?.side,
  ]);
  async function run(action, body, method) {
    const result = await w.mutate(
      action,
      !dispute ? { ...body, version: body?.version ?? selected.version } : body,
      method,
    );
    if (result?.chatLockError)
      toast.error("บันทึกเคสแล้ว แต่ล็อกแชทไม่สำเร็จ กรุณาตรวจสอบสถานะแชท");
    else if (result?.chatJoinError)
      toast.error(
        "รับเคสแล้ว แต่เชื่อมต่อแชทไม่สำเร็จ กรุณาลองเปิดแชทอีกครั้ง",
      );
    else
      toast.success(
        action === "escalate" || body?.status === "ESCALATED"
          ? "ส่งต่อให้ Trust and Safety แล้ว ติดตามได้ที่แท็บ “ส่งต่อแล้ว”"
          : action === "request-evidence"
            ? "ส่งกลับให้ CS แล้ว"
            : "บันทึกเรียบร้อย",
      );
    if (
      action === "escalate" ||
      body?.status === "ESCALATED" ||
      (action === "reassign" && !elevated && result?.assignedTo !== user.id)
    ) {
      setContext(false);
      w.update({ selectedId: null });
    }
    return result;
  }
  async function updateReturnTask(taskId, patch) {
    const id = selected.id;
    const result = await apiFetch(
      `${base}/${encodeURIComponent(id)}/return-tasks/${encodeURIComponent(taskId)}`,
      { method: "PATCH", token, body: patch },
    );
    w.patchDetail(id, result);
    w.refreshQueue();
    return result;
  }
  async function claim() {
    try {
      await run(
        dispute ? "claim" : "assign",
        dispute ? { version: selected.version } : undefined,
      );
      w.update({ scope: "mine", page: 1 });
    } catch (err) {
      toast.error(err.message);
    }
  }
  async function changeTicketStatus(status) {
    if (status === "CLOSED") {
      setDecision({
        ticketClose: true,
        id: selected.id,
        version: selected.version,
      });
      return;
    }
    try {
      await run("status", { status }, "PATCH");
    } catch (err) {
      toast.error(err.message);
    }
  }
  const filter = (key, value) =>
    w.update(
      key === "resetFilters"
        ? { status: "", priority: "", work: "", retention: "active", page: 1 }
        : key === "retention"
          ? { retention: value, scope: "all", work: "", status: "", selectedId: null, page: 1 }
          : { [key]: value, page: 1 },
      key === "search",
    );
  const select = (row) => {
    if (chatBusy || busy) return;
    w.update({ selectedId: row.id, view: "workspace", side: "buyer" });
    setViewMode?.("workspace");
  };
  const filters = (
    <CaseFilters
      canViewDeleted={elevated}
      state={state}
      labels={labels}
      priorities={
        dispute ? { ...PRIORITY_LABEL, CRITICAL: "วิกฤต" } : PRIORITY_LABEL
      }
      onChange={filter}
      searchSlot={
        state.view === "table" ? (
          <div className="relative min-w-0 flex-1 basis-64">
            <span
              aria-hidden="true"
              className="material-symbols-outlined pointer-events-none absolute left-3 top-3 text-[20px] text-slate-400"
            >
              search
            </span>
            <input
              aria-label="ค้นหาเคส"
              placeholder="ค้นหาเลขเคสหรือหัวข้อ"
              value={state.search}
              onChange={(e) => filter("search", e.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>
        ) : undefined
      }
    />
  );
  const thaiDate = (value) =>
    value
      ? new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })
      : "—";
  const TEAM_SHORT = { CUSTOMER_SERVICE: "ทีม CS", TRUST_AND_SAFETY: "ทีม T&S", ADMIN: "Admin" };
  const statusStyle = dispute ? DISPUTE_STATUS_STYLE : TICKET_STATUS_STYLE;
  const pill = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";
  const columns = [
    {
      key: "id",
      header: "เลขเคส",
      render: (row) => (
        <button
          type="button"
          aria-label={`คัดลอกเลขเคส ${row.ticketNumber || row.id}`}
          title={`${row.ticketNumber || row.id} · คลิกเพื่อคัดลอก`}
          className="group/id -ml-1.5 inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 font-mono text-xs text-slate-600 hover:bg-slate-100 hover:text-emerald-700"
          onClick={async (event) => {
            event.stopPropagation();
            try {
              await navigator.clipboard.writeText(row.ticketNumber || row.id);
              toast.success("คัดลอกเลขเคสแล้ว");
            } catch {
              toast.error("คัดลอกไม่ได้ คุณเปิดข้อมูลเคสเพื่อดูเลขเต็มได้");
            }
          }}
        >
          {row.ticketNumber || `#…${row.id.slice(-6)}`}
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[14px] text-slate-300 group-hover/id:text-emerald-600"
          >
            content_copy
          </span>
        </button>
      ),
    },
    {
      key: "subject",
      header: dispute ? (closedView ? "เหตุผล / ออเดอร์" : "เหตุผล / คู่กรณี") : "หัวข้อ / ผู้แจ้ง",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900" title={row.subject || row.reason}>
            {row.subject || row.reason}
          </p>
          <p
            className="mt-0.5 truncate text-xs text-slate-500"
            title={dispute ? `ออเดอร์ ${row.orderId}` : undefined}
          >
            {dispute && !closedView
              ? `ซื้อ ${fallback(row.buyerName, row.order?.buyerId)} · ขาย ${fallback(row.sellerName, row.order?.sellerId)}`
              : dispute
                ? `ออเดอร์ #${String(row.orderId).slice(0, 8)}…${String(row.orderId).slice(-4)}`
                : fallback(row.requesterName, row.requesterId)}
          </p>
        </div>
      ),
    },
    ...(dispute && !closedView
      ? [
          {
            key: "amount",
            header: "ยอดเงิน",
            render: (row) => (
              <span className="whitespace-nowrap font-medium tabular-nums text-slate-900">
                {currency(row.order?.finalPrice ?? row.order?.price)}
              </span>
            ),
          },
        ]
      : []),
    ...(closedView
      ? []
      : [
          {
            key: "status",
            header: "สถานะ",
            // One badge per row: a handoff state replaces the raw status.
            render: (row) =>
              row.capabilities?.isReturned ? (
                <span className={`${pill} gap-1 border border-amber-300 bg-amber-50 text-amber-800`}>
                  <span aria-hidden="true" className="material-symbols-outlined !text-[14px]">assignment_return</span>
                  ตีกลับจาก T&amp;S
                </span>
              ) : row.capabilities?.isWatching || (!dispute && row.status === "ESCALATED") ? (
                <span className={`${pill} border border-blue-300 bg-blue-50 text-blue-800`}>
                  รอ T&S ตรวจ
                </span>
              ) : (
                <span className={`${pill} ${statusStyle[row.status] || "border border-slate-200 bg-slate-50 text-slate-600"}`}>
                  {labels[row.status] || row.status}
                </span>
              ),
          },
          {
            key: "priority",
            header: "ความสำคัญ",
            render: (row) => {
              const level = row.queuePriority || row.priority;
              return level ? (
                <span className={`${pill} ${PRIORITY_STYLE[level] || "border border-slate-200 bg-slate-50 text-slate-600"}`}>
                  {PRIORITY_LABEL[level] || level}
                </span>
              ) : (
                "—"
              );
            },
          },
          {
            key: "sla",
            header: "SLA",
            render: (row) => (
              <div className="text-xs leading-5">
                <SlaIndicator sla={row.sla} />
              </div>
            ),
          },
          {
            key: "owner",
            header: "ผู้รับผิดชอบ",
            render: (row) => {
              const mine = (row.assigneeId || row.assignedTo) === user.id;
              const name = mine ? "คุณ" : fallback(row.assigneeName, row.assigneeId || row.assignedTo);
              return (
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${mine ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {String(name).replace(/^ผู้ใช้\s*#?/, "").charAt(0).toUpperCase() || "?"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-slate-800">{name}</p>
                    {dispute && (
                      <p className="truncate text-xs text-slate-500">
                        {TEAM_SHORT[row.assignedRole] || "ไม่ทราบทีม"}
                      </p>
                    )}
                  </div>
                </div>
              );
            },
          },
        ]),
    ...(closedView
      ? [
          {
            key: "closedAt",
            header: "ปิดเมื่อ",
            render: (row) => (
              <span className="whitespace-nowrap tabular-nums text-slate-600">
                {thaiDate(row.decidedAt || row.closedAt || row.resolvedAt || row.updatedAt)}
              </span>
            ),
          },
          {
            key: "csat",
            header: "ความพึงพอใจ",
            render: (row) => <CsatCell ratings={row.csat} />,
          },
        ]
      : []),
    {
      key: "open",
      header: <span className="sr-only">เปิดเคส</span>,
      align: "right",
      render: (row) => (
        <button
          type="button"
          aria-label="เปิดเคส"
          title="เปิดเคส"
          disabled={busy || chatBusy}
          onClick={(e) => {
            e.stopPropagation();
            select(row);
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      ),
    },
  ];
  // Fixed widths (Tailwind literals) keep column rhythm stable across tabs
  // and row counts; the open action keeps a fixed 64px.
  const COLUMN_WIDTH = closedView
    ? { id: "w-[13%]", subject: "w-[35%]", closedAt: "w-[12%]", csat: "w-[34%]" }
    : dispute
      ? { id: "w-[11%]", subject: "w-[23%]", amount: "w-[10%]", status: "w-[14%]", priority: "w-[11%]", sla: "w-[13%]", owner: "w-[12%]" }
      : { id: "w-[12%]", subject: "w-[29%]", status: "w-[14%]", priority: "w-[11%]", sla: "w-[16%]", owner: "w-[12%]" };
  // Text reads left-aligned; badge-like UI (status, priority, stars, the
  // open action) is centred in its column.
  const CENTERED = new Set(["status", "priority", "csat", "open"]);
  const tableColumns = columns.map((column) => ({
    ...column,
    align: CENTERED.has(column.key) ? "center" : "left",
    headerClassName: column.key === "open" ? "w-16" : COLUMN_WIDTH[column.key],
  }));
  const mapped = (queue.items || []).map((row) => ({
    ...row,
    ticketNumber:
      row.ticketNumber || `#${row.id.slice(0, 8)}…${row.id.slice(-4)}`,
    subject: row.subject || row.reason,
    priority: row.queuePriority || row.priority,
  }));
  const modeControl = (
    <div className="flex shrink-0 justify-end">
      <div
        role="group"
        aria-label="มุมมองเคส"
        className="relative isolate grid grid-cols-2 rounded-xl bg-slate-100 p-1"
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${state.view === "table" ? "translate-x-full" : "translate-x-0"}`}
        />
        {[
          ["workspace", "สนทนา"],
          ["table", "ตาราง"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={state.view === value}
            disabled={chatBusy || busy}
            onClick={() => setView(value)}
            className={`relative z-10 min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors ${state.view === value ? "text-emerald-700" : "text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div
      className={`${layoutStyles.layout} relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50`}
    >
      {modeHost ? createPortal(modeControl, modeHost) : modeControl}
      {state.view === "table" ? (
        <div
          className={`min-h-0 flex-1 overflow-auto p-4 sm:p-6 ${layoutStyles.surfaceEnter}`}
        >
          <div className="mb-4 flex gap-5 overflow-x-auto border-b border-slate-200">
            {tableScopes.map(({ value, label }) => (
              <Button
                key={value}
                variant="ghost"
                className={`!min-h-11 !rounded-none !border-b-2 !bg-transparent !px-1 !text-sm ${state.scope === value ? "!border-emerald-600 !text-emerald-800" : "!border-transparent !text-slate-500"}`}
                onClick={() => filter("scope", value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {filters}
          {w.error && (
            <Alert>
              {w.error}
              <Button onClick={w.refresh}>ลองใหม่</Button>
            </Alert>
          )}
          {closedView && <CsatSummary rows={queue.items || []} />}
          <p className="mb-2 text-xs text-slate-600">
            ทั้งหมด {queue.total || 0} รายการ
          </p>
          <DataTable
            columns={tableColumns}
            fixed
            rows={queue.items || []}
            loading={w.loading}
            onRowClick={select}
          />
          <Pagination
            page={state.page}
            totalPages={queue.totalPages || 1}
            onChange={(page) => w.update({ page })}
            onPageChange={(page) => w.update({ page })}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className={`${layoutStyles.queue} ${state.selectedId ? layoutStyles.queueSelected : ""} flex min-h-0 w-full shrink-0 flex-col md:w-72 lg:w-[19rem]`}
          >
            <SupportQueueSidebar
              unreadCounts={unread.summary}
              unreadError={unread.error}
              tickets={mapped}
              selectedTicketId={state.selectedId}
              onSelectTicket={select}
              scope={state.scope}
              scopes={sidebarScopes}
              onScopeChange={(value) => filter("scope", value)}
              search={state.search}
              onSearchChange={(value) => filter("search", value)}
              loading={w.loading}
              error={w.error}
              onRefresh={w.refresh}
              className="flex !w-full min-h-0 flex-1"
              domain={domain}
              filters={filters}
            />
            <div className="shrink-0 border-t bg-white p-2">
              <p className="text-center text-xs text-slate-500">
                ทั้งหมด {queue.total || 0} รายการ
              </p>
              <Pagination
                page={state.page}
                totalPages={queue.totalPages || 1}
                onChange={(page) => w.update({ page })}
              />
            </div>
          </div>
          <main
            className={`${state.selectedId ? "" : layoutStyles.mainEmpty} flex min-h-0 min-w-0 flex-1 flex-col bg-white`}
          >
            {w.detailLoading ? (
              <div role="status" className="p-6">
                กำลังโหลดรายละเอียดเคส…
              </div>
            ) : w.detailError ? (
              <div className="p-6">
                <Alert>{w.detailError}</Alert>
                <Button onClick={w.retryDetail}>ลองใหม่</Button>
                <Button
                  variant="secondary"
                  onClick={() => w.update({ selectedId: null })}
                >
                  กลับคิว
                </Button>
              </div>
            ) : !selected ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
                เลือกเคสจากคิวเพื่อเริ่มทำงาน
              </div>
            ) : (
              <>
                {w.refreshError && (
                  <Alert>
                    {w.refreshError}
                    <Button variant="secondary" onClick={w.retryDetail}>
                      โหลดข้อมูลล่าสุด
                    </Button>
                  </Alert>
                )}
                <header className="flex flex-col items-stretch justify-between gap-2 border-b px-3 py-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <h2
                      title={selected.subject || selected.reason}
                      className="truncate text-sm font-semibold text-slate-900"
                    >
                      {selected.subject || selected.reason}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
                      <span className="font-medium">
                        {selected.ticketNumber ||
                          `#${selected.id.slice(0, 8)}…${selected.id.slice(-4)}`}
                      </span>
                      <span>{labels[selected.status] || selected.status}</span>
                      <span>
                        {(selected.assigneeId || selected.assignedTo) ===
                        user.id
                          ? "คุณรับผิดชอบ"
                          : fallback(
                              selected.assigneeName,
                              selected.assigneeId || selected.assignedTo,
                            )}
                      </span>
                      <SlaIndicator sla={selected.sla} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={chatBusy}
                      onClick={() => w.update({ selectedId: null })}
                      className={layoutStyles.back}
                    >
                      กลับคิว
                    </Button>
                    <Button
                      variant="secondary"
                      icon="article"
                      className={contextStyles.contextToggle}
                      onClick={(event) => {
                        contextTrigger.current = event.currentTarget;
                        event.currentTarget.focus();
                        setContext((v) => !v);
                      }}
                      aria-expanded={context}
                    >
                      ข้อมูลเคส
                      <span className={`material-symbols-outlined ${contextStyles.toggleChevron}`} aria-hidden="true">chevron_right</span>
                    </Button>
                  </div>
                </header>
                <CaseHandoffBanner
                  key={selected.id}
                  caseItem={selected}
                  caps={caps}
                  busy={busy || chatBusy}
                  onEscalate={() => setMemo(true)}
                  onTaskChange={updateReturnTask}
                />
                {!mapped.some((row) => row.id === selected.id) &&
                  !w.loading && (
                    <p className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800">
                      เคสนี้ไม่อยู่ในตัวกรองปัจจุบันแล้ว
                    </p>
                  )}
                {dispute && (
                  <div
                    role="tablist"
                    aria-label="เลือกคู่สนทนา"
                    className="flex gap-1 border-b px-3 py-1"
                  >
                    {[
                      [
                        "buyer",
                        "ผู้ซื้อ",
                        selected.buyerName,
                        selected.order?.buyerId,
                      ],
                      [
                        "seller",
                        "ร้านค้า",
                        selected.sellerName,
                        selected.order?.sellerId,
                      ],
                    ].map(([side, label, name, id]) => (
                      <button
                        key={side}
                        type="button"
                        role="tab"
                        id={`case-chat-${side}-${selected.id}`}
                        aria-controls={`case-transcript-${selected.id}`}
                        tabIndex={(room?.side || state.side) === side ? 0 : -1}
                        aria-selected={(room?.side || state.side) === side}
                        disabled={
                          joining ||
                          chatBusy ||
                          busy ||
                          (!room && !caps.canReply && !elevated)
                        }
                        onClick={() => join(side)}
                        onKeyDown={(e) => {
                          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                            e.preventDefault();
                            if (!joining && !chatBusy) {
                              const other =
                                e.currentTarget.parentElement.querySelector(
                                  `[role="tab"][aria-selected="false"]`,
                                );
                              const nextSide =
                                side === "buyer" ? "seller" : "buyer";
                              const previous = e.currentTarget;
                              join(nextSide).then((success) =>
                                requestAnimationFrame(() => {
                                  const target = success ? other : previous;
                                  if (target?.isConnected) target.focus();
                                }),
                              );
                            }
                          }
                        }}
                        className={`min-h-11 min-w-0 flex-1 truncate rounded-lg px-3 text-xs transition-colors ${(room?.side || state.side) === side ? "bg-emerald-50 font-semibold text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        {label} · {fallback(name, id)}
                      </button>
                    ))}
                  </div>
                )}
                {roomError && (
                  <Alert>
                    {roomError}
                    <Button
                      disabled={chatBusy}
                      variant="secondary"
                      onClick={() => join(state.side)}
                    >
                      ลองเปิดแชทอีกครั้ง
                    </Button>
                  </Alert>
                )}
                <div
                  className="flex min-h-0 flex-1 flex-col"
                  role={dispute ? "tabpanel" : "region"}
                  id={`case-transcript-${selected.id}`}
                  aria-labelledby={
                    dispute
                      ? `case-chat-${room?.side || state.side}-${selected.id}`
                      : undefined
                  }
                  aria-label={dispute ? undefined : "สนทนากับผู้แจ้ง"}
                >
                  {!room && (
                    <p
                      role="status"
                      className="px-3 py-2 text-xs text-slate-500"
                    >
                      {joining ? "กำลังเปิดห้องสนทนา…" : "รับเคสก่อนเริ่มสนทนา"}
                    </p>
                  )}
                  {room?.id === selected.id ? (
                    <EmbeddedChat
                      framed={false}
                      recipientLabel={`ผู้รับ: ${dispute ? (room.side === "buyer" ? "ผู้ซื้อ · " + fallback(selected.buyerName, selected.order?.buyerId) : "ร้านค้า · " + fallback(selected.sellerName, selected.order?.sellerId)) : fallback(selected.requesterName, selected.requesterId)}${dispute ? " เท่านั้น" : ""}`}
                      hideInternal={!dispute}
                      onCommitted={w.refreshAfterReply}
                      recipientId={
                        dispute
                          ? room.side === "buyer"
                            ? selected.order?.buyerId
                            : selected.order?.sellerId
                          : selected.requesterId
                      }
                      otherName={
                        dispute
                          ? room.side === "buyer"
                            ? fallback(
                                selected.buyerName,
                                selected.order?.buyerId,
                              )
                            : fallback(
                                selected.sellerName,
                                selected.order?.sellerId,
                              )
                          : fallback(
                              selected.requesterName,
                              selected.requesterId,
                            )
                      }
                      onAccessDenied={() => {
                        // Refresh once per room; a persistent 403 must not remount-loop.
                        if (deniedRoom.current === room.conversationId) return;
                        deniedRoom.current = room.conversationId;
                        w.refresh();
                      }}
                      key={room.conversationId}
                      conversationId={room.conversationId}
                      maxHeight="100%"
                      readOnly={
                        joining ||
                        busy ||
                        Boolean(room.readOnly) ||
                        !caps.canReply ||
                        ["CLOSED", "DECIDED"].includes(selected.status)
                      }
                      draftKey={`reloop:case-draft:${user.id}:${domain}:${selected.id}:${room.side}`}
                      onBusyChange={setChatBusy}
                    />
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-500">
                      {joining
                        ? "กำลังโหลดแชท"
                        : "ยังเปิดห้องสนทนาไม่ได้ คุณตรวจสอบข้อมูลเคสได้"}
                    </div>
                  )}
                  {!dispute && caps.canTakeover && <Button onClick={()=>run("takeover",{version:selected.version,reason:"รับผิดชอบการตรวจสอบเคสที่ส่งต่อ"})} disabled={busy}>รับผิดชอบเคสที่ส่งต่อ</Button>}
                      {caps.canClaim && (
                    <div className="flex items-center justify-between gap-3 border-t bg-amber-50 p-4">
                      <span className="text-sm text-amber-800">
                        รับเคสก่อนเริ่มตอบลูกค้า
                      </span>
                      <Button loading={busy} disabled={busy} onClick={claim}>
                        รับเคสนี้
                      </Button>
                    </div>
                  )}
                  {!caps.canReply && selected.assignedTo && (
                    <p className="border-t p-3 text-center text-xs text-slate-500">
                      {caps.readOnlyReason || "ดูประวัติแบบอ่านอย่างเดียว"}
                    </p>
                  )}
                </div>
              </>
            )}
          </main>
          <CaseContextPanel
            open={context && Boolean(selected)}
            onClose={closeContext}
            footer={selected ? (
              <section aria-label="การจัดการเคส" className={`${contextStyles.contextSection} ${contextStyles.management}`}>
                    <h3 className={contextStyles.sectionHeading}><span className="material-symbols-outlined" aria-hidden="true">tune</span>การจัดการเคส</h3>
                    <div className={contextStyles.actions}>
                    {caps.canClaim && (
                      <Button className={contextStyles.actionPrimary} icon="assignment_ind" disabled={busy || chatBusy} onClick={claim}>
                        รับเคสนี้
                      </Button>
                    )}
                    {!dispute &&
                      (caps.allowedNextStatuses || [])
                        .filter((status) => status !== "ESCALATED")
                        .map((status) => (
                          <Button
                            key={status}
                            variant="secondary"
                            className={status === "CLOSED" ? contextStyles.actionClose : status === "PENDING_USER" ? contextStyles.actionInfo : contextStyles.actionPrimary}
                            icon={status === "CLOSED" ? "task_alt" : status === "PENDING_USER" ? "hourglass_top" : status === "RESOLVED" ? "check_circle" : "play_arrow"}
                            disabled={busy || chatBusy}
                            onClick={async () => {
                              if (status === "CLOSED") {
                                setDecision({
                                  ticketClose: true,
                                  id: selected.id,
                                  version: selected.version,
                                });
                                return;
                              }
                              try {
                                await run("status", { status }, "PATCH");
                              } catch (err) {
                                toast.error(err.message);
                              }
                            }}
                          >
                            {status === "IN_PROGRESS" &&
                            selected.status === "RESOLVED"
                              ? "กลับมาดำเนินการ"
                              : ACTION_LABEL[status] || status}
                          </Button>
                        ))}
                    {caps.canEscalate && (
                      <Button
                        variant="secondary"
                        disabled={busy || chatBusy}
                        className={contextStyles.actionWarning}
                        icon="forward_to_inbox"
                        onClick={() => setMemo(true)}
                      >
                        ส่งต่อให้ Trust and Safety
                      </Button>
                    )}
                    {caps.canReassign && (
                      <Button
                        variant="secondary"
                        disabled={busy || chatBusy}
                        className={contextStyles.actionInfo}
                        icon="manage_accounts"
                        onClick={() => setReassign(true)}
                      >
                        เปลี่ยนผู้รับผิดชอบ
                      </Button>
                    )}
                    {caps.canDecide && (
                      <>
                        <textarea
                          aria-label="เหตุผลประกอบคำตัดสิน"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          className="w-full rounded border p-2 text-sm"
                          placeholder="เหตุผลประกอบคำตัดสิน"
                        />
                        <Button
                          className={contextStyles.actionWarning}
                          disabled={busy || !reason.trim()}
                          onClick={() =>
                            setDecision({
                              outcome: "APPROVE_REFUND",
                              reason: reason.trim(),
                              version: selected.version,
                              id: selected.id,
                              key: crypto.randomUUID(),
                            })
                          }
                        >
                          พิจารณาคืนเงิน
                        </Button>
                        <Button
                          variant="secondary"
                          className={contextStyles.actionWarning}
                          disabled={busy || !reason.trim()}
                          onClick={() =>
                            setDecision({
                              outcome: "RELEASE_ESCROW",
                              reason: reason.trim(),
                              version: selected.version,
                              id: selected.id,
                              key: crypto.randomUUID(),
                            })
                          }
                        >
                          พิจารณาปล่อยเงินให้ร้านค้า
                        </Button>
                      </>
                    )}
                    {caps.canRequestEvidence && (
                      <Button
                        variant="secondary"
                        className={contextStyles.actionInfo}
                        icon="assignment_return"
                        disabled={busy}
                        onClick={() => setReturnDialog(true)}
                      >
                        ส่งกลับให้ CS ดำเนินการเพิ่ม
                      </Button>
                    )}
                    {selected.status === "DECIDED" && (
                      <div className="rounded bg-emerald-50 p-3 text-sm">
                        <p>
                          ผลการตัดสิน:{" "}
                          {selected.decision === "APPROVE_REFUND"
                            ? "คืนเงินให้ผู้ซื้อ"
                            : selected.decision === "RELEASE_ESCROW"
                              ? "ปล่อยเงินให้ร้านค้า"
                              : selected.decision}
                        </p>
                        <p className="whitespace-pre-wrap">
                          {selected.decisionReason}
                        </p>
                      </div>
                    )}
                    </div>
                  </section>
            ) : null}
          >
            {selected && (
              <div className={contextStyles.contextBody}>
                <div className={contextStyles.sections}>
                  <section className={contextStyles.caseSummary}>
                    <div className={contextStyles.summaryTop}>
                      <span className={contextStyles.caseType}>{dispute ? "ข้อพิพาท" : "Ticket"}</span>
                      <span className={contextStyles.status}>{labels[selected.status] || selected.status}</span>
                    </div>
                    <p className={contextStyles.caseNumber}>{selected.ticketNumber || selected.id}</p>
                    <h3 className={contextStyles.subject}>{(dispute ? selected.reason || selected.subject : selected.subject) || "รายละเอียดเคส"}</h3>
                    {selected.description && selected.description !== selected.subject && (
                      <p className={contextStyles.description}>{selected.description}</p>
                    )}
                    {selected.category && (
                      <div className={contextStyles.category}><span>หมวดหมู่</span><span>{selected.categoryLabel || selected.category}</span></div>
                    )}
                    <div className={contextStyles.sla}>
                      <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
                      <SlaIndicator sla={selected.sla} />
                    </div>
                  </section>
                  <section className={contextStyles.contextSection}>
                    <h3 className={contextStyles.sectionHeading}><span className="material-symbols-outlined" aria-hidden="true">group</span>ผู้เกี่ยวข้อง</h3>
                    <dl className={contextStyles.people}>
                      {dispute ? (
                        <>
                          <div><dt>ผู้ซื้อ</dt><dd>{personIdentity(selected.buyerName, selected.order?.buyerId)}</dd></div>
                          <div><dt>ร้านค้า</dt><dd>{personIdentity(selected.sellerName, selected.order?.sellerId)}</dd></div>
                        </>
                      ) : (
                        <div><dt>ผู้แจ้ง</dt><dd>{personIdentity(selected.requesterName, selected.requesterId)}</dd></div>
                      )}
                      <div><dt>เจ้าหน้าที่</dt><dd>
                        {(selected.assigneeId || selected.assignedTo) === user.id
                          ? <span className={contextStyles.you}>คุณ</span>
                          : fallback(selected.assigneeName, selected.assigneeId || selected.assignedTo)}
                        {dispute && ROLE_LABEL[selected.assignedRole] && <span className={contextStyles.role}>{ROLE_LABEL[selected.assignedRole]}</span>}
                      </dd></div>
                    </dl>
                  </section>
                  {selected.orderId && (
                    <section className={`${contextStyles.contextSection} ${contextStyles.orderSection}`}>
                      <h3 className={contextStyles.sectionHeading}><span className="material-symbols-outlined" aria-hidden="true">shopping_bag</span>คำสั่งซื้อ</h3>
                      <p className="mt-2 break-all text-sm">
                        {selected.orderId}
                      </p>
                      {dispute && (
                        <>
                          <p className="text-sm">
                            {selected.order?.productTitle || "ไม่พบชื่อสินค้า"}
                          </p>
                          <p className="mt-2 text-sm">
                            ยอดเงินในเคส:{" "}
                            {currency(
                              selected.order?.finalPrice ??
                                selected.order?.price,
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            สถานะออเดอร์:{" "}
                            {ORDER_STATUS_LABEL[selected.order?.status] ||
                              selected.order?.status ||
                              "ไม่พบข้อมูล"}
                          </p>
                          <p className="mt-2 text-sm">
                            การระงับเงิน:{" "}
                            {selected.order?.payoutHeld === true
                              ? "อยู่ระหว่างระงับ"
                              : selected.order?.payoutHeld === false
                                ? "ไม่ได้ระงับ"
                                : "ไม่พบข้อมูล"}
                          </p>
                        </>
                      )}
                    </section>
                  )}
                  {selected.escalationNote && (
                    <section className={contextStyles.contextSection}>
                      <h3 className={contextStyles.sectionHeading}><span className="material-symbols-outlined" aria-hidden="true">forward_to_inbox</span>สรุปส่งต่อ</h3>
                      <p className="whitespace-pre-line text-sm">
                        {selected.escalationNote}
                      </p>
                    </section>
                  )}
                  {dispute ? (
                    <><EvidenceInspector key={selected.id} dispute={selected} />{["ADMIN","TRUST_AND_SAFETY"].includes(user.role) && <Button variant="secondary" onClick={()=>setSafetyChat(selected)}>ประวัติผู้ซื้อกับร้านค้า</Button>}</>
                  ) : (
                    <section className={contextStyles.contextSection}>
                      <h3 className={contextStyles.sectionHeading}><span className="material-symbols-outlined" aria-hidden="true">edit_note</span>โน้ตภายใน</h3>
                      <p className={contextStyles.hint}>สำหรับเจ้าหน้าที่เท่านั้น ลูกค้าจะไม่เห็นโน้ตนี้</p>
                      {selected.chatAvailable === false ? (
                        <Alert>ประวัติโน้ตไม่พร้อมใช้งาน กรุณาลองใหม่</Alert>
                      ) : (
                        (selected.messages || [])
                          .filter((message) => message.isInternal)
                          .map((message) => (
                            <p
                              key={message.id}
                              className={contextStyles.savedNote}
                            >
                              {message.body}
                            </p>
                          ))
                      )}
                      {selected.messagesNextCursor && (
                        <Button
                          variant="secondary"
                          disabled={w.loadingNotes || busy}
                          onClick={w.loadOlderNotes}
                        >
                          {w.loadingNotes
                            ? "กำลังโหลดประวัติเก่า…"
                            : "โหลดโน้ตและประวัติเก่าเพิ่มเติม"}
                        </Button>
                      )}
                      {w.notesError && <Alert>{w.notesError}</Alert>}
                      {caps.canAddNote && (
                        <>
                          <label className="sr-only" htmlFor="case-internal-note">บันทึกภายใน</label>
                          <textarea
                            id="case-internal-note"
                            aria-label="บันทึกภายใน"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="เพิ่มรายละเอียดหรือสรุปการติดตามเคส…"
                            className={contextStyles.noteInput}
                            rows={3}
                          />
                          {noteError && <Alert>{noteError}</Alert>}
                          <Button
                            size="sm"
                            icon="note_add"
                            className={contextStyles.saveNote}
                            disabled={busy || chatBusy || !note.trim()}
                            onClick={async () => {
                              setNoteError("");
                              try {
                                await run("messages", {
                                  body: note.trim(),
                                  isInternal: true,
                                });
                                setNote("");
                              } catch (err) {
                                setNoteError(err.message);
                              }
                            }}
                          >
                            บันทึกโน้ต
                          </Button>
                        </>
                      )}
                    </section>
                  )}

                </div>
              </div>
            )}
          </CaseContextPanel>
        </div>
      )}
      <Modal open={Boolean(safetyChat)} onClose={()=>setSafetyChat(null)} title="ประวัติผู้ซื้อกับร้านค้า" size="lg">{safetyChat && <SafetyOrderChatPanel dispute={safetyChat} token={token} onClose={()=>setSafetyChat(null)}/>}</Modal>
      <ReturnToCsDialog
        key={`return-${selected?.id || "empty"}`}
        open={returnDialog}
        onClose={() => setReturnDialog(false)}
        onSubmit={({ reason: text, tasks }) =>
          run("request-evidence", {
            version: selected.version,
            reason: text,
            tasks,
          })
        }
      />
      <EscalationMemoDialog
        dispute={dispute}
        returnTasks={caps.isReturned ? selected?.returnTasks : undefined}
        onTaskChange={updateReturnTask}
        key={selected?.id || "empty"}
        open={memo}
        onClose={() => setMemo(false)}
        onSubmit={(text) =>
          run(
            dispute ? "escalate" : "status",
            dispute
              ? { reason: text, version: selected.version }
              : { status: "ESCALATED", reason: text },
            dispute ? "POST" : "PATCH",
          )
        }
      />
      {reassign && selected && (
        <StaffReassignDialog
          dispute={selected}
          token={token}
          onClose={() => setReassign(false)}
          onSubmit={(toUserId, text) =>
            run("reassign", {
              toUserId,
              reason: text,
              version: selected.version,
            })
          }
        />
      )}
      <Modal
        open={Boolean(decision)}
        onClose={
          busy
            ? undefined
            : () => {
                setDecision(null);
                setDecisionError("");
              }
        }
        title={
          decision?.ticketClose ? "ยืนยันปิดเคส" : "ตรวจสอบคำตัดสินก่อนยืนยัน"
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setDecision(null);
                setDecisionError("");
              }}
            >
              ยกเลิก
            </Button>
            <Button
              disabled={busy}
              loading={busy}
              onClick={async () => {
                setDecisionError("");
                try {
                  if (decision.ticketClose)
                    await run(
                      "status",
                      { status: "CLOSED", version: decision.version },
                      "PATCH",
                    );
                  else
                    await run("decision", {
                      decision: decision.outcome,
                      reason: decision.reason,
                      version: decision.version,
                      idempotencyKey: decision.key,
                    });
                  setDecision(null);
                } catch (err) {
                  setDecisionError(err.message);
                  if (err.status === 409) {
                    toast.error(
                      "เคสมีข้อมูลใหม่ กรุณาตรวจสอบก่อนยืนยันอีกครั้ง",
                    );
                    setDecision(null);
                  }
                }
              }}
            >
              ยืนยัน
            </Button>
          </>
        }
      >
        {decisionError && <Alert>{decisionError}</Alert>}
        <p className="break-all text-sm">
          เคส {selected?.ticketNumber || selected?.id}
        </p>
        {decision?.ticketClose ? (
          <p className="mt-3 text-sm">
            การปิดเคสจะปิดการตอบข้อความ กรุณาตรวจสอบว่าดำเนินการครบแล้ว
          </p>
        ) : (
          <>
            <p className="mt-3">
              {decision?.outcome === "APPROVE_REFUND"
                ? "คืนเงินให้ผู้ซื้อ"
                : "ปล่อยเงินให้ร้านค้า"}{" "}
              ·{" "}
              {currency(selected?.order?.finalPrice ?? selected?.order?.price)}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm">
              {decision?.reason}
            </p>
            <p className="mt-3 text-sm text-amber-800">
              คำตัดสินนี้เป็นผลสุดท้ายของข้อพิพาท โปรดตรวจสอบผู้รับและยอดเงิน
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}
