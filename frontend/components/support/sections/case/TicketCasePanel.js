"use client";
import { formatReferenceCode } from "../../../../lib/referenceCodes";

import { useState } from "react";

import Alert from "../../../ui/Alert";
import Button from "../../../ui/Button";
import CaseUserCard from "./CaseUserCard";
import EmbeddedChat from "../../EmbeddedChat";
import CaseDate from "./CaseDate";

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
  conversationId,
  chatLoading,
  actionBusy,
  actionError,
  onAssign,
  onTakeover,
  onStatusChange,
  onWarnUser,
  onBanUser,
  onRestrictBuyer,
  onRestrictSeller,
  onOpenLiveChat,
  auditReadOnly = false,
}) {
  const [manualTargetId, setManualTargetId] = useState("");
  const nextStatuses = ticket.capabilities?.allowedNextStatuses || [];
  const canModerate = ticket.capabilities?.canModerateUsers === true;

  return (
    <>
      <div className="grid shrink-0 grid-cols-2 divide-x sm:grid-cols-4 divide-slate-100 border-b border-slate-100 bg-slate-50/70">
        <InfoCell label="คู่กรณี (Target)">
          {ticket.targetId ? (
            <span className="font-semibold text-orange-700">
              {ticket.targetName || formatReferenceCode(ticket.targetId)}
            </span>
          ) : (
            <span className="italic text-slate-400">ไม่ระบุ</span>
          )}
        </InfoCell>
        <InfoCell label="ผู้แจ้ง (Requester)">
          <span>
            {ticket.requesterName || formatReferenceCode(ticket.requesterId) || "—"}
          </span>
        </InfoCell>
        <InfoCell label="ผู้รับผิดชอบ (Agent)">
          {ticket.assigneeId ? (
            <span>{ticket.assigneeName || formatReferenceCode(ticket.assigneeId)}</span>
          ) : (
            <span className="italic text-slate-500">ยังไม่มอบหมาย</span>
          )}
        </InfoCell>
        <InfoCell label="วันที่แจ้งปัญหา"><CaseDate value={ticket.createdAt} /></InfoCell>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto bg-slate-50/30 p-3 sm:p-5 lg:px-8">
        <SectionCard icon="schedule" title="วันและเวลาของเคส (เวลาไทย)">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div><dt className="mb-1 text-xs text-slate-500">วันที่ส่งต่อ T&S</dt><dd><CaseDate value={ticket.escalatedAt} /></dd></div>
            <div><dt className="mb-1 text-xs text-slate-500">วันที่รับงาน</dt><dd><CaseDate value={ticket.assignedAt} /></dd></div>
            <div><dt className="mb-1 text-xs text-slate-500">วันที่ปิด / แก้ไข</dt><dd><CaseDate value={ticket.closedAt || ticket.resolvedAt} /></dd></div>
          </dl>
        </SectionCard>
        <SectionCard icon="info" title="สาระคำร้อง">
          <p className="text-sm font-medium leading-relaxed text-slate-800">
            {ticket.subject}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">
              รหัส:{" "}
              <span className="font-semibold text-slate-600">
                {formatReferenceCode(ticket)}
              </span>
            </span>
            <span className="text-xs text-slate-500">
              วันที่แจ้งปัญหา:{" "}
              <CaseDate value={ticket.createdAt} />
            </span>
          </div>
        </SectionCard>

        {ticket.status === "ESCALATED" && (
          <SectionCard icon="description" title="CS Memo">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {ticket.escalationNote || "ยังไม่มีสรุปจาก CS"}
            </p>
          </SectionCard>
        )}

        {/* Counterparty is the primary focus of moderation when handling disputes/complaints.
            Rendered first so Trust & Safety officers act on the accused party by default. */}
        {(onWarnUser || onBanUser) && !canModerate && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">ต้องรับผิดชอบเคสนี้ก่อน จึงจะตักเตือน ระงับบัญชี หรือเพิกถอนสิทธิ์ได้ และเคสต้องยังไม่ปิดหรือแก้ไขเสร็จ</p>}
        {ticket.targetId ? (
          <CaseUserCard
            userId={ticket.targetId}
            referenceCode={ticket.targetReferenceCode}
            userName={ticket.targetName}
            heading="คู่กรณี (Target - ผู้ถูกร้องเรียน)"
            icon="gavel"
            tone="target"
            busy={actionBusy}
            actionsDisabled={!canModerate}
            warnLabel="ตักเตือนคู่กรณี"
            banLabel="แบนคู่กรณี"
            onWarn={
              onWarnUser ? (uid) => onWarnUser(uid, "คู่กรณี") : undefined
            }
            onBan={onBanUser ? (uid) => onBanUser(uid, "คู่กรณี") : undefined}
            onRestrictBuyer={onRestrictBuyer ? (uid) => onRestrictBuyer(uid, "คู่กรณี") : undefined}
            onRestrictSeller={onRestrictSeller ? (uid) => onRestrictSeller(uid, "คู่กรณี") : undefined}
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
                  placeholder="กรอกรหัสผู้ใช้ คู่กรณีที่ต้องการดำเนินการ..."
                  className="flex-1 rounded-lg border border-orange-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                />
                {onWarnUser && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="warning"
                    disabled={actionBusy || !canModerate || !manualTargetId.trim()}
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
                    disabled={actionBusy || !canModerate || !manualTargetId.trim()}
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
          referenceCode={ticket.requesterReferenceCode}
          userName={ticket.requesterName}
          heading="ผู้แจ้ง (Requester - ผู้ส่งคำร้อง)"
          icon="person"
          tone="requester"
          isRequester={true}
          busy={actionBusy}
          actionsDisabled={!canModerate}
          warnLabel="ตักเตือนผู้แจ้ง"
          banLabel="แบนผู้แจ้ง (ระวัง)"
          onWarn={onWarnUser ? (uid) => onWarnUser(uid, "ผู้แจ้ง") : undefined}
          onBan={onBanUser ? (uid) => onBanUser(uid, "ผู้แจ้ง") : undefined}
          onRestrictBuyer={onRestrictBuyer ? (uid) => onRestrictBuyer(uid, "ผู้แจ้ง") : undefined}
          onRestrictSeller={onRestrictSeller ? (uid) => onRestrictSeller(uid, "ผู้แจ้ง") : undefined}
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
                  {ticket.assigneeName || `รหัส: ${formatReferenceCode(ticket.assigneeId)}`}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                  {formatReferenceCode(ticket.assigneeId)}
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
              {(ticket.requesterName || ticket.requesterId || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">
                {ticket.requesterName || `ผู้ใช้: #${formatReferenceCode(ticket.requesterId)}`}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                ประวัติการสนทนาของคำร้อง
              </p>
            </div>
          </div>
          {onOpenLiveChat && (
            <Button
              size="sm"
              variant="secondary"
              icon="chat"
              onClick={() => onOpenLiveChat(ticket.id)}
              className="mt-3"
            >
              เปิดในหน้าแชท
            </Button>
          )}
          {chatLoading ? (
            <p className="mt-3 text-xs text-slate-500">กำลังโหลดบทสนทนา...</p>
          ) : conversationId ? (
            <div className="mt-3">
              <EmbeddedChat
                conversationId={conversationId}
                readOnly={auditReadOnly || ticket.status === "CLOSED"}
              />
            </div>
          ) : !onOpenLiveChat ? (
            <p className="mt-3 text-xs text-slate-500">
              ยังเปิดบทสนทนาไม่ได้ กรุณาลองเปิดเคสอีกครั้ง
            </p>
          ) : null}
        </SectionCard>

        <SectionCard icon="build" title="จัดการคำร้อง (Actions)">
          {actionError && <Alert className="mb-3">{actionError}</Alert>}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {ticket.capabilities?.canTakeover && onTakeover && <Button onClick={onTakeover} disabled={actionBusy}>รับผิดชอบเคสที่ส่งต่อ</Button>}
            {!ticket.assigneeId && (
              <Button
                onClick={onAssign}
                disabled={actionBusy}
                className="flex-1"
              >
                รับผิดชอบเคส
              </Button>
            )}
            {ticket.capabilities?.canClose === true && nextStatuses.includes("CLOSED") && (
              <Button
                variant="secondary"
                onClick={() => onStatusChange("CLOSED")}
                disabled={actionBusy}
                className="flex-1"
              >
                ปิดงาน
              </Button>
            )}
            {nextStatuses.includes("ESCALATED") && (
              <Button
                variant="ghost"
                onClick={() => onStatusChange("ESCALATED")}
                disabled={actionBusy}
                className="flex-1 bg-red-50 font-bold text-red-600 hover:bg-red-100 hover:text-red-700"
              >
                ส่งต่อ Trust and Safety
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
