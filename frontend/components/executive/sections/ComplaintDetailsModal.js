"use client";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import { TIMEZONE } from "../../../lib/executive";
import {
  actionLabel,
  formatReportedAt,
  REPORT_STATUS_LABELS,
} from "../../../lib/executiveComplaints";

/** @param {{report: import('../../../lib/executiveComplaints').ExecutiveReport|null, onClose: () => void}} props */
export default function ComplaintDetailsModal({ report, onClose }) {
  const anchorRef = useRef(null);
  const open = Boolean(report);

  useLayoutEffect(() => {
    if (!open) return;
    const locked = [];
    // Executive scrolls inside its panel, not the body. Lock those ancestors
    // too; the shared Modal already locks body scrolling and manages focus.
    for (
      let node = anchorRef.current?.parentElement;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const computed = getComputedStyle(node);
      if (
        ![computed.overflowX, computed.overflowY].some((value) =>
          /^(auto|scroll)$/.test(value),
        )
      )
        continue;
      locked.push({
        node,
        overflowX: node.style.overflowX,
        overflowY: node.style.overflowY,
      });
      node.style.overflowX = "hidden";
      node.style.overflowY = "hidden";
    }
    return () => {
      for (const { node, overflowX, overflowY } of locked) {
        node.style.overflowX = overflowX;
        node.style.overflowY = overflowY;
      }
    };
  }, [open]);

  const dialog = (
    <Modal
      open={Boolean(report)}
      onClose={onClose}
      title="รายละเอียดคำร้อง"
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      {report && (
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-medium text-slate-500">เหตุผลของคำร้อง</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-slate-900">
              {report.reason}
            </dd>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500">ผู้ส่งคำร้อง</dt>
              <dd className="mt-1 break-words text-slate-900">
                {report.reporterName || "ไม่ทราบชื่อ"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">วันเวลาที่แจ้ง</dt>
              <dd className="mt-1 text-slate-900">
                {formatReportedAt(report.reportedAt)}
                <span className="mt-1 block text-xs text-slate-500">
                  {TIMEZONE}
                </span>
              </dd>
            </div>
          </div>
          <div>
            <dt className="font-medium text-slate-500">เป้าหมายที่ถูกรายงาน</dt>
            <dd className="mt-1 space-y-1 break-words text-slate-900">
              {report.targetShopName && (
                <p>ชื่อร้าน: {report.targetShopName}</p>
              )}
              {report.targetName && <p>ชื่อผู้ใช้: {report.targetName}</p>}
              {report.targetId && (
                <p className="text-xs text-slate-600">
                  รหัสผู้ใช้: {report.targetId}
                </p>
              )}
              {report.productId && (
                <p className="text-xs text-slate-600">
                  รหัสสินค้า: {report.productId}
                </p>
              )}
              {!report.targetId &&
                !report.targetName &&
                !report.targetShopName &&
                !report.productId && <p>ไม่ระบุเป้าหมาย</p>}
            </dd>
          </div>
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
                  report.actionDetails?.actorId ||
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
    </Modal>
  );

  // Rendering under body escapes the section's animated transform/stacking
  // context, so fixed inset-0 covers the navbar, sidebar and content together.
  return (
    <>
      <span ref={anchorRef} hidden />
      {open &&
        typeof document !== "undefined" &&
        createPortal(dialog, document.body)}
    </>
  );
}
