"use client";

import { useEffect, useState } from "react";
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

export default function OrderShippingModal({
  orderId,
  initialOrder = null,
  isOpen = false,
  onClose,
  onShipped,
}) {
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  if (!isOpen) return null;

  const shipping = order?.checkoutSession?.shippingAddress;

  async function handleMarkShipped() {
    if (!order?.id) return;
    setUpdating(true);
    setError("");
    setSuccess("");
    const token = getAccessToken();

    try {
      const updated = await apiFetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        token,
        body: { status: "shipped" },
      });
      setOrder(updated);
      setSuccess("บันทึกการจัดส่งสินค้าเรียบร้อยแล้ว");
      onShipped?.(updated);
    } catch (err) {
      setError(err.message || "อัปเดตสถานะการจัดส่งไม่สำเร็จ");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-gray-150 transition-all"
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
              <p className="font-mono text-xs text-gray-400">
                Order ID: #{orderId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
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

        {loading && !order ? (
          <div className="space-y-4 py-6">
            <Skeleton className="h-6 w-3/4 rounded-lg" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : order ? (
          <div className="space-y-5 py-4">
            {/* Product Summary */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 text-sm">
                    {order.productTitle || "สินค้า"}
                  </p>
                  <p className="mt-1 text-xs font-bold text-emerald-600">
                    {baht(order.price || 0)}
                  </p>
                </div>
                <StatusPill
                  label={ORDER_STATUS_LABEL[order.status] || order.status}
                  style={ORDER_STATUS_STYLE[order.status]}
                />
              </div>
            </div>

            {/* Shipping Address */}
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
                  ไม่พบข้อมูลที่อยู่จัดส่ง (หรือคำสั่งซื้อผ่านการประมูล)
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 justify-end border-t border-gray-100">
              <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">
                ปิด
              </Button>

              {order.status === "confirmed" && (
                <Button
                  variant="primary"
                  icon="local_shipping"
                  loading={updating}
                  onClick={handleMarkShipped}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ยืนยันการจัดส่งสินค้า
                </Button>
              )}

              {order.status === "shipped" && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 border border-sky-200">
                  <span className="material-symbols-outlined text-[16px]">
                    check_circle
                  </span>
                  สินค้าอยู่ระหว่างการขนส่งเรียบร้อยแล้ว
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
