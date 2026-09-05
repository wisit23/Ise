/* eslint-disable no-unused-vars */
"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Pagination from "../../Pagination";

import Badge from "../../panel/ui/Badge";
import KpiCard from "../../panel/ui/KpiCard";
import ChartCard from "../../panel/ui/ChartCard";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  AGENT_NEXT_STATUS,
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_STYLE,
  ORDER_STATUS_LABEL,
  HELP_CATEGORIES,
  DONUT_PRIORITY_COLORS,
  DONUT_DISPUTE_COLORS,
  PAGE_SIZE,
} from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";
import RadioSelect from "../../ui/RadioSelect";

const SEARCH_TYPE_OPTIONS = [
  { value: "orderId", label: "รหัสคำสั่งซื้อ (Order)" },
  { value: "buyerId", label: "รหัสผู้ซื้อ (Buyer)" },
  { value: "sellerId", label: "รหัสผู้ขาย (Seller)" },
];

export default function OrdersSection({ token }) {
  const [searchType, setSearchType] = useState("orderId");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams();
      params.set(searchType, query.trim());
      const data = await apiFetch(`/api/orders/support/search?${params}`, {
        token,
      });
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`animate-fade-in-up flex flex-col ${!searched ? "items-center justify-center min-h-[40vh] pt-10 text-center" : ""}`}
    >
      {!searched && (
        <div className="mb-8 animate-in zoom-in-95 duration-500">
          <span className="material-symbols-outlined text-[64px] text-emerald-600 mb-2 drop-shadow-sm">
            manage_search
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            ศูนย์กลางค้นหาออเดอร์
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            พิมพ์รหัส Order, Buyer, หรือ Seller เพื่อตรวจสอบประวัติการซื้อขาย
          </p>
        </div>
      )}

      <div
        className={`w-full transition-all duration-500 ease-out ${searched ? "max-w-4xl mb-6" : "max-w-2xl"}`}
      >
        <form
          onSubmit={handleSearch}
          className="relative flex w-full items-center rounded-[10px] border border-slate-200 bg-white p-1.5 shadow-sm transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 hover:border-slate-300"
        >
          {/* New RadioSelect Dropdown integrated seamlessly inside the search bar */}
          <RadioSelect
            options={SEARCH_TYPE_OPTIONS}
            value={searchType}
            onChange={setSearchType}
            variant="panel"
            size="sm"
            className="w-48 border-r border-slate-200 shrink-0"
            buttonClassName="!border-0 !shadow-none bg-slate-50/80 rounded-l-[8px] rounded-r-none py-2 pl-3.5 pr-2.5"
          />

          <div className="flex flex-1 items-center px-3">
            <span className="material-symbols-outlined mr-2 text-[19px] text-slate-400">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์รหัสที่ต้องการค้นหา..."
              className="w-full border-0 bg-transparent py-2 text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex shrink-0 items-center gap-1 rounded-[8px] bg-emerald-600 px-4 py-2 text-xs font-bold tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {searched && !loading && items.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <span className="material-symbols-outlined text-[40px] text-slate-500 mb-2">
            search_off
          </span>
          <p className="text-sm font-semibold text-slate-600">
            ไม่พบคำสั่งซื้อที่ตรงกับเงื่อนไข
          </p>
          <p className="mt-1 text-xs text-slate-500">
            หมายเหตุ: การค้นหา Buyer/Seller ต้องใช้รหัสเต็ม (Full ID)
            ไม่ใช่รหัสย่อ 8 ตัวแรก
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">
              พบ {items.length} รายการ
            </h3>
          </div>
          <div className="grid gap-4">
            {items.map((order) => (
              <div
                key={order.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      #{order.id}
                    </span>
                    <Badge variant={order.status}>
                      {ORDER_STATUS_LABEL[order.status] || order.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-500">
                    <span>ผู้ซื้อ: {order.buyer?.name || order.buyerId}</span>
                    <span className="mx-2">•</span>
                    <span>ผู้ขาย: {order.seller?.name || order.sellerId}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-900">
                    ฿{Number(order.totalAmount || 0).toLocaleString()}
                  </span>
                  <Link
                    href={`/orders?id=${order.id}`}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    ดูรายละเอียด
                    <span className="material-symbols-outlined text-[16px]">
                      chevron_right
                    </span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
