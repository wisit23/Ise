"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { apiFetch } from "../../../lib/api";
import { getStoredUser } from "../../../lib/auth";
import {
  TICKET_STATUS_LABEL,
  DISPUTE_STATUS_LABEL,
  PRIORITY_LABEL,
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
import SlaIndicator from "./SlaIndicator";
import CaseFilters from "./CaseFilters";
import CaseContextPanel from "./CaseContextPanel";
import EscalationMemoDialog from "./EscalationMemoDialog";
import EvidenceInspector from "./EvidenceInspector";
import StaffReassignDialog from "./StaffReassignDialog";
import layoutStyles from "./workspace.module.css";

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
  const user = currentUser || getStoredUser() || {};
  const dispute = domain === "disputes";
  const w = useCaseWorkspace(domain, token, user.id);
  const { state, detail, queue, busy } = w;
  const toast = useToast();
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
  const [infoReason, setInfoReason] = useState("");
  const [infoError, setInfoError] = useState("");
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
    setRoom(null);
    setJoining(false);
    setRoomError("");
    setContext(false);
    setMemo(false);
    setReassign(false);
    setDecision(null);
    setNote("");
    setReason("");
    setInfoReason("");
    setInfoError("");
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
          ? "ส่งต่อให้ Admin แล้ว"
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
  const filter = (key, value) =>
    w.update(
      key === "resetFilters"
        ? { status: "", priority: "", work: "", page: 1 }
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
  const columns = [
    {
      key: "id",
      header: "เลขเคส",
      render: (row) => (
        <button
          type="button"
          aria-label={`คัดลอกเลขเคส ${row.ticketNumber || row.id}`}
          title={row.ticketNumber || row.id}
          className="min-h-11 whitespace-nowrap font-mono text-xs text-slate-700 hover:text-emerald-700"
          onClick={async (event) => {
            event.stopPropagation();
            try {
              await navigator.clipboard.writeText(row.ticketNumber || row.id);
              toast.success("คัดลอกเลขเคสแล้ว");
            } catch {
              toast.error("คัดลอกไม่ได้ คุณเปิดข้อมูลบริบทเพื่อดูเลขเต็มได้");
            }
          }}
        >
          {row.ticketNumber || `#${row.id.slice(0, 8)}…${row.id.slice(-4)}`}{" "}
          <span
            aria-hidden="true"
            className="material-symbols-outlined align-middle text-[14px]"
          >
            content_copy
          </span>
        </button>
      ),
    },
    {
      key: "subject",
      header: dispute ? "เหตุผล / ออเดอร์" : "หัวข้อ / ผู้แจ้ง",
      render: (row) => (
        <div className="min-w-[190px] max-w-[320px]">
          <p className="line-clamp-2 font-medium">
            {row.subject || row.reason}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {dispute
              ? row.orderId
              : fallback(row.requesterName, row.requesterId)}
          </p>
        </div>
      ),
    },
    ...(dispute
      ? [
          {
            key: "parties",
            header: "ผู้ซื้อ / ร้านค้า",
            render: (row) => (
              <div className="text-xs">
                <p>{fallback(row.buyerName, row.order?.buyerId)}</p>
                <p>{fallback(row.sellerName, row.order?.sellerId)}</p>
              </div>
            ),
          },
          {
            key: "amount",
            header: "ยอดเงินในเคส",
            render: (row) =>
              currency(row.order?.finalPrice ?? row.order?.price),
          },
        ]
      : []),
    {
      key: "status",
      header: "สถานะ",
      render: (row) => labels[row.status] || row.status,
    },
    {
      key: "priority",
      header: "ความสำคัญ",
      render: (row) =>
        PRIORITY_LABEL[row.queuePriority || row.priority] ||
        row.queuePriority ||
        row.priority ||
        "—",
    },
    {
      key: "sla",
      header: "SLA",
      render: (row) => <SlaIndicator sla={row.sla} />,
    },
    {
      key: "owner",
      header: "ผู้รับผิดชอบ",
      render: (row) => (
        <div>
          {(row.assigneeId || row.assignedTo) === user.id
            ? "คุณ"
            : fallback(row.assigneeName, row.assigneeId || row.assignedTo)}
          {dispute && (
            <p className="text-xs text-slate-500">
              {ROLE_LABEL[row.assignedRole] || "ไม่ทราบทีม"}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "วันที่เปิด",
      render: (row) =>
        row.createdAt
          ? new Date(row.createdAt).toLocaleDateString("th-TH", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—",
    },
    {
      key: "open",
      header: "เปิดเคส",
      render: (row) => (
        <Button
          size="sm"
          disabled={busy || chatBusy}
          onClick={(e) => {
            e.stopPropagation();
            select(row);
          }}
        >
          เปิดเคส
        </Button>
      ),
    },
  ];
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
          <div className="mb-4 flex gap-5 border-b border-slate-200">
            {[
              ["mine", "งานของฉัน"],
              ["unassigned", "รอรับเรื่อง"],
              ["all", "ทุกงาน"],
            ].map(([value, label]) => (
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
          <p className="mb-2 text-xs text-slate-600">
            ทั้งหมด {queue.total || 0} รายการ
          </p>
          <DataTable
            columns={columns}
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
              tickets={mapped}
              selectedTicketId={state.selectedId}
              onSelectTicket={select}
              scope={state.scope}
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
                    {!dispute && (
                      <Link
                        href={`/support/tickets/${selected.id}`}
                        target="_blank"
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        เปิดหน้าเคส ↗
                      </Link>
                    )}
                    <Button
                      variant="secondary"
                      onClick={(event) => {
                        contextTrigger.current = event.currentTarget;
                        event.currentTarget.focus();
                        setContext((v) => !v);
                      }}
                      aria-expanded={context}
                    >
                      ข้อมูลบริบท
                    </Button>
                  </div>
                </header>
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
                      onAccessDenied={w.refresh}
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
                        : "ยังเปิดห้องสนทนาไม่ได้ คุณตรวจสอบข้อมูลบริบทได้"}
                    </div>
                  )}
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
          >
            {selected && (
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="space-y-5">
                  <section>
                    <h3 className="font-semibold">รายละเอียดเคส</h3>
                    <p className="mt-2 break-all font-mono text-xs text-slate-500">
                      เลขเคส: {selected.ticketNumber || selected.id}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {selected.description ||
                        selected.reason ||
                        selected.subject}
                    </p>
                    {selected.category && (
                      <p className="mt-2 text-sm text-slate-600">
                        หมวดหมู่: {selected.categoryLabel || selected.category}
                      </p>
                    )}
                  </section>
                  <section>
                    <h3 className="font-semibold">ผู้เกี่ยวข้อง</h3>
                    {dispute ? (
                      <>
                        <p className="mt-2 text-sm">
                          ผู้ซื้อ:{" "}
                          {fallback(
                            selected.buyerName,
                            selected.order?.buyerId,
                          )}
                        </p>
                        <p className="text-sm">
                          ร้านค้า:{" "}
                          {fallback(
                            selected.sellerName,
                            selected.order?.sellerId,
                          )}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm">
                        ผู้แจ้ง:{" "}
                        {fallback(selected.requesterName, selected.requesterId)}
                      </p>
                    )}
                    <p className="mt-2 break-all text-xs text-slate-500">
                      เจ้าหน้าที่:{" "}
                      {(selected.assigneeId || selected.assignedTo) === user.id
                        ? "คุณ"
                        : fallback(
                            selected.assigneeName,
                            selected.assigneeId || selected.assignedTo,
                          )}{" "}
                      {dispute ? ROLE_LABEL[selected.assignedRole] || "" : ""}
                    </p>
                  </section>
                  {selected.orderId && (
                    <section>
                      <h3 className="font-semibold">คำสั่งซื้อ</h3>
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
                  <section>
                    <SlaIndicator sla={selected.sla} />
                  </section>
                  {selected.escalationNote && (
                    <section>
                      <h3 className="font-semibold">สรุปส่งต่อ</h3>
                      <p className="whitespace-pre-line text-sm">
                        {selected.escalationNote}
                      </p>
                    </section>
                  )}
                  {dispute ? (
                    <EvidenceInspector key={selected.id} dispute={selected} />
                  ) : (
                    <section>
                      <h3 className="font-semibold">โน้ตภายใน</h3>
                      {selected.chatAvailable === false ? (
                        <Alert>ประวัติโน้ตไม่พร้อมใช้งาน กรุณาลองใหม่</Alert>
                      ) : (
                        (selected.messages || [])
                          .filter((message) => message.isInternal)
                          .map((message) => (
                            <p
                              key={message.id}
                              className="my-2 whitespace-pre-wrap rounded border bg-amber-50 p-2 text-sm"
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
                          <textarea
                            aria-label="บันทึกภายใน"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="ลูกค้าจะไม่เห็นโน้ตนี้"
                            className="mt-2 w-full rounded border p-2 text-sm"
                            rows={3}
                          />
                          {noteError && <Alert>{noteError}</Alert>}
                          <Button
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
                  <section className="space-y-2 border-t pt-4">
                    <h3 className="font-semibold">การจัดการเคส</h3>
                    {caps.canClaim && (
                      <Button disabled={busy || chatBusy} onClick={claim}>
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
                        onClick={() => setMemo(true)}
                      >
                        ส่งต่อให้ Admin
                      </Button>
                    )}
                    {caps.canReassign && (
                      <Button
                        variant="secondary"
                        disabled={busy || chatBusy}
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
                      <div className="space-y-2">
                        <textarea
                          aria-label="เหตุผลขอหลักฐานเพิ่มเติม"
                          value={infoReason}
                          onChange={(e) => setInfoReason(e.target.value)}
                          rows={2}
                          className="w-full rounded border p-2 text-sm"
                          placeholder="ระบุข้อมูลที่ต้องการเพิ่มเติม"
                        />
                        {infoError && <Alert>{infoError}</Alert>}
                        <Button
                          variant="secondary"
                          disabled={busy || !infoReason.trim()}
                          onClick={async () => {
                            setInfoError("");
                            try {
                              await run("request-evidence", {
                                version: selected.version,
                                reason: infoReason.trim(),
                              });
                              setInfoReason("");
                            } catch (err) {
                              setInfoError(err.message);
                            }
                          }}
                        >
                          ขอหลักฐานเพิ่มเติม
                        </Button>
                      </div>
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
                  </section>
                </div>
              </div>
            )}
          </CaseContextPanel>
        </div>
      )}
      <EscalationMemoDialog
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
