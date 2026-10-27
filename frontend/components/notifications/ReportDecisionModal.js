"use client";

import Modal from "../ui/Modal";
import Link from "next/link";
import { notificationText } from "../../lib/notifications";

const DECISION_CONFIG = {
  SUSPEND_USER: {
    label: "ระงับการใช้งานบัญชีผู้ใช้",
    icon: "person_off",
    color: "bg-rose-100 text-rose-800 border-rose-200",
    badgeColor: "bg-rose-500 text-white",
  },
  WARN_USER: {
    label: "ตักเตือนผู้ใช้",
    icon: "warning",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    badgeColor: "bg-amber-500 text-white",
  },
  REMOVE_PRODUCT: {
    label: "ลบสินค้าออกจากระบบ",
    icon: "delete_forever",
    color: "bg-rose-100 text-rose-800 border-rose-200",
    badgeColor: "bg-rose-500 text-white",
  },
  DISMISS: {
    label: "ยกเลิกรายงาน / ไม่พบการกระทำผิด",
    icon: "check_circle",
    color: "bg-slate-100 text-slate-800 border-slate-200",
    badgeColor: "bg-slate-600 text-white",
  },
  APPROVE_REFUND: {
    label: "อนุมัติคืนเงินเต็มจำนวนให้ผู้ซื้อ",
    icon: "payments",
    color: "bg-emerald-50 text-emerald-800 border-emerald-200",
    badgeColor: "bg-emerald-600 text-white",
  },
  RELEASE_ESCROW: {
    label: "ปล่อยเงินค่าสินค้าให้ผู้ขาย",
    icon: "verified",
    color: "bg-blue-50 text-blue-800 border-blue-200",
    badgeColor: "bg-blue-600 text-white",
  },
  REJECT: {
    label: "ปฏิเสธคำร้องข้อพิพาท",
    icon: "cancel",
    color: "bg-slate-100 text-slate-800 border-slate-200",
    badgeColor: "bg-slate-600 text-white",
  },
  DISPUTE_OPENED: {
    label: "เปิดข้อพิพาทแล้ว (เจ้าหน้าที่กำลังตรวจสอบ)",
    icon: "gavel",
    color: "bg-amber-50 text-amber-800 border-amber-200",
    badgeColor: "bg-amber-600 text-white",
  },
  REQUEST_EVIDENCE: {
    label: "เจ้าหน้าที่ขอหลักฐานเพิ่มเติม",
    icon: "document_scanner",
    color: "bg-indigo-50 text-indigo-800 border-indigo-200",
    badgeColor: "bg-indigo-600 text-white",
  },
};

const ROLE_LABELS = {
  reporter: "คุณเป็นผู้รายงาน",
  target: "คุณเป็นผู้ถูกรายงาน",
  seller: "คุณเป็นผู้ขายในคำสั่งซื้อนี้",
  buyer: "คุณเป็นผู้ซื้อในคำสั่งซื้อนี้",
};

export default function ReportDecisionModal({ open, onClose, notification }) {
  if (!open || !notification) return null;

  const metadata = notification.metadata || {};
  const decisionKey = metadata.decision;
  const config =
    DECISION_CONFIG[decisionKey] || {
      label: metadata.decisionLabel || "มีผลสรุปจาก Trust and Safety",
      icon: "gavel",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      badgeColor: "bg-blue-600 text-white",
    };

  const isDispute =
    notification.type === "DISPUTE" ||
    Boolean(metadata.disputeId) ||
    Boolean(notification.title?.includes("ข้อพิพาท"));

  const roleText = ROLE_LABELS[metadata.role] || null;
  const adminReason = metadata.reason || null;
  const formattedDate = notification.createdAt
    ? new Date(notification.createdAt).toLocaleString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isDispute
          ? "รายละเอียดข้อพิพาทและผลการตัดสิน"
          : "รายละเอียดผลการตัดสินจาก Trust and Safety"
      }
      description={
        isDispute
          ? "ข้อมูลความคืบหน้าข้อพิพาทและผลการพิจารณาตัดสินจาก Trust and Safety"
          : "ผลการพิจารณาตรวจสอบรายงานโดยทีม Trust and Safety"
      }
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {notification.link && (
            <Link
              href={notification.link}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <span>ดูรายการที่เกี่ยวข้อง</span>
              <span className="material-symbols-outlined text-[15px]">
                open_in_new
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700"
          >
            รับทราบและปิด
          </button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {/* Decision Badge Card */}
        <div
          className={`flex items-start gap-3.5 rounded-xl border p-4 ${config.color}`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-xs">
            <span className="material-symbols-outlined text-[22px]">
              {config.icon}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                ผลการพิจารณา
              </span>
              {roleText && (
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-2xs">
                  {roleText}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-bold leading-snug">{config.label}</p>
          </div>
        </div>

        {metadata.reportReason && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-xs font-semibold text-slate-700">เหตุผลที่รายงานความคิดเห็น:</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{metadata.reportReason}</p>
          </section>
        )}

        {/* Admin Reason Box */}
        {adminReason && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <span className="material-symbols-outlined text-[16px] text-slate-500">
                assignment
              </span>
              <span>เหตุผล / ข้อชี้แจงจาก Trust and Safety:</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200">
              {adminReason}
            </p>
          </div>
        )}

        {/* Notification Message Detail */}
        <div className="rounded-xl border border-slate-100 bg-white p-3.5 text-xs text-slate-600 space-y-1.5">
          <div className="font-semibold text-slate-800">
            {notificationText(notification.title)}
          </div>
          <p className="leading-relaxed text-slate-600">
            {notificationText(notification.message)}
          </p>
          {formattedDate && (
            <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1 border-t border-slate-100">
              <span className="material-symbols-outlined text-[13px]">
                schedule
              </span>
              <span>ตัดสินเมื่อ: {formattedDate}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
