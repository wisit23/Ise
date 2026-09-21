"use client";

import { useState } from "react";
import EmptyState from "../../ui/EmptyState";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
  StatusPill,
  baht,
} from "./sellerStatus";

const ALL_STATUSES = [
  { value: "", label: "ทั้งหมด" },
  { value: "pending", label: "รอชำระเงิน" },
  { value: "pending_payment", label: "รอชำระเงิน (PP)" },
  { value: "confirmed", label: "ยืนยันแล้ว" },
  { value: "shipped", label: "จัดส่งแล้ว" },
  { value: "completed", label: "ขายสำเร็จ" },
  { value: "cancelled", label: "ยกเลิกแล้ว" },
];

// ─── Section 2: Order Tracking ────────────────────────────────────────────────
export default function SellerOrderTracker({
  orders,
  highlightOrderId,
  onClearHighlight,
  statusFilter: propStatusFilter,
  onStatusFilterChange,
}) {
  const [localStatusFilter, setLocalStatusFilter] = useState("");
  const statusFilter =
    propStatusFilter !== undefined ? propStatusFilter : localStatusFilter;
  const setStatusFilter = onStatusFilterChange || setLocalStatusFilter;
  const [search, setSearch] = useState(
    highlightOrderId ? highlightOrderId.slice(0, 8) : "",
  );

  const filtered = orders
    .filter((o) => !statusFilter || o.status === statusFilter)
    .filter(
      (o) =>
        !search ||
        o.productTitle?.toLowerCase().includes(search.toLowerCase()) ||
        o.id?.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
              <strong className="font-mono">{highlightOrderId}</strong>
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

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATUSES.map((s) => (
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

      {/* ── Summary count ── */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <p>
          แสดง{" "}
          <span className="font-semibold text-slate-700">
            {filtered.length}
          </span>{" "}
          รายการ จากทั้งหมด {orders.length} คำสั่งซื้อ
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
        <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">สินค้า</th>
                <th className="px-4 py-3 text-right">ราคา</th>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className={`group transition-colors ${
                    highlightOrderId === o.id
                      ? "bg-emerald-50/90 font-medium border-l-4 border-emerald-600"
                      : "hover:bg-slate-50/70"
                  }`}
                >
                  <td className="max-w-[220px] px-4 py-3">
                    <p className="truncate font-medium text-slate-800">
                      {o.productTitle || "(ไม่มีชื่อสินค้า)"}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                      #{o.id}
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
                      label={ORDER_STATUS_LABEL[o.status] || o.status}
                      style={ORDER_STATUS_STYLE[o.status]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
