"use client";

import { matchesReference } from "../../../lib/referenceCodes";


import { useEffect, useState } from "react";
import Link from "next/link";
import ContactSellerButton from "../../chat/ContactSellerButton";
import EmptyState from "../../ui/EmptyState";
import Modal from "../../ui/Modal";
import OrderShippingModal from "../../orders/OrderShippingModal";
import OrderConfirmationModal from "../../orders/OrderConfirmationModal";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
  StatusPill,
  baht,
  isOrderDisputed,
  isSellerDisputeVisible,
} from "./sellerStatus";
import { formatOrderId } from "../../../lib/orders";
import { apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import { SELLER_NEXT_STEP } from "../../../lib/orderLifecycle";

const ALL_STATUSES = [
  { value: "", label: "ทั้งหมด" },
  { value: "pending_payment", label: "รอชำระเงิน" },
  { value: "paid", label: "รอยืนยันคำสั่งซื้อ" },
  { value: "confirmed", label: "ต้องเตรียมสินค้า" },
  { value: "ready_to_ship", label: "พร้อมเรียกขนส่ง" },
  { value: "pickup_in_progress", label: "ขนส่งกำลังเข้ารับสินค้า" },
  { value: "in_transit", label: "อยู่ระหว่างการขนส่ง" },
  { value: "delivered", label: "ส่งถึงผู้ซื้อแล้ว" },
  { value: "completed", label: "ขายสำเร็จ" },
  { value: "cancelled", label: "ยกเลิกแล้ว" },
  { value: "payment_expired", label: "หมดเวลาชำระเงิน" },
  { value: "seller_confirmation_expired", label: "หมดเวลายืนยันคำสั่งซื้อ" },
  { value: "disputed", label: "ข้อพิพาท" },
  { value: "refunded", label: "คืนเงินแล้ว" },
];

// ─── Section 2: Order Tracking ────────────────────────────────────────────────
export default function SellerOrderTracker({
  orders,
  highlightOrderId,
  onClearHighlight,
  statusFilter: propStatusFilter,
  onStatusFilterChange,
  onOrderUpdated,
}) {
  const [localStatusFilter, setLocalStatusFilter] = useState("");
  const [orderTypeFilter, setOrderTypeFilter] = useState("all"); // "all" | "regular" | "auction"
  const [selectedOrderForShipping, setSelectedOrderForShipping] = useState(null);
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const [selectedOrderForConfirm, setSelectedOrderForConfirm] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedOrderForReject, setSelectedOrderForReject] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const selectedStatusFilter =
    propStatusFilter !== undefined ? propStatusFilter : localStatusFilter;
  const statusFilter = selectedStatusFilter;
  const setStatusFilter = onStatusFilterChange || setLocalStatusFilter;
  const highlightedOrder = orders.find((order) => order.id === highlightOrderId);
  const highlightedReference = highlightedOrder ? formatOrderId(highlightedOrder) : "";
  const [search, setSearch] = useState(propStatusFilter !== "disputed" ? highlightedReference : "");
  // The search box is seeded from the highlighted order, so it has to follow
  // that highlight when it changes or is cleared — otherwise a stale order
  // number stays in the box and silently empties every other filter (e.g.
  // the dispute banner's "ดูรายการข้อพิพาท" showed 0 rows).
  useEffect(() => {
    if (!highlightOrderId) {
      setSearch("");
      return undefined;
    }
    setSearch(propStatusFilter !== "disputed" ? highlightedReference : "");
    if (typeof document === "undefined") return undefined;
    const timer = setTimeout(() => {
      const row = document.getElementById(`order-row-${highlightOrderId}`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [highlightOrderId, propStatusFilter, highlightedReference]);

  async function prepareOrder(order) {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const updated = await apiFetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        token: getAccessToken(),
        body: { status: SELLER_NEXT_STEP.confirmed.status },
      });
      onOrderUpdated?.(updated);
    } catch (err) {
      alert(err.message || "อัปเดตคำสั่งซื้อไม่สำเร็จ");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectOrder() {
    if (!selectedOrderForReject || actionLoading) return;
    setActionLoading(true);
    setActionError("");
    try {
      const token = getAccessToken();
      const updated = await apiFetch(`/api/orders/${selectedOrderForReject.id}/reject`, {
        method: "POST",
        token,
        body: { reason: rejectReason || "ผู้ขายไม่สะดวกจัดส่งสินค้า" },
      });
      setRejectModalOpen(false);
      setSelectedOrderForReject(null);
      setRejectReason("");
      onOrderUpdated?.(updated);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const filtered = orders
    .filter((o) => {
      if (highlightOrderId && o.id === highlightOrderId) return true;
      if (!statusFilter) return true;
      if (statusFilter === "disputed") return isOrderDisputed(o);
      return o.status === statusFilter;
    })
    .filter((o) => {
      if (orderTypeFilter === "all") return true;
      const isAuction = Boolean(o.auctionId) || o.orderType === "AUCTION" || o.id?.startsWith("AUC-");
      return orderTypeFilter === "auction" ? isAuction : !isAuction;
    })
    .filter((o) => {
      if (highlightOrderId && o.id === highlightOrderId) return true;
      if (!search) return true;
      const needle = search.trim().toLowerCase();
      // Sellers type the number they see on screen ("ORD-C58A…"), which
      // for most orders is formatOrderId's display form, not the raw id.
      return (
        o.productTitle?.toLowerCase().includes(needle) ||
        o.id?.toLowerCase().includes(needle) ||
        matchesReference(o, search)
      );
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const disputeCount = orders.filter(isOrderDisputed).length;

  return (
    <div className="animate-fade-in-up space-y-4">
      {highlightOrderId && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2 text-xs text-emerald-800 border border-emerald-200">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">
              pin_drop
            </span>
            <span>
              แสดงรายละเอียดคำสั่งซื้อที่เลือก:{" "}
              <strong className="font-mono">{formatOrderId(highlightedOrder || highlightOrderId)}</strong>
            </span>
          </div>
          <button
            onClick={() => {
              setSearch("");
              onClearHighlight?.();
            }}
            className="font-semibold text-emerald-700 hover:underline"
          >
            แสดงทั้งหมด
          </button>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า หรือเลข Order ID..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        {/* Order Type Toggle (ทุกประเภท / ขายปกติ / ประมูล) */}
        <div className="flex items-center rounded-lg bg-slate-100 p-1 text-xs">
          <button
            type="button"
            onClick={() => setOrderTypeFilter("all")}
            className={`rounded-md px-3 py-1 font-medium transition ${
              orderTypeFilter === "all"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ทุกประเภท
          </button>
          <button
            type="button"
            onClick={() => setOrderTypeFilter("regular")}
            className={`rounded-md px-3 py-1 font-medium transition ${
              orderTypeFilter === "regular"
                ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ขายปกติ
          </button>
          <button
            type="button"
            onClick={() => setOrderTypeFilter("auction")}
            className={`rounded-md px-3 py-1 font-medium transition ${
              orderTypeFilter === "auction"
                ? "bg-white text-sky-700 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ประมูล
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATUSES.map((s) => {
            const isDisputedPill = s.value === "disputed";
            return (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s.value
                    ? isDisputedPill
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-emerald-600 text-white shadow-sm"
                    : isDisputedPill && disputeCount > 0
                      ? "bg-red-50 border border-red-300 text-red-700 hover:bg-red-100"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{s.label}</span>
                {isDisputedPill && disputeCount > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      statusFilter === s.value
                        ? "bg-white text-red-700"
                        : "bg-red-600 text-white"
                    }`}
                  >
                    {disputeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Summary count ── */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <p>
          แสดง{" "}
          <span className="font-semibold text-slate-700">
            {filtered.length}
          </span>{" "}
          รายการ จากทั้งหมด {orders.length} คำสั่งซื้อ
        </p>
        {(statusFilter || orderTypeFilter !== "all") && (
          <button
            onClick={() => {
              setStatusFilter("");
              setOrderTypeFilter("all");
            }}
            className="font-medium text-emerald-600 hover:underline"
          >
            (ล้างตัวกรองทั้งหมด)
          </button>
        )}
      </div>

      {/* ── Order list ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="ไม่พบคำสั่งซื้อ"
          description={
            statusFilter || search
              ? "ลองเปลี่ยนตัวกรองหรือคำค้นหา"
              : "เมื่อมีลูกค้าสั่งซื้อ รายการจะปรากฏที่นี่"
          }
          className="border-0 bg-transparent py-10"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/70 bg-white shadow-sm">
          <table className="min-w-[500px] sm:min-w-full w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">สินค้า</th>
                <th className="px-4 py-3 text-right">ราคา</th>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-right">การกระทำ</th>
                <th className="px-4 py-3 text-center">เคส</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  id={`order-row-${o.id}`}
                  className={`group transition-colors ${
                    highlightOrderId === o.id
                      ? "bg-emerald-50/90 font-medium border-l-4 border-emerald-600 shadow-xs ring-1 ring-emerald-500/30"
                      : "hover:bg-slate-50/70"
                  }`}
                >
                  <td className="max-w-[240px] px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                          Boolean(o.auctionId) || o.orderType === "AUCTION" || o.id?.startsWith("AUC-")
                            ? "bg-sky-50 text-sky-700 border border-sky-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {Boolean(o.auctionId) || o.orderType === "AUCTION" || o.id?.startsWith("AUC-")
                          ? "ประมูล"
                          : "ขายปกติ"}
                      </span>
                      <p className="truncate font-medium text-slate-800">
                        {o.productTitle || "(ไม่มีชื่อสินค้า)"}
                      </p>
                    </div>
                    <p
                      className="truncate font-mono text-[10px] text-slate-400"
                      title={`Order ID: ${formatOrderId(o)}`}
                    >
                      #{formatOrderId(o)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    {baht(o.price)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(o.createdAt).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusPill
                      label={o.status === "disputed" && !isSellerDisputeVisible(o.dispute)
                        ? "อยู่ระหว่างตรวจสอบ"
                        : ORDER_STATUS_LABEL[o.status] || o.status}
                      style={ORDER_STATUS_STYLE[o.status]}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {o.status === "paid" && (
                        <>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => {
                              setSelectedOrderForConfirm(o);
                              setConfirmModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition disabled:opacity-50"
                            title="ยืนยันรับออเดอร์เพื่อดำเนินการจัดส่งสินค้า"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              check_circle
                            </span>
                            <span>ยืนยันรับออเดอร์</span>
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => {
                              setSelectedOrderForReject(o);
                              setRejectReason("");
                              setActionError("");
                              setRejectModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition disabled:opacity-50"
                            title="ปฏิเสธออเดอร์และคืนเงินเต็มจำนวนให้ผู้ซื้อ"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              cancel
                            </span>
                            <span>ปฏิเสธออเดอร์</span>
                          </button>
                        </>
                      )}
                      {o.status === "confirmed" && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => prepareOrder(o)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                            inventory_2
                          </span>
                          <span>{SELLER_NEXT_STEP.confirmed.label}</span>
                        </button>
                      )}
                      {["ready_to_ship", "pickup_in_progress"].includes(o.status) && (
                        <button
                          type="button"
                          aria-label={SELLER_NEXT_STEP[o.status].label}
                          onClick={() => {
                            setSelectedOrderForShipping(o);
                            setShippingModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition"
                          title="ดูที่อยู่และดำเนินการจัดส่ง"
                        >
                          <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                            local_shipping
                          </span>
                          <span>{SELLER_NEXT_STEP[o.status].label}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrderForShipping(o);
                          setShippingModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition"
                        title="ดูที่อยู่ผู้ซื้อ"
                      >
                        <span className="material-symbols-outlined text-[15px] text-slate-500">
                          location_on
                        </span>
                        <span>ที่อยู่</span>
                      </button>
                      <ContactSellerButton
                        productId={o.productId}
                        orderId={o.id}
                        label="แชท"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 transition"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isSellerDisputeVisible(o.dispute) ? (
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            o.dispute.decision || o.dispute.status === "DECIDED"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          {o.dispute.decision || o.dispute.status === "DECIDED"
                            ? "พิจารณาแล้ว"
                            : "อยู่ระหว่างพิจารณา"}
                        </span>
                        <Link
                          href={`/support/cases/${o.id}`}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline"
                        >
                          ดูข้อพิพาท
                        </Link>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Order Modal */}
      <Modal
        open={rejectModalOpen}
        onClose={() => {
          if (!actionLoading) {
            setRejectModalOpen(false);
            setSelectedOrderForReject(null);
          }
        }}
        title="ปฏิเสธคำสั่งซื้อและคืนเงินเต็มจำนวน"
        description={`คำสั่งซื้อ #${selectedOrderForReject?.id ? formatOrderId(selectedOrderForReject) : ""}`}
        size="md"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => {
                setRejectModalOpen(false);
                setSelectedOrderForReject(null);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleRejectOrder}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition disabled:opacity-50"
            >
              {actionLoading ? "กำลังดำเนินการ..." : "ยืนยันปฏิเสธออเดอร์"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-amber-600">
                info
              </span>
              <span>คำเตือนเกี่ยวกับการปฏิเสธออเดอร์</span>
            </p>
            <p>
              เมื่อปฏิเสธคำสั่งซื้อ ระบบจะดำเนินการ<strong>คืนเงินเต็มจำนวน (฿{Number(selectedOrderForReject?.price || selectedOrderForReject?.ordersAmount || 0).toLocaleString("th-TH")})</strong> ให้แก่ผู้ซื้อทันที และสินค้าจะถูกนำกลับมาวางจำหน่ายในสถานะพร้อมขาย
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              เหตุผลในการปฏิเสธออเดอร์ <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="ระบุเหตุผล เช่น สินค้าชำรุดก่อนส่ง, สินค้าหมดสต็อก, ไม่สะดวกจัดส่ง ฯลฯ"
              className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-slate-500">เหตุผลยอดนิยม:</span>
            {["สินค้าหมดสต็อก", "สินค้าชำรุดก่อนจัดส่ง", "ที่อยู่จัดส่งอยู่นอกพื้นที่บริการ"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRejectReason(preset)}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200 transition"
              >
                {preset}
              </button>
            ))}
          </div>

          {actionError && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
              {actionError}
            </p>
          )}
        </div>
      </Modal>

      {/* Shipping Address & Fulfillment Modal */}
      <OrderShippingModal
        orderId={selectedOrderForShipping?.id}
        initialOrder={selectedOrderForShipping}
        isOpen={shippingModalOpen}
        onClose={() => setShippingModalOpen(false)}
        onShipped={(updated) => {
          onOrderUpdated?.(updated);
        }}
        onRejected={(updated) => {
          onOrderUpdated?.(updated);
        }}
        onOrderUpdated={(updated) => {
          onOrderUpdated?.(updated);
        }}
      />

      {/* Order Confirmation & Details Modal */}
      <OrderConfirmationModal
        orderId={selectedOrderForConfirm?.id}
        initialOrder={selectedOrderForConfirm}
        isOpen={confirmModalOpen}
        onClose={() => {
          setConfirmModalOpen(false);
          setSelectedOrderForConfirm(null);
        }}
        onConfirmed={(updated) => {
          onOrderUpdated?.(updated);
        }}
        onRejected={(updated) => {
          onOrderUpdated?.(updated);
        }}
        onOrderUpdated={(updated) => {
          onOrderUpdated?.(updated);
        }}
      />
    </div>
  );
}
