"use client";

import { useEffect, useState } from "react";
import Badge from "../../../panel/ui/Badge";
import Button from "../../../ui/Button";
import Alert from "../../../ui/Alert";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  AGENT_NEXT_STATUS,
} from "../../../../lib/supportConstants";

export default function SupportCaseDetails({
  ticket,
  onAssign,
  onStatusChange,
  onAddInternalNote,
  actionBusy,
  actionError,
  onClose,
}) {
  const [internalNote, setInternalNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (!ticket) return null;

  const nextStatuses = AGENT_NEXT_STATUS[ticket.status] || [];
  const internalNotes = (ticket.messages || []).filter((m) => m.isInternal);

  async function handleNoteSubmit(e) {
    e.preventDefault();
    if (!internalNote.trim()) return;
    setAddingNote(true);
    try {
      await onAddInternalNote(internalNote);
      setInternalNote("");
    } finally {
      setAddingNote(false);
    }
  }

  return (
    <aside
      id="support-case-details"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-case-details-title"
      className="relative z-10 flex h-full w-full max-w-[420px] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-slate-50 shadow-2xl"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50/70 sticky top-0 z-10">
        <h3 id="support-case-details-title" className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <span className="material-symbols-outlined text-[17px] text-slate-500" aria-hidden="true">
            description
          </span>
          รายละเอียดและการจัดการ
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
            title="ซ่อนแถบรายละเอียด"
            aria-label="ปิดรายละเอียด"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4 text-xs">
        {actionError && <Alert className="mb-1">{actionError}</Alert>}

        {/* ── Status & Priority Card ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
          <div>
            <p className="font-mono text-[11px] font-semibold text-indigo-600">{ticket.ticketNumber}</p>
            <p className="mt-1 text-sm font-bold leading-snug text-slate-900">{ticket.subject}</p>
            {ticket.description && <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">{ticket.description}</p>}
          </div>
          <div className="border-t border-slate-100" />
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">สถานะ</span>
            <Badge
              text={TICKET_STATUS_LABEL[ticket.status] || ticket.status}
              style={TICKET_STATUS_STYLE[ticket.status] || "bg-slate-100 text-slate-600"}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">ความเร่งด่วน</span>
            <Badge
              text={PRIORITY_LABEL[ticket.priority] || ticket.priority}
              style={PRIORITY_STYLE[ticket.priority] || "bg-slate-100 text-slate-600"}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">หมวดหมู่</span>
            <span className="font-semibold text-slate-800">{ticket.category}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">เปิดเรื่องเมื่อ</span>
            <span className="text-slate-700">
              {new Date(ticket.createdAt).toLocaleDateString("th-TH", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          {ticket.slaDueAt && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
              <span className="text-slate-500">กำหนดเวลา SLA:</span>
              <span
                className={`font-semibold ${
                  new Date(ticket.slaDueAt) < new Date()
                    ? "text-red-600"
                    : "text-slate-700"
                }`}
              >
                {new Date(ticket.slaDueAt).toLocaleString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
          )}
        </div>

        {/* ── User & Target Card ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
              {ticket.requesterId?.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-400 font-medium block">
                ผู้แจ้ง
              </span>
              <p className="font-mono text-xs font-semibold text-slate-800 truncate">
                {ticket.requesterId}
              </p>
            </div>
          </div>

          {ticket.targetId && (
            <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-700 font-bold text-[10px]">
                {ticket.targetId?.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-amber-600 font-medium block">
                  คู่กรณี / ร้านค้า
                </span>
                <p className="font-mono text-xs font-semibold text-slate-800 truncate">
                  {ticket.targetId}
                </p>
              </div>
            </div>
          )}

          {ticket.orderId && (
            <div className="border-t border-slate-100 pt-2 text-[11px]">
              <span className="text-slate-500">หมายเลขออเดอร์: </span>
              <span className="font-mono font-semibold text-indigo-600">
                {ticket.orderId}
              </span>
            </div>
          )}
        </div>

        {/* ── Internal Notes (Agent Only) ── */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2 shadow-2xs">
          <h4 className="font-bold text-amber-800 uppercase tracking-wider text-[11px] flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-amber-600">
              lock
            </span>
            โน้ตภายใน <span className="font-medium">({internalNotes.length})</span>
          </h4>

          {internalNotes.length > 0 && (
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {internalNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-amber-200 bg-white p-2 text-[11px] text-slate-700 shadow-3xs"
                >
                  <p className="whitespace-pre-line">{note.body}</p>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {new Date(note.createdAt).toLocaleTimeString("th-TH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleNoteSubmit} className="space-y-1.5 pt-1">
            <textarea
              rows={2}
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="พิมพ์บันทึกภายใน (ลูกค้าจะไม่เห็น)..."
              aria-label="บันทึกภายใน"
              className="w-full rounded-lg border border-amber-200 bg-white p-2 text-xs text-slate-800 placeholder-amber-700/50 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
            <button
              type="submit"
              disabled={addingNote || !internalNote.trim()}
              className="w-full rounded-lg bg-amber-600 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition"
            >
              {addingNote ? "กำลังบันทึก..." : "บันทึกโน้ต"}
            </button>
          </form>
        </div>

        {/* ── Case Action Buttons ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs">
          <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
            การจัดการคำร้อง
          </h4>

          <div className="flex flex-col gap-2">
            {!ticket.assigneeId && (
              <Button
                onClick={onAssign}
                disabled={actionBusy}
                className="w-full justify-center"
              >
                รับงานนี้
              </Button>
            )}

            {nextStatuses.includes("IN_PROGRESS") && ticket.status !== "IN_PROGRESS" && (
              <Button
                variant="secondary"
                onClick={() => onStatusChange("IN_PROGRESS")}
                disabled={actionBusy}
                className="w-full justify-center"
              >
                เริ่มดำเนินการ
              </Button>
            )}

            {nextStatuses.includes("RESOLVED") && (
              <Button
                variant="secondary"
                onClick={() => onStatusChange("RESOLVED")}
                disabled={actionBusy}
                className="w-full justify-center border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                แจ้งว่าแก้ไขแล้ว
              </Button>
            )}

            {nextStatuses.includes("CLOSED") && (
              <Button
                variant="secondary"
                onClick={() => onStatusChange("CLOSED")}
                disabled={actionBusy}
                className="w-full justify-center border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                ปิดงานและล็อกแชท
              </Button>
            )}

            {nextStatuses.includes("ESCALATED") && (
              <Button
                variant="ghost"
                onClick={() => onStatusChange("ESCALATED")}
                disabled={actionBusy}
                className="w-full justify-center bg-red-50 text-red-600 hover:bg-red-100 font-bold"
              >
                ส่งต่อให้ Admin
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
