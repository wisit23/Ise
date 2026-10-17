"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, createReportWithEvidence } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import { REPORT_CATEGORIES } from "../lib/reportCategories";
import Select from "./ui/Select";

const REVIEW_REASONS = [
  "รีวิวปั่น / สแปม / ปั๊มรีวิว",
  "รีวิวเท็จ / ข้อมูลไม่ตรงกับความจริง",
  "ข้อความหยาบคาย / คุกคาม / ไม่เหมาะสม",
  "โฆษณา / แปะลิงก์หรือชักชวนภายนอก",
  "อื่นๆ",
];

/** Buyer/Seller-facing "file a report" modal — reused wherever a report can
 * be filed against a user, product, or review comment (product page, store page).
 * Supports review reporting with reason categories and preview snippet;
 * other reports need a Trust & Safety category and may attach an image. */
export default function ReportModal({
  open,
  onClose,
  onSuccess,
  targetId,
  targetLabel,
  productId,
  productLabel,
  reviewId,
  reviewComment,
  title,
}) {

  const [mounted, setMounted] = useState(false);
  const isReviewReport = Boolean(reviewId || reviewComment);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(
    isReviewReport ? REVIEW_REASONS[0] : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pendingWarning, setPendingWarning] = useState("");
  const [checkingPending, setCheckingPending] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if current user already reported this item and it is still pending admin review
  useEffect(() => {
    if (!open) {
      setPendingWarning("");
      return;
    }
    const token = getAccessToken();
    if (!token) return;

    let active = true;
    setCheckingPending(true);
    setPendingWarning("");

    const params = new URLSearchParams();
    if (productId) params.set("productId", productId);
    if (reviewId) params.set("reviewId", reviewId);
    if (targetId) params.set("targetId", targetId);

    apiFetch(`/api/auth/reports/pending-check?${params.toString()}`, { token })
      .then((res) => {
        if (!active) return;
        if (res?.hasPendingReport) {
          setPendingWarning(res.message);
        }
      })
      .catch((err) => {
        console.debug("Check pending report error:", err);
      })
      .finally(() => {
        if (active) setCheckingPending(false);
      });

    return () => {
      active = false;
    };
  }, [open, productId, reviewId, targetId]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open || !mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, mounted]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (pendingWarning) {
      setError(pendingWarning);
      return;
    }

    const trimmedReason = reason.trim();
    if (!isReviewReport && !trimmedReason) {
      setError("กรุณาระบุเหตุผล");
      return;
    }
    if (!isReviewReport && !category) {
      setError("กรุณาเลือกประเภทปัญหา");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setError("รูปภาพต้องมีขนาดไม่เกิน 10 MB");
      return;
    }
    setBusy(true);
    setError("");

    let finalReason = trimmedReason;
    if (isReviewReport) {
      const parts = [];
      if (reviewId) parts.push(`[รายงานรีวิว #${reviewId}]`);
      else parts.push("[รายงานรีวิว]");
      if (selectedCategory) parts.push(`[${selectedCategory}]`);
      if (trimmedReason) parts.push(trimmedReason);
      if (reviewComment) {
        parts.push(`(เนื้อหารีวิว: "${reviewComment.slice(0, 120)}")`);
      }
      finalReason = parts.join(" ");
    }

    try {
      await createReportWithEvidence(
        {
          targetId,
          productId,
          reviewId,
          category: isReviewReport ? undefined : category,
          reason: finalReason,
          file: isReviewReport ? null : file,
        },
        token,
      );
      setDone(true);
      onSuccess?.({ reviewId, productId, targetId });
    } catch (err) {

      console.error("Report error:", err);
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setReason("");
    setCategory("");
    setFile(null);
    setSelectedCategory(isReviewReport ? REVIEW_REASONS[0] : "");
    setError("");
    setPendingWarning("");
    setDone(false);
    onClose();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl transition-all max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <div className="flex items-center gap-2 text-emerald-600">
              <span className="material-symbols-outlined text-[24px]">
                check_circle
              </span>
              <p className="text-sm font-semibold text-gray-900">
                ส่งรายงานเรียบร้อยแล้ว
              </p>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              ทีมงานจะตรวจสอบและดำเนินการตามนโยบายแพลตฟอร์มโดยเร็วที่สุด
            </p>
            <button
              onClick={handleClose}
              className="mt-4 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
            >
              ปิด
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-red-600">
                  flag
                </span>
                {title || (isReviewReport ? "รายงานรีวิวที่ไม่เหมาะสม" : "รายงานปัญหา")}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label="ปิด"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {(targetLabel || productLabel) && (
              <p className="mt-1 text-xs text-gray-500">
                {targetLabel && <>ผู้ใช้: {targetLabel}</>}
                {targetLabel && productLabel && <br />}
                {productLabel && <>สินค้า: {productLabel}</>}
              </p>
            )}

            {/* Review quote snippet preview */}
            {isReviewReport && reviewComment && (
              <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                <span className="block font-semibold text-slate-500 mb-1">
                  เนื้อหารีวิวที่รายงาน:
                </span>
                <p className="italic text-slate-700 line-clamp-3">
                  &ldquo;{reviewComment}&rdquo;
                </p>
              </div>
            )}

            {/* Category selection for review reports */}
            {isReviewReport && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  หัวข้อปัญหา
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {REVIEW_REASONS.map((cat) => {
                    const active = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                          active
                            ? "bg-red-50 text-red-700 border border-red-300 font-semibold"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {pendingWarning && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0">
                  pending
                </span>
                <div>
                  <p className="font-semibold text-amber-900">อยู่ระหว่างรอผลการตัดสินจากผู้ดูแลระบบ</p>
                  <p className="mt-0.5">{pendingWarning}</p>
                </div>
              </div>
            )}

            {!isReviewReport && (
              <Select
                id="report-category"
                required
                label="ประเภทปัญหา"
                placeholder="เลือกประเภทปัญหา"
                options={REPORT_CATEGORIES}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={Boolean(pendingWarning)}
                className="mt-3"
              />
            )}

            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isReviewReport ? "รายละเอียดเพิ่มเติม (ถ้ามี)" : "อธิบายปัญหาที่พบ"}
              </label>
              <textarea
                autoFocus={!isReviewReport && !pendingWarning}
                disabled={Boolean(pendingWarning)}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={isReviewReport ? 3 : 4}
                placeholder={
                  pendingWarning
                    ? "รายงานนี้อยู่ระหว่างการตรวจสอบโดยทีมงาน..."
                    : isReviewReport
                      ? "เช่น มีพฤติกรรมรีวิวปั่น ข้อมูลไม่เป็นความจริง..."
                      : "อธิบายปัญหาที่พบ..."
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            {!isReviewReport && !pendingWarning && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-700 hover:border-emerald-500">
                <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
                {file ? file.name : "แนบรูปหลักฐาน (ไม่เกิน 10 MB)"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            )}

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                {pendingWarning ? "ปิด" : "ยกเลิก"}
              </button>
              <button
                type="submit"
                disabled={busy || checkingPending || Boolean(pendingWarning)}
                className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition shadow-xs"
              >
                {busy
                  ? "กำลังส่ง..."
                  : checkingPending
                    ? "กำลังตรวจสอบ..."
                    : pendingWarning
                      ? "อยู่ระหว่างตรวจสอบ"
                      : "ส่งรายงาน"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
