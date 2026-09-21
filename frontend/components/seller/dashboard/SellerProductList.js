"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "../../ui/Button";
import EmptyState from "../../ui/EmptyState";
import {
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_STYLE,
  StatusPill,
  baht,
} from "./sellerStatus";

const STATUS_FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "available", label: "พร้อมขาย" },
  { value: "hidden", label: "ซ่อนอยู่" },
  { value: "sold", label: "ขายแล้ว" },
  { value: "reserved", label: "ในตะกร้า" },
];

export default function SellerProductList({
  products,
  statusFilter: propStatusFilter,
  onStatusFilterChange,
}) {
  const [localStatusFilter, setLocalStatusFilter] = useState("");
  const statusFilter =
    propStatusFilter !== undefined ? propStatusFilter : localStatusFilter;
  const setStatusFilter = onStatusFilterChange || setLocalStatusFilter;
  const [search, setSearch] = useState("");

  const filtered = products
    .filter((p) => !statusFilter || p.status === statusFilter)
    .filter(
      (p) =>
        !search ||
        p.title?.toLowerCase().includes(search.toLowerCase()) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
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
          <span className="font-semibold text-slate-700">{filtered.length}</span>{" "}
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
        <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm">
          <table className="w-full text-sm">
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
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    {baht(p.price)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusPill
                      label={PRODUCT_STATUS_LABEL[p.status] || p.status}
                      style={PRODUCT_STATUS_STYLE[p.status]}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status !== "sold" ? (
                      <Link
                        href={`/products/${p.id}/edit`}
                        className="focus-ring rounded text-xs font-medium text-slate-500 hover:text-emerald-700 hover:underline"
                      >
                        แก้ไข
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
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
