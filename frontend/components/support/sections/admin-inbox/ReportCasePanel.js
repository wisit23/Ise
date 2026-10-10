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
          รายงาน {person.safetySummary.reportCount} · คำสั่งก่อนหน้า{" "}
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
  detailLoading = false,
  detailError = "",
  onRetryDetail,
  onOpenUserHistory,
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

      {report.productId && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="font-bold text-slate-900">รายละเอียดสินค้า</h4>
          {report.productDetail?.available ? (
            <div className="mt-3 space-y-2">
              <Row label="ชื่อสินค้า:">
                {report.productDetail.product.title}
              </Row>
              <Row label="ผู้ขาย:" mono>
                {report.productDetail.product.sellerId}
              </Row>
              <Row label="สถานะ:">{report.productDetail.product.status}</Row>
              <Row label="ราคา:">
                {Number(report.productDetail.product.price || 0).toLocaleString(
                  "th-TH",
                )}{" "}
                บาท
              </Row>
            </div>
          ) : (
            <Alert tone="warning" className="mt-3">
              {report.productDetail?.error || "ยังโหลดข้อมูลสินค้าล่าสุดไม่ได้"}
            </Alert>
          )}
        </div>
      )}

      {settled ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="font-bold text-slate-900">ผลการพิจารณา</h4>
          {report.decision ? (
            <div className="mt-4 space-y-3">
              <Row label="คำตัดสิน:">{report.decision.action}</Row>
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
              ไม่พบ Audit ที่บันทึกเหตุผลและผู้ตัดสินของเคสนี้
            </Alert>
          )}
        </div>
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
