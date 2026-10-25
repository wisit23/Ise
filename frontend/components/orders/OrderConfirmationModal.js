"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Skeleton from "../ui/Skeleton";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
  StatusPill,
  baht,
} from "../seller/dashboard/sellerStatus";
import { formatOrderId } from "../../lib/orders";

export default function OrderConfirmationModal({
  orderId,
  initialOrder = null,
  isOpen = false,
  onClose,
  onConfirmed,
  onRejected,
  onOrderUpdated,
}) {
  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setShowRejectForm(false);
    setRejectReason("");
    setError("");
    setSuccess("");
  }, [orderId, isOpen]);

  useEffect(() => {
    if (!isOpen || !orderId) return;
    setError("");
    setSuccess("");

    if (initialOrder && initialOrder.id === orderId) {
      setOrder(initialOrder);
    }

    const token = getAccessToken();
    if (!token) return;

    setLoading(true);
    apiFetch(`/api/orders/${orderId}`, { token })
      .then((data) => {
        setOrder(data);
      })
      .catch((err) => {
        setError(err.message || "โหลดข้อมูลคำสั่งซื้อไม่สำเร็จ");
      })
      .finally(() => setLoading(false));
  }, [isOpen, orderId, initialOrder]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen || !mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, mounted]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === "Escape" && !confirming && !rejecting) {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, confirming, rejecting]);

  if (!isOpen || !mounted) return null;

  const currentOrder = order || initialOrder;
  const shipping =
    currentOrder?.shipping?.addressSnapshot ||
    currentOrder?.shippingAddress ||
    currentOrder?.checkoutSession?.shippingAddress;

  async function handleConfirm() {
    if (!currentOrder?.id || confirming || rejecting) return;
    setConfirming(true);
    setError("");
    setSuccess("");
    const token = getAccessToken();

    try {
      const updated = await apiFetch(`/api/orders/${currentOrder.id}/confirm`, {
        method: "POST",
        token,
      });
      setOrder(updated);
      setSuccess("ยืนยันรับออเดอร์เรียบร้อยแล้ว");
      onConfirmed?.(updated);
      onOrderUpdated?.(updated);
      setTimeout(() => {
        onClose?.();
      }, 500);
    } catch (err) {
      setError(err.message || "ยืนยันรับออเดอร์ไม่สำเร็จ");
    } finally {
      setConfirming(false);
    }
  }

  async function handleReject() {
    if (!currentOrder?.id || rejecting || confirming) return;
    setRejecting(true);
    setError("");
    setSuccess("");
    const token = getAccessToken();

    try {
      const updated = await apiFetch(`/api/orders/${currentOrder.id}/reject`, {
        method: "POST",
        token,
        body: { reason: rejectReason.trim() || "ผู้ขายไม่สะดวกจัดส่งสินค้า" },
      });
      setOrder(updated);
      setSuccess("ปฏิเสธคำสั่งซื้อและคืนเงินให้ผู้ซื้อเรียบร้อยแล้ว");
      onRejected?.(updated);
      onOrderUpdated?.(updated);
      setTimeout(() => {
        onClose?.();
      }, 600);
    } catch (err) {
      setError(err.message || "ปฏิเสธคำสั่งซื้อไม่สำเร็จ");
    } finally {
      setRejecting(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={() => {
        if (!confirming && !rejecting) onClose?.();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-gray-150 transition-all max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <span className="material-symbols-outlined text-[24px]">
                local_shipping
              </span>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                รายละเอียดคำสั่งซื้อ & ที่อยู่จัดส่ง
              </h2>
              <p
                className="font-mono text-xs text-gray-400"
                title={formatOrderId(currentOrder || orderId)}
              >
                Order ID: #{formatOrderId(currentOrder || orderId)}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="ปิดหน้าต่าง"
            onClick={onClose}
            disabled={confirming || rejecting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
          </button>
        </div>

        {error && (
          <Alert tone="error" className="mt-4">
            {error}
          </Alert>
        )}

        {success && (
          <Alert tone="success" className="mt-4">
            {success}
          </Alert>
        )}

        {loading && !currentOrder ? (
          <div className="space-y-4 py-6">
            <Skeleton className="h-6 w-3/4 rounded-lg" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : currentOrder ? (
          <div className="space-y-5 py-4">
            {/* Product Summary */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 text-sm">
                    {currentOrder.productTitle || "สินค้า"}
                  </p>
                  <p className="mt-1 text-xs font-bold text-emerald-600">
                    {baht(currentOrder.price || currentOrder.ordersAmount || 0)}
                  </p>
                </div>
                <StatusPill
                  label={
                    ORDER_STATUS_LABEL[currentOrder.status] || currentOrder.status
                  }
                  style={ORDER_STATUS_STYLE[currentOrder.status]}
                />
              </div>
            </div>

            {/* Buyer & Shipping Address */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                <span className="material-symbols-outlined text-[16px] text-emerald-600">
                  location_on
                </span>
                ที่อยู่สำหรับจัดส่งสินค้า
              </h3>

              {shipping ? (
                <div className="space-y-1.5 text-sm text-gray-800">
                  <p className="font-semibold text-gray-900">
                    {shipping.recipientName}{" "}
                    <span className="font-normal text-gray-500">
                      ({shipping.phone})
                    </span>
                  </p>
                  <p className="leading-relaxed text-gray-700 text-xs sm:text-sm">
                    {shipping.addressLine} ต./แขวง {shipping.subdistrict} อ./เขต{" "}
                    {shipping.district} จ.{shipping.province}{" "}
                    {shipping.postalCode}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-1">
                  ไม่พบข้อมูลที่อยู่จัดส่ง
                </p>
              )}
            </div>

            {/* Reject Order Reason View */}
            {showRejectForm ? (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4 animate-fade-in">
                <div className="flex items-start gap-2 text-rose-800 text-xs">
                  <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0 mt-0.5">
                    warning
                  </span>
                  <div>
                    <p className="font-bold text-rose-950 text-sm">
                      คำเตือนเกี่ยวกับการปฏิเสธออเดอร์
                    </p>
                    <p className="text-rose-800 leading-relaxed mt-0.5">
                      เมื่อปฏิเสธคำสั่งซื้อ ระบบจะทำการคืนเงินเต็มจำนวน (
                      {baht(currentOrder.price || currentOrder.ordersAmount || 0)})
                      ให้แก่ผู้ซื้อทันที และนำสินค้ากลับมาวางขายใหม่
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    เหตุผลในการปฏิเสธออเดอร์ (ไม่บังคับ)
                  </label>
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="เช่น สินค้าหมดสต็อก, สินค้าชำรุดก่อนส่ง, ไม่สะดวกจัดส่ง..."
                    className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-gray-500">เหตุผลยอดนิยม:</span>
                  {["สินค้าหมดสต็อก", "สินค้าชำรุดก่อนจัดส่ง", "ที่อยู่จัดส่งอยู่นอกพื้นที่"].map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRejectReason(preset)}
                        className="rounded-full bg-white border border-rose-200 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-100 transition"
                      >
                        {preset}
                      </button>
                    ),
                  )}
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowRejectForm(false)}
                    disabled={rejecting}
                    className="text-xs"
                  >
                    ย้อนกลับ
                  </Button>
                  <Button
                    variant="danger"
                    icon="cancel"
                    loading={rejecting}
                    onClick={handleReject}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                  >
                    ยืนยันการปฏิเสธออเดอร์
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Modal Footer Actions (Normal View) */}
            {!showRejectForm && (
              <div className="pt-3 flex flex-col sm:flex-row items-center gap-2.5 justify-end border-t border-gray-100">
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={confirming || rejecting}
                  className="w-full sm:w-auto"
                >
                  ปิด
                </Button>

                <button
                  type="button"
                  aria-label="ปฏิเสธ"
                  disabled={confirming || rejecting}
                  onClick={() => setShowRejectForm(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:text-rose-800 transition disabled:opacity-50"
                  title="ปฏิเสธคำสั่งซื้อนี้และคืนเงินให้ผู้ซื้อ"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    cancel
                  </span>
                  <span>ปฏิเสธ</span>
                </button>

                <Button
                  variant="primary"
                  icon="check_circle"
                  loading={confirming}
                  disabled={rejecting}
                  onClick={handleConfirm}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ยืนยันรับออเดอร์
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
