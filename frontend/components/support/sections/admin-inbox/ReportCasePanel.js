"use client";

import Alert from "../../../ui/Alert";
import Button from "../../../ui/Button";
import Select from "../../../ui/Select";
import Textarea from "../../../ui/Textarea";

function Row({ label, children, mono, danger }) {
  return (
    <div className="flex gap-4">
      <span className="w-24 shrink-0 text-sm font-medium text-slate-500">
        {label}
      </span>
      <span
        className={`text-sm ${mono ? "font-mono" : "font-medium text-slate-800"} ${
          danger ? "text-red-600" : ""
        }`}
      >
        {children}
      </span>
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
}) {
  const settled = report.status === "ACTIONED" || report.status === "DISMISSED";

  const decisionOptions = [
    report.targetId && {
      value: "SUSPEND_USER",
      label: "ระงับบัญชีผู้ใช้ (SUSPEND_USER)",
    },
    report.targetId && {
      value: "WARN_USER",
      label: "ตักเตือนผู้ใช้ ไม่ระงับบัญชี (WARN_USER)",
    },
    report.productId && {
      value: "REMOVE_PRODUCT",
      label: "ลบสินค้า (REMOVE_PRODUCT)",
    },
    { value: "DISMISS", label: "ยกเลิกรายงาน / ไม่พบความผิด (DISMISS)" },
  ].filter(Boolean);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-7">
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
          {report.productId && (
            <Row label="สินค้าเป้าหมาย:" mono danger>
              {report.productId}
            </Row>
          )}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <Row label="รายละเอียด:">{report.reason}</Row>
          </div>
        </div>
      </div>

      {settled ? (
        <p className="rounded-xl border border-slate-200 bg-slate-100 py-6 text-center text-sm font-medium text-slate-600">
          เคสนี้ถูกพิจารณาและปิดไปแล้ว
        </p>
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

          {error && <Alert>{error}</Alert>}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            {busy ? "กำลังดำเนินการ..." : "ยืนยันการพิจารณา"}
          </Button>
        </form>
      )}
    </div>
  );
}
