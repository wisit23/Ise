"use client";

import Button from "../../ui/Button";

/* Shown once KYC has been submitted: either waiting on review, or approved.
   Both used an emoji as the status glyph (⏳ / ✓) — the rest of the app moved
   to Material Symbols in d98e8a1 and these were missed. */
export default function KycStatusCard({ status, statusLabel }) {
  const kycStatus = status?.kycStatus;
  const pending = kycStatus === "PENDING";

  return (
    <div
      className={`rounded-xl border bg-white p-8 shadow-sm ${
        pending ? "border-amber-200" : "border-line"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            pending
              ? "bg-amber-100 text-amber-600"
              : "bg-brand-100 text-brand-600"
          }`}
        >
          <span className="material-symbols-outlined text-[24px]">
            {pending ? "hourglass_top" : "verified"}
          </span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {pending
              ? "ข้อมูลอยู่ระหว่างการตรวจสอบโดยแอดมิน"
              : "คุณได้รับการยืนยันตัวตนเป็นผู้ขายแล้ว"}
          </h2>
          <p
            className={`text-sm ${pending ? "text-amber-800" : "text-brand-700"}`}
          >
            สถานะ: {statusLabel}
          </p>
        </div>
      </div>

      {pending && (
        <p className="mt-4 text-sm text-ink-muted">
          เจ้าหน้าที่กำลังตรวจสอบรูปถ่ายบัตรประชาชนและข้อมูลของคุณ
          เมื่อได้รับการอนุมัติแล้วจะสามารถลงขายสินค้าได้ทันที
        </p>
      )}

      <dl className="mt-6 space-y-3 border-t border-line pt-4 text-sm text-gray-700">
        <div>
          <dt className="inline font-medium text-ink-subtle">ชื่อร้านค้า:</dt>{" "}
          <dd className="inline font-semibold text-gray-900">
            {status?.sellerProfile?.shopName}
          </dd>
        </div>
        {pending && status?.latestApplication?.submittedAt && (
          <div>
            <dt className="inline font-medium text-ink-subtle">
              ยื่นคำขอเมื่อ:
            </dt>{" "}
            <dd className="inline">
              {new Date(status.latestApplication.submittedAt).toLocaleString(
                "th-TH",
              )}
            </dd>
          </div>
        )}
      </dl>

      {!pending && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button href="/sell" icon="add">
            ลงขายสินค้า
          </Button>
          <Button
            href="/seller/dashboard"
            variant="secondary"
            icon="storefront"
          >
            แดชบอร์ดผู้ขาย
          </Button>
        </div>
      )}
    </div>
  );
}
