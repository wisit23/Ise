"use client";
import { formatReferenceCode } from "../../../../lib/referenceCodes";

import { useState } from "react";

import Alert from "../../../ui/Alert";
import Button from "../../../ui/Button";
import CaseUserCard from "./CaseUserCard";
import EmbeddedChat from "../../EmbeddedChat";
import CaseDate from "./CaseDate";
import ReturnTaskResults from "../../workspace/ReturnTaskResults";

function SectionCard({ icon, title, tone = "default", children }) {
  return (
    <section
      className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${tone === "success" ? "border-emerald-200" : "border-slate-200"}`}
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        <span
          className="material-symbols-outlined text-[18px] text-slate-500"
          aria-hidden="true"
        >
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/* One labelled fact in the case summary strip. */
function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-semibold text-slate-900">
        {children}
      </dd>
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
  onReturnToCs,
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
  const caps = ticket.capabilities || {};
  const canClose = caps.canClose === true && nextStatuses.includes("CLOSED");
  const canEscalate = nextStatuses.includes("ESCALATED");
  const hasActions =
    (caps.canTakeover && onTakeover) ||
    !ticket.assigneeId ||
    (caps.canRequestEvidence && onReturnToCs) ||
    canClose ||
    canEscalate;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5 lg:p-6">
        <section
          aria-label="สรุปเคส"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-6 gap-y-4">
            <Fact label="ผู้แจ้ง (Requester)">
              {ticket.requesterName ||
                formatReferenceCode(ticket.requesterId) ||
                "—"}
            </Fact>
            <Fact label="คู่กรณี (Target)">
              {ticket.targetId ? (
                <span className="text-orange-700">
                  {ticket.targetName || formatReferenceCode(ticket.targetId)}
                </span>
              ) : (
                <span className="font-normal italic text-slate-400">
                  ไม่ระบุ
                </span>
              )}
            </Fact>
            <Fact label="ผู้รับผิดชอบ (Agent)">
              {ticket.assigneeId ? (
                ticket.assigneeName || formatReferenceCode(ticket.assigneeId)
              ) : (
                <span className="font-semibold text-amber-700">
                  ยังไม่มอบหมาย
                </span>
              )}
            </Fact>
            <Fact label="วันที่แจ้งปัญหา">
              <CaseDate value={ticket.createdAt} />
            </Fact>
            <Fact label="วันที่ส่งต่อ T&S">
              <CaseDate value={ticket.escalatedAt} />
            </Fact>
            <Fact label="วันที่รับงาน">
              <CaseDate value={ticket.assignedAt} />
            </Fact>
            {(ticket.closedAt || ticket.resolvedAt) && (
              <Fact label="วันที่ปิด / แก้ไข">
                <CaseDate value={ticket.closedAt || ticket.resolvedAt} />
              </Fact>
            )}
          </dl>
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            วันและเวลาแสดงตามเวลาไทย (UTC+7)
          </p>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="min-w-0 space-y-4">
            <SectionCard icon="info" title="สาระคำร้อง">
              <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-slate-800">
                {ticket.subject}
              </p>
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                รหัส:{" "}
                <span className="font-semibold text-slate-700">
                  {formatReferenceCode(ticket)}
                </span>
              </p>
            </SectionCard>

            {ticket.status === "ESCALATED" && (
              <SectionCard icon="description" title="CS Memo">
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {ticket.escalationNote || "ยังไม่มีสรุปจาก CS"}
                </p>
              </SectionCard>
            )}

            {ticket.status === "ESCALATED" &&
              !ticket.returnedAt &&
              ticket.returnTasks?.length > 0 && (
                <SectionCard
                  icon="task_alt"
                  title="ผลจาก CS ตามที่ขอไว้"
                  tone="success"
                >
                  <p className="mb-1 text-xs text-slate-500">
                    เหตุผลที่ตีกลับ: {ticket.returnReason}
                  </p>
                  <ReturnTaskResults tasks={ticket.returnTasks} />
                </SectionCard>
              )}

            {/* Counterparty is the primary focus of moderation when handling disputes/complaints.
                Rendered first so Trust & Safety officers act on the accused party by default. */}
            {(onWarnUser || onBanUser) && !canModerate && (
              <p
                role="status"
                className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
              >
                ต้องรับผิดชอบเคสนี้ก่อน จึงจะตักเตือน ระงับบัญชี
                หรือเพิกถอนสิทธิ์ได้ และเคสต้องยังไม่ปิดหรือแก้ไขเสร็จ
              </p>
            )}
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
                onBan={
                  onBanUser ? (uid) => onBanUser(uid, "คู่กรณี") : undefined
                }
                onRestrictBuyer={
                  onRestrictBuyer
                    ? (uid) => onRestrictBuyer(uid, "คู่กรณี")
                    : undefined
                }
                onRestrictSeller={
                  onRestrictSeller
                    ? (uid) => onRestrictSeller(uid, "คู่กรณี")
                    : undefined
                }
              />
            ) : (
              <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm sm:p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-orange-700">
                  <span
                    className="material-symbols-outlined text-[18px]"
                    aria-hidden="true"
                  >
                    gavel
                  </span>
                  คู่กรณี (Target - ผู้ถูกร้องเรียน)
                </div>
                <p className="text-xs text-slate-600">
                  ตั๋วนี้ไม่ได้ผูกกับคำสั่งซื้ออัตโนมัติ
                  จึงไม่มีรหัสคู่กรณีในระบบ
                </p>
                {(onWarnUser || onBanUser) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-orange-200/60 pt-3">
                    <input
                      type="text"
                      value={manualTargetId}
                      onChange={(e) => setManualTargetId(e.target.value)}
                      placeholder="กรอกรหัสผู้ใช้ คู่กรณีที่ต้องการดำเนินการ..."
                      className="min-w-0 flex-1 rounded-lg border border-orange-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                    />
                    {onWarnUser && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="warning"
                        disabled={
                          actionBusy || !canModerate || !manualTargetId.trim()
                        }
                        onClick={() =>
                          onWarnUser(manualTargetId.trim(), "คู่กรณี")
                        }
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
                        disabled={
                          actionBusy || !canModerate || !manualTargetId.trim()
                        }
                        onClick={() =>
                          onBanUser(manualTargetId.trim(), "คู่กรณี")
                        }
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
              onWarn={
                onWarnUser ? (uid) => onWarnUser(uid, "ผู้แจ้ง") : undefined
              }
              onBan={onBanUser ? (uid) => onBanUser(uid, "ผู้แจ้ง") : undefined}
              onRestrictBuyer={
                onRestrictBuyer
                  ? (uid) => onRestrictBuyer(uid, "ผู้แจ้ง")
                  : undefined
              }
              onRestrictSeller={
                onRestrictSeller
                  ? (uid) => onRestrictSeller(uid, "ผู้แจ้ง")
                  : undefined
              }
            />

            <SectionCard icon="chat" title="สนทนากับลูกค้า">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-bold text-white shadow">
                    {(ticket.requesterName || ticket.requesterId || "U")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {ticket.requesterName ||
                        `ผู้ใช้: #${formatReferenceCode(ticket.requesterId)}`}
                    </p>
                    <p className="text-xs text-slate-500">
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
                  >
                    เปิดในหน้าแชท
                  </Button>
                )}
              </div>
              {chatLoading ? (
                <p className="mt-3 text-xs text-slate-500">
                  กำลังโหลดบทสนทนา...
                </p>
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
          </div>

          <section
            aria-label="จัดการคำร้อง"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-4"
          >
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <span
                className="material-symbols-outlined text-[18px] text-slate-500"
                aria-hidden="true"
              >
                build
              </span>
              จัดการคำร้อง (Actions)
            </h3>
            {actionError && <Alert className="mb-3">{actionError}</Alert>}
            <div className="flex flex-col gap-2">
              {caps.canTakeover && onTakeover && (
                <Button
                  className="w-full"
                  icon="assignment_ind"
                  onClick={onTakeover}
                  disabled={actionBusy}
                >
                  รับผิดชอบเคสที่ส่งต่อ
                </Button>
              )}
              {!ticket.assigneeId && (
                <Button
                  className="w-full"
                  icon="assignment_ind"
                  onClick={onAssign}
                  disabled={actionBusy}
                >
                  รับผิดชอบเคส
                </Button>
              )}
              {caps.canRequestEvidence && onReturnToCs && (
                <div className="mt-1 space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-600">
                    ข้อมูลยังไม่พอ? ส่งกลับให้ CS พร้อมระบุสิ่งที่ต้องทำ
                  </p>
                  <Button
                    variant="secondary"
                    icon="assignment_return"
                    onClick={onReturnToCs}
                    disabled={actionBusy}
                    className="w-full border-amber-300 bg-amber-50 font-bold text-amber-900 hover:bg-amber-100"
                  >
                    ตีกลับให้ CS
                  </Button>
                </div>
              )}
              {canClose && (
                <Button
                  variant="secondary"
                  icon="task_alt"
                  onClick={() => onStatusChange("CLOSED")}
                  disabled={actionBusy}
                  className="w-full"
                >
                  ปิดงาน
                </Button>
              )}
              {canEscalate && (
                <Button
                  variant="ghost"
                  onClick={() => onStatusChange("ESCALATED")}
                  disabled={actionBusy}
                  className="w-full bg-red-50 font-bold text-red-600 hover:bg-red-100 hover:text-red-700"
                >
                  ส่งต่อ Trust and Safety
                </Button>
              )}
              {!hasActions && ticket.assigneeId && (
                <p className="text-xs font-medium text-slate-500">
                  ไม่มีการดำเนินการเพิ่มเติมสำหรับสถานะนี้
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
