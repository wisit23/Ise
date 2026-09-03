"use client";

import { useState } from "react";
import { apiFetch } from "../lib/api";
import { getAccessToken } from "../lib/auth";

/** Buyer/Seller-facing "file a report" modal — reused wherever a report can
 * be filed against a user and/or a product (product page, store page). This
 * is the missing entry point into the existing Admin report-review flow:
 * report:create was granted to BUYER/SELLER in permissions.js but nothing
 * ever called it until now. */
export default function ReportModal({
  open,
  onClose,
  targetId,
  targetLabel,
  productId,
  productLabel,
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผล");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/auth/reports", {
        method: "POST",
        token,
        body: { targetId, productId, reason: reason.trim() },
      });
      setDone(true);
    } catch (err) {
      console.error("Report error:", err);
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setReason("");
    setError("");
    setDone(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 px-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <p className="text-sm font-medium text-gray-900">
              ส่งรายงานเรียบร้อยแล้ว
            </p>
            <p className="mt-1 text-xs text-gray-500">
              ทีมงานจะตรวจสอบและดำเนินการโดยเร็วที่สุด
            </p>
            <button
              onClick={handleClose}
              className="mt-4 w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              ปิด
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="text-sm font-semibold text-gray-900">รายงานปัญหา</h2>
            {(targetLabel || productLabel) && (
              <p className="mt-1 text-xs text-gray-500">
                {targetLabel && <>ผู้ใช้: {targetLabel}</>}
                {targetLabel && productLabel && <br />}
                {productLabel && <>สินค้า: {productLabel}</>}
              </p>
            )}
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="อธิบายปัญหาที่พบ..."
              className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-md border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "กำลังส่ง..." : "ส่งรายงาน"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
