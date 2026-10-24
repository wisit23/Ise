"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Skeleton from "../ui/Skeleton";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
  StatusPill,
  baht,
} from "../seller/dashboard/sellerStatus";
import {
  formatOrderId,
  isValidTrackingNumber,
  TRACKING_NUMBER_MESSAGE,
} from "../../lib/orders";

export const SHIPPING_COMPANIES = [
  "Thailand Post",
  "Kerry Express",
  "J&T Express",
  "Flash Express",
  "SPX Express",
  "Best Express",
];

export default function OrderShippingModal({
  orderId,
  initialOrder = null,
  isOpen = false,
  onClose,
  onShipped,
  onRejected,
  onOrderUpdated,
}) {
  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [company, setCompany] = useState("");
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const companyDropdownRef = useRef(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [canShip, setCanShip] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCanShip(getStoredUser()?.id === order?.sellerId);
  }, [order?.sellerId]);

  useEffect(() => {
    setCompany("");
    setTrackingNumber("");
    setCompanyDropdownOpen(false);
  }, [orderId]);

  useEffect(() => {
    if (!isOpen || !orderId) return;
    setError("");
    setSuccess("");
    setShowRejectForm(false);
    setRejectReason("");

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

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        companyDropdownRef.current &&
        !companyDropdownRef.current.contains(e.target)
      ) {
        setCompanyDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (companyDropdownOpen) {
          setCompanyDropdownOpen(false);
          return;
        }
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, companyDropdownOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const shipping =
    order?.shipping?.addressSnapshot ||
    order?.shippingAddress ||
    order?.checkoutSession?.shippingAddress;

  async function handleConfirmOrder() {
    if (!order?.id) return;
    setConfirming(true);
    setError("");
    setSuccess("");
    const token = getAccessToken();

    try {
      const updated = await apiFetch(`/api/orders/${order.id}/confirm`, {
        method: "POST",
        token,
      });
      setOrder(updated);
      setSuccess("ยืนยันรับออเดอร์เรียบร้อยแล้ว ตอนนี้คุณสามารถกรอกข้อมูลบริษัทขนส่งและเลขพัสดุเพื่อจัดส่งสินค้าได้");
      onOrderUpdated?.(updated);
      onShipped?.(updated);
    } catch (err) {
      setError(err.message || "ยืนยันรับออเดอร์ไม่สำเร็จ");
    } finally {
      setConfirming(false);
    }
  }

  async function handleMarkShipped() {
    if (!order?.id) return;
    if (order.status !== "ready_to_ship") {
      setError("ก่อนผู้ขายจะกดจัดส่งสินค้าได้ ต้องเตรียมสินค้าให้พร้อมจัดส่งก่อน");
      return;
    }
    if (!isValidTrackingNumber(trackingNumber)) {
      setError(TRACKING_NUMBER_MESSAGE);
      return;
    }
    setUpdating(true);
    setError("");
    setSuccess("");
    const token = getAccessToken();

    try {
      const updated = await apiFetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        token,
        body: {
          status: "shipped",
          company: company.trim(),
          trackingNumber: trackingNumber.trim(),
          version: order.version,
        },
      });
      setOrder(updated);
      setSuccess("บันทึกการจัดส่งสินค้าเรียบร้อยแล้ว");
      onOrderUpdated?.(updated);
      onShipped?.(updated);
    } catch (err) {
      setError(err.message || "อัปเดตสถานะการจัดส่งไม่สำเร็จ");
    } finally {
      setUpdating(false);
    }
  }

  async function handleRejectOrder() {
    if (!order?.id || rejecting || updating) return;
    setRejecting(true);
    setError("");
    setSuccess("");
    const token = getAccessToken();

    try {
      const updated = await apiFetch(`/api/orders/${order.id}/reject`, {
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
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-gray-150 transition-all overflow-visible my-auto"
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
              <p className="font-mono text-xs text-gray-400" title={orderId}>
                Order ID: #{formatOrderId(orderId)}
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

            {canShip && ["paid", "pending", "pending_payment"].includes(order.status) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-900 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-amber-600 shrink-0 mt-0.5">
                    info
                  </span>
                  <div className="space-y-1">
                    <p className="font-bold text-amber-950 text-sm">
                      ก่อนผู้ขายจะกดจัดส่งสินค้าได้ ต้องทำการยืนยันรับออเดอร์ก่อน
                    </p>
                    <p className="text-amber-800 leading-relaxed">
                      คำสั่งซื้อนี้ยังไม่ได้รับการยืนยันรับออเดอร์ กรุณากดยืนยันรับออเดอร์เพื่อรับคำสั่งซื้อ จากนั้นระบบจะเปิดให้กรอกข้อมูลบริษัทขนส่งและเลขติดตามพัสดุ
                    </p>
                  </div>
                </div>
              </div>
            )}

            {canShip && order.status === "confirmed" && (
              <p className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-900">
                เตรียมสินค้าให้พร้อม แล้วกด “เตรียมสินค้าเรียบร้อย” ในแดชบอร์ดผู้ขายก่อนจึงจะกรอกข้อมูลจัดส่งได้
              </p>
            )}

            {canShip && order.status === "ready_to_ship" && (
              <div className="grid gap-3 sm:grid-cols-2 items-start">
                <div className="space-y-1">
                  <label
                    htmlFor="shipping-company-select"
                    className="block text-sm font-medium text-slate-700"
                  >
                    บริษัทขนส่ง
                  </label>
                  <div className="relative" ref={companyDropdownRef}>
                    {/* Hidden accessible select for test and form compatibility */}
                    <select
                      id="shipping-company-select"
                      aria-label="บริษัทขนส่ง"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="sr-only"
                      tabIndex={-1}
                    >
                      <option value="">-- เลือกบริษัทขนส่ง --</option>
                      {SHIPPING_COMPANIES.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      {company && !SHIPPING_COMPANIES.includes(company) && (
                        <option value={company}>{company}</option>
                      )}
                    </select>

                    {/* Trigger button for custom scrollable dropdown */}
                    <button
                      type="button"
                      data-testid="shipping-company-trigger"
                      onClick={() => setCompanyDropdownOpen((prev) => !prev)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "ArrowDown" ||
                          e.key === "Enter" ||
                          e.key === " "
                        ) {
                          e.preventDefault();
                          setCompanyDropdownOpen((prev) => !prev);
                        }
                      }}
                      aria-haspopup="listbox"
                      aria-expanded={companyDropdownOpen}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs hover:border-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition cursor-pointer"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className="material-symbols-outlined text-[16px] text-slate-400 shrink-0">
                          local_shipping
                        </span>
                        <span
                          className={
                            company
                              ? "text-slate-900 font-medium truncate"
                              : "text-slate-400 truncate"
                          }
                        >
                          {company || "-- เลือกบริษัทขนส่ง --"}
                        </span>
                      </span>
                      <span
                        className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 shrink-0 ${
                          companyDropdownOpen ? "rotate-180 text-emerald-600" : ""
                        }`}
                      >
                        expand_more
                      </span>
                    </button>

                    {/* Scrollable dropdown menu opening downwards as requested */}
                    {companyDropdownOpen && (
                      <div
                        role="listbox"
                        data-testid="shipping-company-menu"
                        className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-40 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-2xl divide-y divide-slate-100"
                      >
                        <div
                          role="option"
                          aria-selected={!company}
                          onClick={() => {
                            setCompany("");
                            setCompanyDropdownOpen(false);
                          }}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs cursor-pointer transition ${
                            !company
                              ? "bg-emerald-50 text-emerald-700 font-semibold"
                              : "text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          <span>-- เลือกบริษัทขนส่ง --</span>
                          {!company && (
                            <span className="material-symbols-outlined text-[16px] text-emerald-600">
                              check
                            </span>
                          )}
                        </div>
                        {SHIPPING_COMPANIES.map((name) => {
                          const isSelected = company === name;
                          return (
                            <div
                              key={name}
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setCompany(name);
                                setCompanyDropdownOpen(false);
                              }}
                              className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs cursor-pointer transition ${
                                isSelected
                                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-slate-400">
                                  local_shipping
                                </span>
                                <span>{name}</span>
                              </div>
                              {isSelected && (
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">
                                  check
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {company && !SHIPPING_COMPANIES.includes(company) && (
                          <div
                            role="option"
                            aria-selected={true}
                            onClick={() => {
                              setCompany(company);
                              setCompanyDropdownOpen(false);
                            }}
                            className="flex items-center justify-between rounded-lg px-3 py-2 text-xs cursor-pointer transition bg-emerald-50 text-emerald-700 font-semibold"
                          >
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[16px] text-slate-400">
                                local_shipping
                              </span>
                              <span>{company}</span>
                            </div>
                            <span className="material-symbols-outlined text-[16px] text-emerald-600">
                              check
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="shipping-tracking-input"
                    className="block text-sm font-medium text-slate-700"
                  >
                    เลขติดตามพัสดุ
                  </label>
                  <input
                    id="shipping-tracking-input"
                    aria-label="เลขติดตามพัสดุ"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    maxLength={20}
                    placeholder="เช่น TH123456789TH"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
              </div>
            )}

            {/* Reject Order Reason View */}
            {showRejectForm ? (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4 animate-fade-in">
                <div className="flex items-start gap-2 text-rose-800 text-xs">
                  <span
                    className="material-symbols-outlined text-[18px] text-rose-600 shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    warning
                  </span>
                  <div>
                    <p className="font-bold text-rose-950 text-sm">
                      คำเตือนเกี่ยวกับการปฏิเสธออเดอร์
                    </p>
                    <p className="text-rose-800 leading-relaxed mt-0.5">
                      เมื่อปฏิเสธคำสั่งซื้อ ระบบจะทำการคืนเงินเต็มจำนวน (
                      {baht(order.price || order.ordersAmount || 0)})
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
                  {[
                    "สินค้าหมดสต็อก",
                    "สินค้าชำรุดก่อนจัดส่ง",
                    "ที่อยู่จัดส่งอยู่นอกพื้นที่",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectReason(preset)}
                      className="rounded-full bg-white border border-rose-200 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-100 transition"
                    >
                      {preset}
                    </button>
                  ))}
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
                    onClick={handleRejectOrder}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                  >
                    ยืนยันการปฏิเสธออเดอร์
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Action buttons */}
            {!showRejectForm && (
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 justify-end border-t border-gray-100">
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={updating || confirming || rejecting}
                  className="w-full sm:w-auto"
                >
                  ปิด
                </Button>

                {canShip && ["paid", "pending", "pending_payment"].includes(order.status) && (
                  <>
                    <button
                      type="button"
                      aria-label="ปฏิเสธ"
                      disabled={updating || confirming || rejecting}
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
                      onClick={handleConfirmOrder}
                      className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      ยืนยันรับออเดอร์
                    </Button>
                  </>
                )}

                {canShip && order.status === "ready_to_ship" && (
                  <>
                    <button
                      type="button"
                      aria-label="ปฏิเสธ"
                      disabled={updating || confirming || rejecting}
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
                      icon="local_shipping"
                      loading={updating}
                      disabled={!company.trim() || !trackingNumber.trim() || rejecting}
                      onClick={handleMarkShipped}
                      className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      ยืนยันการจัดส่งสินค้า
                    </Button>
                  </>
                )}

                {["shipped", "delivered"].includes(order.status) && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 border border-sky-200">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                      check_circle
                    </span>
                    สินค้าอยู่ระหว่างการขนส่งเรียบร้อยแล้ว
                  </span>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
