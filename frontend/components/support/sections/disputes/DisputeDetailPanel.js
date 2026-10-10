"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Badge from "../../../panel/ui/Badge";
import Button from "../../../ui/Button";
import Input from "../../../ui/Input";
import Modal from "../../../ui/Modal";
import Skeleton from "../../../ui/Skeleton";
import Textarea from "../../../ui/Textarea";
import {
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_STYLE,
} from "../../../../lib/supportConstants";

const THAI_DATE = { year: "numeric", month: "long", day: "numeric" };

function SectionCard({ icon, title, tone = "slate", children }) {
  const tones = {
    slate: { border: "border-slate-200", heading: "text-slate-500" },
    indigo: { border: "border-indigo-100", heading: "text-indigo-500" },
  };
  const t = tones[tone] ?? tones.slate;
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${t.border}`}>
      <h3
        className={`mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${t.heading}`}
      >
        <span className="material-symbols-outlined text-[15px]">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function PartyCell({ label, id, tone }) {
  const chip =
    tone === "buyer"
      ? "bg-indigo-100 text-indigo-700"
      : "bg-amber-100 text-amber-700";
  return (
    <div className="px-6 py-3.5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${chip}`}
        >
          {id?.slice(0, 1)?.toUpperCase() ?? label.slice(0, 1)}
        </div>
        <span className="truncate font-mono text-xs font-semibold text-slate-700">
          {id ?? "—"}
        </span>
      </div>
    </div>
  );
}

export default function DisputeDetailPanel({
  dispute,
  details,
  detailsLoading,
  userRole,
  currentUserId,
  closing,
  decisionReason,
  onDecisionReasonChange,
  deciding,
  openingEvidenceId,
  onViewEvidence,
  onDecide,
  onClaim,
  claiming,
  onReassign,
  reassigning,
  onEscalate,
  escalating,
  onOpenChat,
  openingChat,
  onClose,
}) {
  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [escalateMemo, setEscalateMemo] = useState({ problem: "", authority: "", recommendation: "" });
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [reassignToUserId, setReassignToUserId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [showOrderDrawer, setShowOrderDrawer] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const buyerId = dispute.order?.buyerId ?? dispute.buyerId ?? null;
  const sellerId = dispute.order?.sellerId ?? dispute.sellerId ?? null;
  const escrowAmount = dispute.order?.finalPrice ?? dispute.order?.price;
  const remainingMs = new Date(details?.slaExpiresAt || dispute.slaExpiresAt || 0).getTime() - now;

  return (
    <div
      className={`flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl ${
        closing ? "animate-slide-out-right" : "animate-slide-in-right"
      }`}
    >
      <div className="flex items-start justify-between border-b border-slate-100 bg-white px-7 py-5">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-500">
              gavel
            </span>
            <h2 className="text-base font-bold text-slate-900">
              ข้อพิพาทคำสั่งซื้อ
            </h2>
            <Badge
              text={DISPUTE_STATUS_LABEL[dispute.status] || dispute.status}
              style={
                DISPUTE_STATUS_STYLE[dispute.status] ||
                "bg-slate-100 text-slate-600"
              }
            />
          </div>
          <p className="font-mono text-xs text-slate-500">
            Order ID: {dispute.orderId}
          </p>
          {/* Holding funds is an Admin-only power, so the link only exists
              for Admin — a CS agent seeing it would hit a 403. */}
          {userRole === "ADMIN" && (
            <Link
              href={`/admin/disputes/${dispute.orderId}`}
              target="_blank"
              className="focus-ring mt-1 inline-flex items-center gap-1 rounded text-xs font-bold text-amber-600 hover:underline"
            >
              <span className="material-symbols-outlined text-[14px]">
                admin_panel_settings
              </span>
              จัดการการระงับเงิน (Admin)
            </Link>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="ปิดหน้าต่างข้อพิพาท"
          className="focus-ring flex aspect-square h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <span className="material-symbols-outlined block text-[20px] leading-none">
            close
          </span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-amber-100 bg-amber-50 p-4 text-xs">
        <div><span className="block text-slate-500">ยอดระงับ (Escrow Hold)</span><strong className="text-base text-amber-800">{typeof escrowAmount === "number" ? `฿${escrowAmount.toLocaleString("th-TH")}` : "ตรวจสอบออเดอร์"}</strong></div>
        <div><span className="block text-slate-500">สาเหตุ</span><strong className="line-clamp-2 text-slate-800">{dispute.reason}</strong></div>
        <div><span className="block text-slate-500">SLA คงเหลือ</span><strong className={remainingMs <= 0 ? "text-red-700" : "text-slate-800"}>{Number.isFinite(remainingMs) && (details?.slaExpiresAt || dispute.slaExpiresAt) ? remainingMs <= 0 ? "เกินกำหนด" : `${Math.ceil(remainingMs / 60000)} นาที` : "ยังไม่กำหนด"}</strong></div>
      </div>

      <button type="button" onClick={() => setShowOrderDrawer(true)} className="border-b border-slate-100 px-6 py-2 text-left text-xs font-bold text-indigo-700 hover:bg-indigo-50">ดูรายละเอียดออเดอร์ →</button>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-slate-50/30 p-6">
        {/* TSR-02: Single-owner assignment status card */}
        <SectionCard
          icon="assignment_ind"
          title="การรับผิดชอบเคส (Case Ownership)"
          tone="indigo"
        >
          {details?.assignedTo ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      ผู้รับผิดชอบ:
                    </span>
                    <span className="font-mono text-sm font-bold text-slate-800">
                      {details.assignedTo}
                    </span>
                    <Badge
                      text={
                        details.assignedRole === "TRUST_AND_SAFETY"
                          ? "Trust & Safety"
                          : "Customer Service"
                      }
                      style={
                        details.assignedRole === "TRUST_AND_SAFETY"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-800"
                      }
                    />
                  </div>
                  {details.claimedAt && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      รับเคสเมื่อ{" "}
                      {new Date(details.claimedAt).toLocaleString("th-TH")}
                    </p>
                  )}
                </div>

                {details.assignedTo === currentUserId ? (
                  <Badge
                    text="คุณเป็นผู้รับผิดชอบ"
                    style="bg-emerald-100 text-emerald-800 font-bold"
                  />
                ) : (
                  <Badge
                    text="ดูแลโดยท่านอื่น (Read-only)"
                    style="bg-slate-100 text-slate-600"
                  />
                )}
              </div>

              {/* Action buttons if current user is assignee or Trust & Safety supervisor */}
              {details.status !== "DECIDED" &&
                (details.assignedTo === currentUserId ||
                  userRole === "TRUST_AND_SAFETY") && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                    {userRole === "CUSTOMER_SERVICE" &&
                      details.assignedTo === currentUserId && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="forward"
                          loading={escalating}
                          onClick={() => setShowEscalateDialog(true)}
                        >
                          ส่งต่อให้ Trust & Safety (Escalate)
                        </Button>
                      )}
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="swap_horiz"
                      loading={reassigning}
                      onClick={() => setShowReassignDialog(true)}
                    >
                      เปลี่ยนผู้รับผิดชอบ (Reassign)
                    </Button>
                  </div>
                )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">
                  {details?.assignedRole === "ADMIN"
                    ? "เคสส่งต่อให้ Admin"
                    : details?.assignedRole === "TRUST_AND_SAFETY"
                    ? "เคสส่งต่อให้ Trust & Safety"
                    : "เคสนี้ยังไม่มีผู้รับผิดชอบ"}
                </p>
                <p className="text-xs text-slate-500">
                  {details?.assignedRole === "TRUST_AND_SAFETY"
                    ? userRole === "TRUST_AND_SAFETY"
                      ? "กดรับเคสเพื่อเริ่มต้นดำเนินการในฐานะ Trust & Safety"
                      : "เคสถูกส่งต่อให้ทีม Trust & Safety แล้ว (รอเจ้าหน้าที่ T&S รับเคส)"
                    : "กดรับเคสเพื่อเริ่มต้นดำเนินการและตัดสินข้อพิพาท"}
                </p>
              </div>
              {details?.status !== "DECIDED" &&
                (details?.assignedRole !== "ADMIN" || userRole === "ADMIN") &&
                (details?.assignedRole !== "TRUST_AND_SAFETY" || userRole === "TRUST_AND_SAFETY") && (
                  <Button
                    size="sm"
                    icon="pan_tool"
                    loading={claiming}
                    onClick={onClaim}
                  >
                    รับเคสนี้ (Claim)
                  </Button>
                )}
            </div>
          )}
        </SectionCard>

        <SectionCard icon="info" title="เหตุผลที่เปิดเคส">
          <p className="text-sm leading-relaxed text-slate-800">
            {dispute.reason}
          </p>
          <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">
              เปิดเคสเมื่อ:{" "}
              <span className="font-semibold text-slate-600">
                {new Date(dispute.createdAt).toLocaleDateString(
                  "th-TH",
                  THAI_DATE,
                )}
              </span>
            </span>
          </div>
        </SectionCard>

        <SectionCard icon="person" title="ช่องทางติดต่อผู้ซื้อ" tone="indigo">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-sm font-bold text-white shadow">
                {buyerId?.slice(0, 2)?.toUpperCase() ?? "B"}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  ผู้ซื้อ #{(buyerId ?? "").slice(0, 12)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {userRole === "CUSTOMER_SERVICE" &&
                  details?.assignedTo !== currentUserId
                    ? "รับเคสก่อนจึงจะเปิดแชทได้"
                    : "กดปุ่มแชทเพื่อเปิดหน้าต่างสนทนา"}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon="chat"
              onClick={onOpenChat}
              disabled={
                detailsLoading ||
                !details ||
                openingChat ||
                (userRole === "CUSTOMER_SERVICE" &&
                  details.assignedTo !== currentUserId)
              }
            >
              แชท
            </Button>
          </div>
        </SectionCard>

        {!details && detailsLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Skeleton.Text lines={4} />
          </div>
        ) : details ? (
          <>
            <div className="order-first"><SectionCard icon="compare" title={`เปรียบเทียบหลักฐาน (${details.evidence?.length || 0} ไฟล์)`}>
              {!details.evidence?.length ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-8 text-slate-500">
                  <span className="material-symbols-outlined text-[36px]">
                    image_not_supported
                  </span>
                  <p className="text-sm">ยังไม่มีหลักฐานแนบมา</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[[buyerId, "หลักฐานผู้ซื้อ", "border-emerald-200"], [sellerId, "หลักฐานผู้ขาย", "border-blue-200"]].map(([partyId, label, border]) => <div key={partyId} className={`min-h-36 rounded-lg border p-2 ${border}`}>
                    <p className="mb-2 text-xs font-bold">{label}</p>
                    <div className="grid grid-cols-2 gap-2">{details.evidence.filter((ev) => ev.uploaderId === partyId).map((ev) => {
                    const isVideo = ev.fileType.startsWith("video/");
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onViewEvidence(ev)}
                        disabled={openingEvidenceId === ev.id}
                        className="focus-ring group flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 hover:shadow-md disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[28px] transition-transform group-hover:scale-110">
                          {isVideo ? "movie" : "image"}
                        </span>
                        <span className="text-[10px] font-bold">
                          {openingEvidenceId === ev.id
                            ? "กำลังเปิด..."
                            : isVideo
                              ? "วิดีโอ"
                              : "รูปภาพ"}
                        </span>
                      </button>
                    );
                  })}{!details.evidence.some((ev) => ev.uploaderId === partyId) && <p className="col-span-2 text-xs text-slate-500">ยังไม่มีหลักฐาน</p>}</div>
                  </div>)}
                </div>
              )}
            </SectionCard></div>

            {details.status === "DECIDED" ? (
              <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600">
                  <span className="material-symbols-outlined text-[15px]">
                    check_circle
                  </span>
                  ผลการตัดสิน
                </h3>
                <div
                  className={`mb-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold ${
                    details.decision === "APPROVE_REFUND"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {details.decision === "APPROVE_REFUND"
                      ? "payments"
                      : "block"}
                  </span>
                  {details.decision === "APPROVE_REFUND"
                    ? "อนุมัติคืนเงิน"
                    : "ปล่อยเงินให้ผู้ขาย"}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {details.decisionReason}
                </p>
              </div>
            ) : !details?.assignedTo ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 text-center">
                <span className="material-symbols-outlined text-[36px] text-amber-500">
                  pan_tool
                </span>
                <h4 className="mt-2 text-sm font-bold text-slate-800">
                  ต้องกดรับเคส (Claim) ก่อนดำเนินการ
                </h4>
                <p className="mt-1 text-xs text-slate-600">
                  เคสนี้ยังไม่มีผู้รับผิดชอบ กรุณากดปุ่ม &quot;รับเคสนี้
                  (Claim)&quot; ด้านบนเพื่อเริ่มต้นตัดสินเคส
                </p>
              </div>
            ) : userRole !== "ADMIN" || details.assignedTo !== currentUserId ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                <span className="material-symbols-outlined text-[36px] text-slate-400">
                  lock
                </span>
                <h4 className="mt-2 text-sm font-bold text-slate-700">
                  ส่วนการตัดสินเป็นแบบอ่านอย่างเดียว (Read-only)
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  เฉพาะ Admin ที่รับเคส ({details.assignedTo})
                  เท่านั้นที่สามารถบันทึกคำตัดสินได้
                </p>
              </div>
            ) : (
              <SectionCard icon="edit_note" title="บันทึกผลการพิจารณา">
                <Textarea
                  rows={4}
                  label="เหตุผลประกอบการตัดสิน"
                  required
                  hint="ต้องกรอกก่อนจึงจะกดตัดสินได้"
                  placeholder="ระบุเหตุผลประกอบการตัดสิน..."
                  value={decisionReason}
                  onChange={(e) => onDecisionReasonChange(e.target.value)}
                />
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button
                      size="lg"
                      icon="payments"
                      className="flex-1"
                      loading={deciding}
                      disabled={deciding || !decisionReason.trim()}
                      onClick={() => onDecide("APPROVE_REFUND")}
                    >
                      อนุมัติคืนเงิน
                    </Button>
                    <Button
                      size="lg"
                      variant="secondary"
                      icon="block"
                      className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                      disabled={deciding || !decisionReason.trim()}
                      onClick={() => onDecide("RELEASE_ESCROW")}
                    >
                      ปล่อยเงินให้ผู้ขาย
                    </Button>
                  </div>
                </div>
              </SectionCard>
            )}
          </>
        ) : null}
      </div>

      {/* Escalate Confirm Dialog */}
      <Modal
        open={showEscalateDialog}
        title="ส่งต่อเคสให้ Admin (Escalate)"
        description="สรุปปัญหา อำนาจที่ต้องใช้ และข้อเสนอแนะ ก่อนส่งเข้า Admin Inbox"
        onClose={() => setShowEscalateDialog(false)}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowEscalateDialog(false)}>ยกเลิก</Button><Button loading={escalating} disabled={escalating || Object.values(escalateMemo).some((v) => !v.trim())} onClick={() => {
          onEscalate(`ปัญหา: ${escalateMemo.problem.trim()}\nขาดอำนาจ: ${escalateMemo.authority.trim()}\nข้อเสนอแนะ: ${escalateMemo.recommendation.trim()}`);
          setShowEscalateDialog(false);
        }}>ยืนยันการส่งต่อ</Button></div>}
      ><div className="space-y-3">{[["problem", "ปัญหาคืออะไร"], ["authority", "ขาดอำนาจอะไร"], ["recommendation", "CS เสนอแนะอะไร"]].map(([key, label]) => <Textarea key={key} rows={2} label={label} required value={escalateMemo[key]} onChange={(e) => setEscalateMemo((old) => ({ ...old, [key]: e.target.value }))} />)}</div></Modal>

      {showOrderDrawer && <div className="absolute inset-0 z-20 flex justify-end bg-slate-900/40" onClick={() => setShowOrderDrawer(false)} role="presentation">
        <aside role="dialog" aria-label="รายละเอียดออเดอร์" className="h-full w-full max-w-sm overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setShowOrderDrawer(false)} className="mb-4 text-sm font-bold text-slate-600">← ปิดรายละเอียด</button>
          <h3 className="mb-3 font-bold">รายละเอียดออเดอร์</h3>
          <p className="break-all text-xs">Order ID: {dispute.orderId}</p>
          <p className="mt-2 text-sm">{dispute.order?.productTitle || "สินค้า"}</p>
          <div className="mt-4 divide-y border-y"><PartyCell label="ผู้ซื้อ" id={buyerId} tone="buyer" /><PartyCell label="ผู้ขาย" id={sellerId} tone="seller" /></div>
        </aside>
      </div>}

      {/* Reassign Dialog */}
      {showReassignDialog && (
        <Modal
          open={showReassignDialog}
          onClose={() => setShowReassignDialog(false)}
          title="เปลี่ยนผู้รับผิดชอบเคส (Reassign)"
          description="ระบุ User ID ของเจ้าหน้าที่ที่ต้องการมอบหมายงานต่อ"
          size="sm"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowReassignDialog(false)}
                disabled={reassigning}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={() => {
                  if (!reassignToUserId.trim() || !reassignReason.trim())
                    return;
                  onReassign(reassignToUserId.trim(), reassignReason.trim());
                  setShowReassignDialog(false);
                }}
                disabled={
                  !reassignToUserId.trim() ||
                  !reassignReason.trim() ||
                  reassigning
                }
                loading={reassigning}
              >
                ยืนยันการมอบหมาย
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Input
              label="User ID ของผู้รับผิดชอบใหม่"
              placeholder="เช่น cs-staff-02..."
              value={reassignToUserId}
              onChange={(e) => setReassignToUserId(e.target.value)}
              required
            />
            <Textarea
              label="เหตุผลในการส่งมอบงาน"
              placeholder="ระบุเหตุผลในการเปลี่ยนผู้รับผิดชอบ..."
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              rows={3}
              required
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
