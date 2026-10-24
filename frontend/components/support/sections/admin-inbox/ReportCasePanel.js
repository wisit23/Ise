"use client";

import { useEffect, useState } from "react";
import { fetchAuthedBlobUrl } from "../../../../lib/api";
import { reportCategoryLabel } from "../../../../lib/reportCategories";

import Alert from "../../../ui/Alert";
import Button from "../../../ui/Button";
import Select from "../../../ui/Select";
import Textarea from "../../../ui/Textarea";
import Modal from "../../../ui/Modal";
import ReportProductDetails from "./ReportProductDetails";
import CaseDate from "../case/CaseDate";
import { safetyActionLabel } from "../../../../lib/supportConstants";

function Row({ label, children, mono, danger }) {
  return (
    <div className="flex gap-4">
      <span className="w-20 shrink-0 sm:w-28 text-sm font-medium text-slate-500">
        {label}
      </span>
      <span
        className={`min-w-0 break-words text-sm ${mono ? "font-mono" : "font-medium text-slate-800"} ${
          danger ? "text-red-600" : ""
        }`}
      >
        {children}
      </span>
    </div>
  );
}

function personName(person) {
  if (!person) return "ไม่พบข้อมูลผู้ใช้";
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.email ||
    person.id
  );
}

function UserCard({ label, person, fallbackId, onOpenHistory }) {
  const userId = person?.id || fallbackId;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-900">
        {personName(person || (fallbackId ? { id: fallbackId } : null))}
      </p>
      {userId && <p className="mt-1 break-all font-mono text-xs">{userId}</p>}
      {person?.email && (
        <p className="mt-1 break-all text-xs text-slate-500">{person.email}</p>
      )}
      {person?.safetySummary && (
        <p className="mt-2 text-xs text-slate-600">
          รายงาน {person.safetySummary.reportCount} · การดำเนินการก่อนหน้า{" "}
          {person.safetySummary.priorActions}
        </p>
      )}
      {userId && onOpenHistory && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => onOpenHistory(userId)}
        >
          เปิดประวัติผู้ใช้
        </Button>
      )}
    </div>
  );
}

/* A report differs from a support ticket: it names an accused party and ends
   in a moderation decision, so it gets its own panel rather than being bent
   into the ticket layout. */
export default function ReportCasePanel({
  report,
  decision,
  onDecisionChange,
  reason,
  onReasonChange,
  error,
  busy,
  onSubmit,
  onClaim,
  currentUserId,
  detailLoading = false,
  detailError = "",
  onRetryDetail,
  onOpenUserHistory,
}) {
  const [evidenceError, setEvidenceError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const settled = report.status === "ACTIONED" || report.status === "DISMISSED";

  useEffect(() => {
    setEvidenceError("");
    setPreviewUrl(null);
  }, [report.id]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function openEvidence(evidenceId) {
    setEvidenceError("");
    try {
      const url = await fetchAuthedBlobUrl(`/api/auth/admin/reports/${report.id}/evidence/${evidenceId}`);
      setPreviewUrl(url);
    } catch (error) { setEvidenceError(error.message); }
  }

  const decisionOptions = [
    report.targetId &&
      /\[รายงานรีวิว\s*#?[^\]]+\]/.test(report.reason || "") &&
      !report.reviewDetail?.review?.removed && {
        value: "REMOVE_REVIEW",
        label: "ลบรีวิวที่ถูกรายงาน",
      },
    report.productId && !report.reviewDetail && {
      value: "REMOVE_PRODUCT",
      label: "ระงับสินค้า",
    },
    report.targetId && {
      value: "SUSPEND_USER",
      label: "ระงับบัญชีผู้ใช้ (SUSPEND_USER)",
    },
    report.targetId && {
      value: "WARN_USER",
      label: "ตักเตือนผู้ใช้ ไม่ระงับบัญชี (WARN_USER)",
    },
    report.targetId && { value: "RESTRICT_BUYER", label: "เพิกถอนสิทธิ์ซื้อ" },
    report.targetId && { value: "RESTRICT_SELLER", label: "เพิกถอนสิทธิ์ขาย" },
    { value: "DISMISS", label: "ยกเลิกรายงาน / ไม่พบความผิด (DISMISS)" },
  ].filter(Boolean);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-50 p-3 sm:p-5 lg:p-8">
      <Modal open={Boolean(previewUrl)} onClose={() => setPreviewUrl(null)} title="รูปหลักฐาน" size="lg">
        {previewUrl && <img src={previewUrl} alt="รูปหลักฐานที่แนบกับรายงาน" className="max-h-[70vh] w-full object-contain p-4" />}
      </Modal>
      {detailLoading && (
        <Alert tone="info" className="mb-4">
          กำลังโหลดรายละเอียดล่าสุด...
        </Alert>
      )}
      {detailError && (
        <Alert className="mb-4" title="โหลดรายละเอียดรายงานไม่สำเร็จ">
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
      <div className="relative mb-6 overflow-hidden rounded-xl border border-red-100 bg-white p-6 shadow-sm">
        <div className="pointer-events-none absolute right-0 top-0 -mr-8 -mt-8 rounded-bl-full bg-red-50 p-8" />
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="material-symbols-outlined text-red-500">
            warning
          </span>
          รายงานปัญหาร้ายแรง (REPORT)
        </h3>
        <div className="space-y-3">
          <Row label="ผู้รายงาน:" mono>
            {report.reporterId}
          </Row>
          {report.targetId && (
            <Row label="ผู้ใช้เป้าหมาย:" mono danger>
              {report.targetId}
            </Row>
          )}
          <Row label="ประเภทปัญหา:">{reportCategoryLabel(report.category)}</Row>
          <Row label="วันที่แจ้งรายงาน:"><CaseDate value={report.reportedAt} /></Row>
          <Row label="วันที่รับงาน:"><CaseDate value={report.reviewedAt} /></Row>
          {settled && <Row label="วันที่ตัดสิน:"><CaseDate value={report.decidedAt || report.decision?.decidedAt} /></Row>}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <Row label="รายละเอียด:">{report.reason}</Row>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="font-bold text-slate-900">รูปหลักฐานจากผู้รายงาน</h4>
        {report.evidence?.length ? report.evidence.map((item) => (
          <button key={item.id} type="button" onClick={() => openEvidence(item.id)} className="mt-3 block rounded-lg border px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
            เปิดรูป: {item.originalName}
          </button>
        )) : <p className="mt-2 text-sm text-slate-500">ผู้รายงานไม่ได้แนบรูปหลักฐาน</p>}
        {evidenceError && <Alert className="mt-3">{evidenceError}</Alert>}
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <UserCard
          label="ผู้แจ้ง"
          person={report.reporter}
          fallbackId={report.reporterId}
          onOpenHistory={onOpenUserHistory}
        />
        {report.targetId && (
          <UserCard
            label="คู่กรณี"
            person={report.target}
            fallbackId={report.targetId}
            onOpenHistory={onOpenUserHistory}
          />
        )}
      </div>

      <ReportProductDetails key={report.id} productId={report.productId} detail={report.productDetail} onRetry={onRetryDetail} />
      {report.reviewDetail && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="font-bold text-slate-900">รีวิวที่ถูกรายงาน</h4>
          {report.reviewDetail.available ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {report.reviewDetail.review.removed ? "รีวิวนี้ถูกลบแล้ว" : report.reviewDetail.review.comment || "ไม่มีข้อความรีวิว"}
            </p>
          ) : <Alert className="mt-2">โหลดรีวิวไม่สำเร็จ: {report.reviewDetail.error}</Alert>}
        </div>
      )}

      {settled ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="font-bold text-slate-900">ผลการพิจารณา</h4>
          {report.decision ? (
            <div className="mt-4 space-y-3">
              <Row label="คำตัดสิน:">{safetyActionLabel(report.decision.action)}</Row>
              <Row label="เหตุผล:">{report.decision.reason}</Row>
              <Row label="ผู้ตัดสิน:">
                {personName(report.decision.decidedBy)} (
                {report.decision.decidedBy.id})
              </Row>
              <Row label="เวลา:">
                {new Date(report.decision.decidedAt).toLocaleString("th-TH")}
              </Row>
            </div>
          ) : (
            <Alert tone="warning" className="mt-3">
              ไม่พบบันทึกเหตุผลและผู้ตัดสินของเคสนี้
            </Alert>
          )}
        </div>
      ) : report.status === "OPEN" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="font-bold text-slate-900">รอเจ้าหน้าที่รับงาน</h4>
          <p className="mt-2 text-sm text-slate-600">รับรายงานนี้ก่อน จึงจะตัดสินหรือใช้คำสั่งกับผู้ใช้ได้</p>
          {error && <Alert className="mt-3">{error}</Alert>}
          <Button type="button" onClick={onClaim} loading={busy} className="mt-4">รับงานนี้</Button>
        </div>
      ) : report.reviewedBy !== currentUserId ? (
        <Alert tone="info">รายงานนี้มีเจ้าหน้าที่คนอื่นรับผิดชอบแล้ว</Alert>
      ) : (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h4 className="font-bold text-slate-900">พิจารณาและจัดการ</h4>

          <Select
            label="การตัดสินใจ"
            placeholder="-- เลือกการตัดสินใจ --"
            options={decisionOptions}
            value={decision}
            onChange={(e) => onDecisionChange(e.target.value)}
          />

          <Textarea
            label="หมายเหตุ (ภายใน / ส่งให้ผู้ใช้)"
            rows={3}
            placeholder="ระบุเหตุผลในการตัดสินใจ..."
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />

          {decision === "REMOVE_REVIEW" && (
            <Alert tone="warning">รีวิวนี้จะถูกลบออกจากหน้าร้านและการคำนวณคะแนน โดยเก็บประวัติการดำเนินการไว้ กรุณาตรวจสอบก่อนยืนยัน</Alert>
          )}

          {error && <Alert>{error}</Alert>}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            {busy ? "กำลังดำเนินการ..." : "ยืนยันการพิจารณา"}
          </Button>
        </form>
      )}
    </div>
  );
}
