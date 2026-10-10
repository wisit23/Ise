"use client";

import { useState } from "react";

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
  onTakeover,
  canTakeover = false,
  onStatusChange,
  onReply,
  onWarnUser,
  onBanUser,
  detailLoading = false,
  detailError = "",
  onRetryDetail,
}) {
  const [manualTargetId, setManualTargetId] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const nextStatuses = AGENT_NEXT_STATUS[ticket.status] || [];
  const openedOn = new Date(ticket.createdAt).toLocaleDateString(
    "th-TH",
    THAI_DATE,
  );

  return (
    <>
      {detailLoading && (
        <Alert tone="info" className="m-4 mb-0">
          กำลังโหลดรายละเอียดล่าสุด...
        </Alert>
      )}
      {detailError && (
        <Alert className="m-4 mb-0" title="โหลดรายละเอียดเคสไม่สำเร็จ">
          <div className="flex items-center justify-between gap-3">
            <span>{detailError}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetryDetail}
            >
              ลองใหม่
            </Button>
          </div>
        </Alert>
      )}
      <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/70">
        <InfoCell label="คู่กรณี (Target)">
          {ticket.targetId ? (
            <span className="font-mono font-semibold text-orange-700">
              {ticket.targetId.slice(0, 10)}...
            </span>
          ) : (
            <span className="italic text-slate-400">ไม่ระบุ</span>
          )}
        </InfoCell>
        <InfoCell label="ผู้แจ้ง (Requester)">
          <span className="font-mono">
            {ticket.requesterId?.slice(0, 10) ?? "—"}
          </span>
        </InfoCell>
        <InfoCell label="ผู้รับผิดชอบ (Agent)">
          {ticket.assigneeId ? (
            <span className="font-mono">{ticket.assigneeId.slice(0, 10)}</span>
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

        {/* Counterparty is the primary focus of moderation when handling disputes/complaints.
            Rendered first so Trust & Safety officers act on the accused party by default. */}
        {ticket.targetId ? (
          <CaseUserCard
            userId={ticket.targetId}
            heading="คู่กรณี (Target - ผู้ถูกร้องเรียน)"
            icon="gavel"
            tone="target"
            busy={actionBusy}
            warnLabel="ตักเตือนคู่กรณี"
            banLabel="แบนคู่กรณี"
            onWarn={
              onWarnUser ? (uid) => onWarnUser(uid, "คู่กรณี") : undefined
            }
            onBan={onBanUser ? (uid) => onBanUser(uid, "คู่กรณี") : undefined}
          />
        ) : (
          <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-600">
              <span className="material-symbols-outlined text-[15px]">
                gavel
              </span>
              คู่กรณี (Target - ผู้ถูกร้องเรียน)
            </div>
            <p className="text-xs text-slate-600">
              ตั๋วนี้ไม่ได้ผูกกับคำสั่งซื้ออัตโนมัติ จึงไม่มีรหัสคู่กรณีในระบบ
            </p>
            {(onWarnUser || onBanUser) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-orange-200/60 pt-2">
                <input
                  type="text"
                  value={manualTargetId}
                  onChange={(e) => setManualTargetId(e.target.value)}
                  placeholder="กรอก User ID คู่กรณีที่ต้องการดำเนินการ..."
                  className="flex-1 rounded-lg border border-orange-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                />
                {onWarnUser && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="warning"
                    disabled={actionBusy || !manualTargetId.trim()}
                    onClick={() => onWarnUser(manualTargetId.trim(), "คู่กรณี")}
                    className="bg-amber-100 font-bold text-amber-800 hover:bg-amber-200"
                  >
                    ตักเตือนคู่กรณี
                  </Button>
                )}
                {onBanUser && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="block"
                    disabled={actionBusy || !manualTargetId.trim()}
                    onClick={() => onBanUser(manualTargetId.trim(), "คู่กรณี")}
                    className="bg-red-50 font-bold text-red-600 hover:bg-red-100 hover:text-red-700"
                  >
                    แบนคู่กรณี
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* The requester filed the ticket — not necessarily the person at fault.
            Rendered second with distinct labels and caution styling. */}
        <CaseUserCard
          userId={ticket.requesterId}
          heading="ผู้แจ้ง (Requester - ผู้ส่งคำร้อง)"
          icon="person"
          tone="requester"
          isRequester={true}
          busy={actionBusy}
          warnLabel="ตักเตือนผู้แจ้ง"
          banLabel="แบนผู้แจ้ง (ระวัง)"
          onWarn={onWarnUser ? (uid) => onWarnUser(uid, "ผู้แจ้ง") : undefined}
          onBan={onBanUser ? (uid) => onBanUser(uid, "ผู้แจ้ง") : undefined}
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

        <SectionCard icon="chat" title="ข้อความใน Ticket" tone="indigo">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {(ticket.messages || []).length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                ยังไม่มีข้อความตอบกลับ
              </p>
            ) : (
              ticket.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg border px-3 py-2 ${
                    message.isInternal
                      ? "border-amber-200 bg-amber-50"
                      : message.authorRole === "REQUESTER"
                        ? "border-slate-200 bg-slate-50"
                        : "border-indigo-100 bg-indigo-50/50"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
                    <span>
                      {message.isInternal
                        ? "โน้ตภายใน — ไม่แสดงแก่ลูกค้า"
                        : message.authorRole === "REQUESTER"
                          ? "ลูกค้า"
                          : "เจ้าหน้าที่"}
                    </span>
                    <span>
                      {new Date(message.createdAt).toLocaleString("th-TH")}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">
                    {message.body}
                  </p>
                </div>
              ))
            )}
          </div>
          {onReply && ticket.status !== "CLOSED" && (
            <form
              className="mt-3 border-t border-indigo-100 pt-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!replyBody.trim()) return;
                await onReply(replyBody.trim(), isInternal);
                setReplyBody("");
              }}
            >
              <textarea
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                rows={3}
                placeholder={isInternal ? "เขียนโน้ตสำหรับเจ้าหน้าที่..." : "ตอบกลับลูกค้า..."}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(event) => setIsInternal(event.target.checked)}
                  />
                  โน้ตภายใน (ลูกค้ามองไม่เห็น)
                </label>
                <Button type="submit" size="sm" disabled={actionBusy || !replyBody.trim()}>
                  {isInternal ? "บันทึกโน้ต" : "ส่งข้อความ"}
                </Button>
              </div>
            </form>
          )}
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
            {canTakeover && (
              <Button
                onClick={onTakeover}
                disabled={actionBusy}
                className="flex-1"
              >
                รับช่วงเคส (Take over)
              </Button>
            )}
            {nextStatuses.map((status) => (
              <Button
                key={status}
                variant={status === "ESCALATED" ? "ghost" : "secondary"}
                onClick={() => onStatusChange(status)}
                disabled={actionBusy}
                className={status === "ESCALATED" ? "flex-1 bg-red-50 font-bold text-red-600 hover:bg-red-100 hover:text-red-700" : "flex-1"}
              >
                {{
                  IN_PROGRESS: "เริ่มดำเนินการ",
                  PENDING_USER: "รอข้อมูลลูกค้า",
                  RESOLVED: "แก้ไขสำเร็จ",
                  CLOSED: "ปิดงาน",
                  ESCALATED: "ส่งต่อ Trust & Safety",
                }[status] || status}
              </Button>
            ))}
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
