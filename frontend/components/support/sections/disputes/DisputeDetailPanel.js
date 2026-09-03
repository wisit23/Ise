"use client";

import Link from "next/link";
import Badge from "../../../panel/ui/Badge";
import Button from "../../../ui/Button";
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
  closing,
  decisionReason,
  onDecisionReasonChange,
  deciding,
  openingEvidenceId,
  onViewEvidence,
  onDecide,
  onOpenChat,
  onClose,
}) {
  const buyerId = dispute.order?.buyerId ?? dispute.buyerId ?? null;
  const sellerId = dispute.order?.sellerId ?? dispute.sellerId ?? null;

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

      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/70">
        <PartyCell label="ผู้ซื้อ (Buyer)" id={buyerId} tone="buyer" />
        <PartyCell label="ผู้ขาย (Seller)" id={sellerId} tone="seller" />
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-slate-50/30 p-6">
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
                  กดปุ่ม &quot;แชท&quot; เพื่อเปิดหน้าต่างสนทนา
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon="chat"
              onClick={onOpenChat}
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
            <SectionCard
              icon="folder_open"
              title={`หลักฐานประกอบ (${details.evidence?.length || 0} ไฟล์)`}
            >
              {!details.evidence?.length ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-8 text-slate-500">
                  <span className="material-symbols-outlined text-[36px]">
                    image_not_supported
                  </span>
                  <p className="text-sm">ยังไม่มีหลักฐานแนบมา</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {details.evidence.map((ev) => {
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
                  })}
                </div>
              )}
            </SectionCard>

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
                    : "ปฏิเสธคำร้อง"}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {details.decisionReason}
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
                      onClick={() => onDecide("REJECT")}
                    >
                      ปฏิเสธคำร้อง
                    </Button>
                  </div>
                  {userRole !== "ADMIN" && (
                    <p className="text-center text-xs font-medium text-slate-500">
                      หากต้องการให้ Admin ช่วยระงับเงินไว้ก่อนตัดสิน แจ้งทีม
                      Admin โดยตรง
                    </p>
                  )}
                </div>
              </SectionCard>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
