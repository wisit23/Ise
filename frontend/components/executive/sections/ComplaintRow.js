"use client";
import {
  formatReferenceCode,
  formatReferenceText,
} from "../../../lib/referenceCodes";

import Button from "../../ui/Button";
import {
  describeReport,
  formatReportedAt,
  reportedPartyName,
  REPORT_STATUS_LABELS,
} from "../../../lib/executiveComplaints";

/** @param {{report: import('../../../lib/executiveComplaints').ExecutiveReport, targetFiltered: boolean, onDetails: (report: import('../../../lib/executiveComplaints').ExecutiveReport) => void, onSelectTarget: (id: string, shopName: string|null, name: string|null) => void}} props */
export default function ComplaintRow({
  report,
  targetFiltered,
  onDetails,
  onSelectTarget,
}) {
  const about = describeReport(report);
  const isReview = about.kind === "review";
  const party =
    reportedPartyName(report) ||
    report.targetReferenceCode ||
    formatReferenceCode(report.targetId);
  return (
    <li
      key={report.id}
      className="px-5 py-4 transition-colors hover:bg-slate-50/50"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Report Reason. A report of a review is named as one, with the
              topic only; what the seller wrote and the review are in the
              details. The label is the same as a ticket's or a dispute's. */}
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-snug text-slate-900">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {isReview ? "รายงานรีวิว" : "ข้อร้องเรียน"}
            </span>
            <span className="min-w-0 break-words">
              {formatReferenceText(
                isReview ? about.topic || "รายงานรีวิว" : report.reason,
              )}
            </span>
          </p>

          {/* Meta information */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {report.referenceCode && (
              <span>
                รหัส:{" "}
                <strong className="break-all font-medium text-slate-700">
                  {report.referenceCode}
                </strong>
              </span>
            )}
            <span>
              โดย:{" "}
              <strong className="text-slate-700 font-medium">
                {report.reporterName || "ไม่ทราบชื่อ"}
              </strong>
            </span>
            <span>
              วันที่แจ้ง:{" "}
              <strong className="text-slate-700 font-medium">
                {formatReportedAt(report.reportedAt)}
              </strong>
            </span>
            {report.targetId && (
              <span className="flex flex-wrap items-center gap-1">
                {isReview ? "ผู้เขียนรีวิว:" : "เป้าหมาย:"}{" "}
                <span className="font-semibold text-slate-800">{party}</span>
                {!targetFiltered && (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectTarget(
                        report.targetId,
                        report.targetShopName,
                        report.targetName,
                      )
                    }
                    className="ml-1 text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                  >
                    กรองดูเป้าหมายนี้
                  </button>
                )}
              </span>
            )}
            {report.productId && (
              <span className="font-mono text-slate-400">
                รหัสสินค้า: {formatReferenceCode(report.productId)}
              </span>
            )}
          </div>
        </div>

        {/* Status Badge & Details */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              report.status === "OPEN"
                ? "bg-amber-100 text-amber-800"
                : report.status === "REVIEWED"
                  ? "bg-sky-100 text-sky-800"
                  : report.status === "ACTIONED"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
            }`}
          >
            {REPORT_STATUS_LABELS[report.status] || report.status}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDetails(report)}
          >
            รายละเอียด
          </Button>
        </div>
      </div>
    </li>
  );
}
