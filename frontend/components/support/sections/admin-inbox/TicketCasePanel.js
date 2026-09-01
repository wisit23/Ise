"use client";

import Alert from "../../../ui/Alert";
import Button from "../../../ui/Button";
import CaseUserCard from "./CaseUserCard";
import { AGENT_NEXT_STATUS } from "../../../../lib/supportConstants";

const THAI_DATE = { year: "numeric", month: "long", day: "numeric" };

function SectionCard({ icon, title, tone = "slate", children }) {
  const heading = tone === "indigo" ? "text-indigo-500" : "text-slate-500";
  const border = tone === "indigo" ? "border-indigo-100" : "border-slate-200";
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${border}`}>
      <h3
        className={`mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${heading}`}
      >
        <span className="material-symbols-outlined text-[15px]">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoCell({ label, children }) {
  return (
    <div className="px-5 py-3.5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="truncate text-xs font-semibold text-slate-700">
        {children}
      </p>
    </div>
  );
}

export default function TicketCasePanel({
  ticket,
  actionBusy,
  actionError,
  onAssign,
  onStatusChange,
  onWarnUser,
  onBanUser,
}) {
  const nextStatuses = AGENT_NEXT_STATUS[ticket.status] || [];
  const openedOn = new Date(ticket.createdAt).toLocaleDateString(
    "th-TH",
    THAI_DATE,
  );

  return (
    <>
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/70">
        <InfoCell label="ผู้แจ้ง (Requester)">
          <span className="font-mono">
            {ticket.requesterId?.slice(0, 14) ?? "—"}
          </span>
        </InfoCell>
        <InfoCell label="ผู้รับผิดชอบ (Agent)">
          {ticket.assigneeId ? (
            <span className="font-mono">{ticket.assigneeId.slice(0, 14)}</span>
          ) : (
            <span className="italic text-slate-500">ยังไม่มอบหมาย</span>
          )}
        </InfoCell>
        <InfoCell label="วันที่เปิด">{openedOn}</InfoCell>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-slate-50/30 p-6">
        <SectionCard icon="info" title="สาระคำร้อง">
          <p className="text-sm font-medium leading-relaxed text-slate-800">
            {ticket.subject}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">
              รหัส:{" "}
              <span className="font-semibold text-slate-600">
                {ticket.ticketNumber}
              </span>
            </span>
            <span className="text-xs text-slate-500">
              เปิด:{" "}
              <span className="font-semibold text-slate-600">{openedOn}</span>
            </span>
          </div>
        </SectionCard>

        {/* The requester filed the ticket — not necessarily the person at
            fault, so they get their own actions rather than being assumed
            to be the wrongdoer. */}
        <CaseUserCard
          userId={ticket.requesterId}
          heading="ผู้แจ้ง (Requester)"
          icon="person"
          tone="requester"
          busy={actionBusy}
          onWarn={onWarnUser}
          onBan={onBanUser}
        />

        {/* Counterparty exists only when the requester tied the ticket to one
            of their orders on submission (see app/support/tickets/page.js),
            which lets us derive the other party of that transaction. This is
            usually who Admin actually needs to act against — e.g. "seller
            never shipped my order" — not the requester above. */}
        <CaseUserCard
          userId={ticket.targetId}
          heading="คู่กรณี (Target)"
          icon="gavel"
          tone="target"
          busy={actionBusy}
          onWarn={onWarnUser}
          onBan={onBanUser}
        />

        <SectionCard icon="support_agent" title="เจ้าหน้าที่รับผิดชอบ">
          {ticket.assigneeId ? (
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-base font-bold text-white shadow">
                <span className="material-symbols-outlined text-[20px]">
                  support_agent
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">
                  รหัส: {ticket.assigneeId.slice(0, 16)}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                  {ticket.assigneeId}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-4 py-3">
              <span className="material-symbols-outlined text-[22px] text-amber-500">
                person_search
              </span>
              <p className="text-sm font-medium text-amber-800">
                ยังไม่ได้มอบหมายเจ้าหน้าที่
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard icon="chat" title="สนทนากับลูกค้า" tone="indigo">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 font-bold text-white shadow">
              {ticket.requesterId?.slice(0, 1).toUpperCase() ?? "U"}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">
                ผู้ใช้: #{ticket.requesterId?.slice(0, 12)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">กำลังพัฒนาระบบแชท</p>
            </div>
            <Button size="sm" variant="secondary" icon="chat" disabled>
              แชท (Soon)
            </Button>
          </div>
        </SectionCard>

        <SectionCard icon="build" title="จัดการคำร้อง (Actions)">
          {actionError && <Alert className="mb-3">{actionError}</Alert>}
          <div className="flex gap-2">
            {!ticket.assigneeId && (
              <Button
                onClick={onAssign}
                disabled={actionBusy}
                className="flex-1"
              >
                รับงาน (Assign)
              </Button>
            )}
            {nextStatuses.includes("CLOSED") && (
              <Button
                variant="secondary"
                onClick={() => onStatusChange("CLOSED")}
                disabled={actionBusy}
                className="flex-1"
              >
                ปิดงาน (Close)
              </Button>
            )}
            {nextStatuses.includes("ESCALATED") && (
              <Button
                variant="ghost"
                onClick={() => onStatusChange("ESCALATED")}
                disabled={actionBusy}
                className="flex-1 bg-red-50 font-bold text-red-600 hover:bg-red-100 hover:text-red-700"
              >
                ส่งต่อ Admin
              </Button>
            )}
            {nextStatuses.length === 0 && ticket.assigneeId && (
              <p className="text-xs font-medium text-slate-500">
                ไม่มีการดำเนินการเพิ่มเติมสำหรับสถานะนี้
              </p>
            )}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
