"use client";
import { matchesReference } from "../../../lib/referenceCodes";
import ReferenceCode from "../../ui/ReferenceCode";

import { useState } from "react";
import Link from "next/link";
import Button from "../../ui/Button";
import EmptyState from "../../ui/EmptyState";
import ConfirmDialog from "../../ui/ConfirmDialog";
import OrderShippingModal from "../../orders/OrderShippingModal";
import OrderConfirmationModal from "../../orders/OrderConfirmationModal";
import { apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import {
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_STYLE,
  StatusPill,
  baht,
  sellerProductPrice,
} from "./sellerStatus";

function ProductPrice({ product }) {
  const { amount, label } = sellerProductPrice(product);
  return (
    <>
      <span>{baht(amount)}</span>
      {label && <span className="block text-[10px] font-normal text-slate-500">{label}</span>}
    </>
  );
}

const STATUS_FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "available", label: "พร้อมขาย" },
  { value: "hidden", label: "ซ่อนอยู่" },
  { value: "sold", label: "ขายแล้ว" },
  { value: "reserved", label: "ในตะกร้า" },
  { value: "auction_action_required", label: "รอเลือกวิธีขายใหม่" },
  { value: "removed", label: "ถูกระงับ" },
];

export default function SellerProductList({
  products,
  orders = [],
  statusFilter: propStatusFilter,
  onStatusFilterChange,
  onProductDeleted,
  onOrderUpdated,
}) {
  const [localStatusFilter, setLocalStatusFilter] = useState("");
  const [selectedOrderForShipping, setSelectedOrderForShipping] = useState(null);
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const [selectedOrderForConfirm, setSelectedOrderForConfirm] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [deleteProductTarget, setDeleteProductTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const statusFilter =
    propStatusFilter !== undefined ? propStatusFilter : localStatusFilter;
  const setStatusFilter = onStatusFilterChange || setLocalStatusFilter;
  const [search, setSearch] = useState("");

  async function handleConfirmDeleteProduct() {
    if (!deleteProductTarget) return;
    const token = getAccessToken();
    if (!token) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/products/${deleteProductTarget.id}`, {
        method: "DELETE",
        token,
      });
      onProductDeleted?.(deleteProductTarget.id);
      setDeleteProductTarget(null);
    } catch (err) {
      alert(err.message || "เกิดข้อผิดพลาดในการลบสินค้า");
    } finally {
      setDeleting(false);
    }
  }

  const filtered = products
    .filter((p) => !statusFilter || p.status === statusFilter)
    .filter(
      (p) =>
        !search ||
        matchesReference(p, search) ||
        p.title?.toLowerCase().includes(search.toLowerCase()) ||
        (p.tags || []).some((t) =>
          t.toLowerCase().includes(search.toLowerCase()),
        ),
    );

  if (products.length === 0) {
    return (
      <EmptyState
        icon="inventory_2"
        title="ยังไม่มีสินค้าที่ลงขาย"
        description="ลงขายชิ้นแรกเพื่อเริ่มรับคำสั่งซื้อ"
        action={
          <Button href="/sell" icon="add">
            ลงขายสินค้า
          </Button>
        }
        className="border-0 bg-transparent py-10"
      />
    );
  }

  return (
    <div className="animate-fade-in-up space-y-4">
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
            placeholder="ค้นหาชื่อสินค้า หรือแท็ก..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Count ── */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <p>
          แสดง{" "}
          <span className="font-semibold text-slate-700">
            {filtered.length}
          </span>{" "}
          รายการ จากทั้งหมด {products.length} สินค้า
        </p>
        {statusFilter && (
          <button
            onClick={() => setStatusFilter("")}
            className="font-medium text-emerald-600 hover:underline"
          >
            (ล้างตัวกรองสถานะ)
          </button>
        )}
      </div>

      {/* ── Product grid ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="search_off"
          title="ไม่พบสินค้า"
          description="ลองเปลี่ยนตัวกรองหรือคำค้นหา"
          className="border-0 bg-transparent py-10"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/70 bg-white shadow-sm">
          <table className="min-w-[500px] sm:min-w-full w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">สินค้า</th>
                <th className="px-4 py-3 text-right">ราคา</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="group transition-colors hover:bg-slate-50/70"
                >
                  <td className="max-w-[280px] px-4 py-3">
                    <Link
                      href={`/products/${p.id}`}
                      className="focus-ring block truncate font-medium text-slate-800 hover:text-emerald-700"
                    >
                      {p.title}
                    </Link>
                    {p.referenceCode && <ReferenceCode value={p} className="mt-1 text-xs text-ink-subtle" />}
                    <p className="mt-1 text-xs text-ink-subtle">รายการโปรด {p.favoriteCount || 0} คน</p>
                    {/* Tags */}
                    {Array.isArray(p.tags) && p.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.status === "removed" && (
                      <p className="mt-2 text-xs text-red-700">
                        เหตุผล:{" "}
                        {p.moderationReason ||
                          "อยู่ระหว่างการตรวจสอบโดย Trust & Safety"}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    <ProductPrice product={p} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const hasCompletedOrShippedOrder = (orders || []).some(
                        (o) => o.productId === p.id && ["in_transit", "delivered", "completed"].includes(o.status),
                      );
                      const isSold = p.status === "sold" || hasCompletedOrShippedOrder;
                      return (
                        <div className="flex items-center justify-center gap-1">
                          <StatusPill
                            label={isSold ? "ขายแล้ว" : (PRODUCT_STATUS_LABEL[p.status] || p.status)}
                            style={isSold ? PRODUCT_STATUS_STYLE.sold : PRODUCT_STATUS_STYLE[p.status]}
                          />
                          {isSold && (
                            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                              หมด
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  {(() => {
                    const awaitingOrder = (orders || []).find(
                      (o) => o.productId === p.id && ["confirmed", "ready_to_ship", "pickup_in_progress"].includes(o.status),
                    );
                    const paidOrder = (orders || []).find(
                      (o) => o.productId === p.id && o.status === "paid",
                    );

                    return (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {awaitingOrder && p.status !== "removed" && (
                            <button
                              type="button"
                              aria-label={awaitingOrder.status === "pickup_in_progress" ? "ส่งมอบให้ขนส่งแล้ว" : "เรียกขนส่ง"}
                              onClick={() => {
                                setSelectedOrderForShipping(awaitingOrder);
                                setShippingModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-semibold shadow-2xs transition"
                              title="จัดส่งสินค้าสำหรับคำสั่งซื้อนี้"
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                local_shipping
                              </span>
                              <span>{awaitingOrder.status === "pickup_in_progress" ? "ส่งมอบให้ขนส่งแล้ว" : "เรียกขนส่ง"}</span>
                            </button>
                          )}
                          {!awaitingOrder && paidOrder && p.status !== "removed" && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderForConfirm(paidOrder);
                                setConfirmModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-semibold shadow-2xs transition"
                              title="เปิดดูรายละเอียดผู้ซื้อเพื่อยืนยันหรือปฏิเสธออเดอร์"
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                check_circle
                              </span>
                              <span>ยืนยันรับออเดอร์</span>
                            </button>
                          )}
                          {!(
                            ["sold", "removed"].includes(p.status) || p.preRemovalStatus === "sold" ||
                            (orders || []).some(
                              (o) => o.productId === p.id && ["in_transit", "delivered", "completed"].includes(o.status),
                            )
                          ) ? (
                            <div className="flex items-center justify-end gap-2.5">
                              {p.status === "reserved" ? (
                                <span
                                  className="text-xs font-medium text-slate-300"
                                  title="ไม่สามารถแก้ไขสินค้าที่อยู่ระหว่างการสั่งซื้อได้"
                                >
                                  แก้ไข
                                </span>
                              ) : (
                                <Link
                                  href={`/products/${p.id}/edit`}
                                  className="focus-ring rounded text-xs font-medium text-slate-500 hover:text-emerald-700 hover:underline"
                                >
                                  แก้ไข
                                </Link>
                              )}
                              <span className="text-slate-200">|</span>
                              <button
                                type="button"
                                disabled={p.status === "reserved"}
                                onClick={() => setDeleteProductTarget(p)}
                                className="focus-ring rounded text-xs font-medium text-red-500 hover:text-red-700 hover:underline disabled:opacity-40 disabled:hover:text-red-500 disabled:no-underline"
                                title={p.status === "reserved" ? "ไม่สามารถลบสินค้าที่อยู่ระหว่างการสั่งซื้อได้" : "ลบสินค้านี้"}
                              >
                                ลบ
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">{p.status === "removed" ? "ดูได้อย่างเดียว" : "—"}</span>
                          )}
                        </div>
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Shipping Fulfillment Modal */}
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

      {/* Product Deletion Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(deleteProductTarget)}
        title="ยืนยันการลบสินค้า"
        description={
          deleteProductTarget
            ? `คุณแน่ใจว่าต้องการลบสินค้า "${deleteProductTarget.title}" ใช่หรือไม่? สินค้านี้จะไม่แสดงในร้านและรายการขายของคุณ`
            : ""
        }
        confirmLabel="ยืนยันการลบ"
        cancelLabel="ยกเลิก"
        tone="danger"
        busy={deleting}
        onConfirm={handleConfirmDeleteProduct}
        onCancel={() => !deleting && setDeleteProductTarget(null)}
      />
    </div>
  );
}
