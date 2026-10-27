"use client";
import {
  formatReferenceCode,
  formatReferenceText,
} from "../../../lib/referenceCodes";

import DetailsModal from "./DetailsModal";
import { TIMEZONE } from "../../../lib/executive";
import {
  actionLabel,
  describeReport,
  formatReportedAt,
  REPORT_STATUS_LABELS,
} from "../../../lib/executiveComplaints";

/** @param {{report: import('../../../lib/executiveComplaints').ExecutiveReport|null, onClose: () => void}} props */
export default function ComplaintDetailsModal({ report, onClose }) {
  const about = report ? describeReport(report) : null;
  const isReview = about?.kind === "review";
  const reportedAt = report && (
    <div>
      <dt className="font-medium text-slate-500">วันเวลาที่แจ้ง</dt>
      <dd className="mt-1 text-slate-900">
        {formatReportedAt(report.reportedAt)}
        <span className="mt-1 block text-xs text-slate-500">{TIMEZONE}</span>
      </dd>
    </div>
  );
  const reporter = report && (
    <div>
      <dt className="font-medium text-slate-500">ผู้ส่งคำร้อง</dt>
      <dd className="mt-1 break-words text-slate-900">
        {report.reporterName || "ไม่ทราบชื่อ"}
      </dd>
    </div>
  );
  const hasTarget = Boolean(
    report?.targetId || report?.targetName || report?.targetShopName,
  );
  return (
    <DetailsModal
      open={Boolean(report)}
      onClose={onClose}
      title="รายละเอียดคำร้อง"
    >
      {report && (
        <dl className="space-y-4 text-sm">
          {isReview ? (
            <>
              <div>
                <dt className="font-medium text-slate-500">ประเภทคำร้อง</dt>
                <dd className="mt-1 text-slate-900">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                    รายงานรีวิว
                  </span>
                </dd>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">หัวข้อปัญหา</dt>
                  <dd className="mt-1 break-words text-slate-900">
                    {formatReferenceText(about.topic || "-")}
                  </dd>
                </div>
                {reportedAt}
              </div>
              <div>
                <dt className="font-medium text-slate-500">
                  รายละเอียดที่ผู้รายงานเพิ่ม
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-slate-900">
                  {formatReferenceText(about.comment || "-")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">
                  เนื้อหารีวิวที่ถูกรายงาน
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words italic text-slate-900">
                  {about.reviewText
                    ? `“${formatReferenceText(about.reviewText)}”`
                    : "-"}
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt className="font-medium text-slate-500">เหตุผลของคำร้อง</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-slate-900">
                {formatReferenceText(report.reason)}
              </dd>
            </div>
          )}
          {isReview ? (
            reporter
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {reporter}
              {reportedAt}
            </div>
          )}
          {(hasTarget || !report.productId) && (
            <div>
              <dt className="font-medium text-slate-500">
                {isReview
                  ? "ผู้เขียนรีวิวที่ถูกรายงาน"
                  : "เป้าหมายที่ถูกรายงาน"}
              </dt>
              <dd className="mt-1 space-y-1 break-words text-slate-900">
                {/* The person who wrote a review is who was reported; the shop
                  they may also run is not, so it is left out. */}
                {!isReview && report.targetShopName && (
                  <p>ชื่อร้าน: {report.targetShopName}</p>
                )}
                {report.targetName && <p>ชื่อผู้ใช้: {report.targetName}</p>}
                {report.targetId && (
                  <p className="text-xs text-slate-600">
                    รหัสผู้ใช้:{" "}
                    {report.targetReferenceCode ||
                      formatReferenceCode(report.targetId)}
                  </p>
                )}
                {!hasTarget && <p>ไม่ระบุเป้าหมาย</p>}
              </dd>
            </div>
          )}
          {report.productId && (
            <div>
              <dt className="font-medium text-slate-500">สินค้า</dt>
              <dd className="mt-1 break-words text-slate-900">
                <p>
                  {report.productTitle ||
                    (report.productUnavailable
                      ? "ไม่พร้อมใช้งาน"
                      : "ไม่พบสินค้า")}
                  {/* The seller took the listing down; its name is still known. */}
                  {report.productTitle && report.productDeleted && (
                    <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      สินค้าถูกลบแล้ว
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-600">
                  รหัสสินค้า: {formatReferenceCode(report.productId)}
                </p>
              </dd>
            </div>
          )}
          <div>
            <dt className="font-medium text-slate-500">สถานะคำร้อง</dt>
            <dd className="mt-1 text-slate-900">
              {REPORT_STATUS_LABELS[report.status] || report.status}
            </dd>
          </div>
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <dt className="font-medium text-slate-500">
                ผู้ดำเนินการ (Trust & Safety)
              </dt>
              <dd className="mt-1 break-words text-slate-900">
                {report.actionDetails?.actorName ||
                  formatReferenceCode(report.actionDetails?.actorId) ||
                  "-"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Action</dt>
              <dd className="mt-1 text-slate-900">{actionLabel(report)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">
                เหตุผลในการดำเนินการ
              </dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-slate-900">
                {report.actionDetails?.reason || "-"}
              </dd>
            </div>
          </div>
        </dl>
      )}
    </DetailsModal>
  );
}
