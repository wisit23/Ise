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
  TICKET_STATUS_LABEL, TICKET_STATUS_STYLE, PRIORITY_LABEL, PRIORITY_STYLE,
  AGENT_NEXT_STATUS, DISPUTE_STATUS_LABEL, DISPUTE_STATUS_STYLE, ORDER_STATUS_LABEL,
  HELP_CATEGORIES, DONUT_PRIORITY_COLORS, DONUT_DISPUTE_COLORS, PAGE_SIZE
} from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";


export default // ─── Orders Section ───────────────────────────────────────────────────────────

function OrdersSection({ token }) {
  const [searchType, setSearchType] = useState("orderId");
  const [showSearchType, setShowSearchType] = useState(false);
  const [closingSearchType, setClosingSearchType] = useState(false);
  const searchDropdownRef = useRef(null);

  const closeSearchDropdown = () => {
    setClosingSearchType(true);
    setTimeout(() => {
      setShowSearchType(false);
      setClosingSearchType(false);
    }, 140);
  };

  const toggleSearchDropdown = () => {
    if (showSearchType) {
      closeSearchDropdown();
    } else {
      setShowSearchType(true);
    }
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target)) {
        setShowSearchType((prev) => {
          if (prev) {
            setClosingSearchType(true);
            setTimeout(() => {
              setShowSearchType(false);
              setClosingSearchType(false);
            }, 140);
          }
          return prev;
        });
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchTypeLabels = {
    orderId: "รหัสคำสั่งซื้อ (Order)",
    buyerId: "รหัสผู้ซื้อ (Buyer)",
    sellerId: "รหัสผู้ขาย (Seller)"
  };
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
      const data = await apiFetch(`/api/orders/support/search?${params}`, { token });
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`animate-fade-in-up flex flex-col ${!searched ? "items-center justify-center min-h-[40vh] pt-10 text-center" : ""}`}>
      
      {!searched && (
        <div className="mb-8 animate-in zoom-in-95 duration-500">
          <span className="material-symbols-outlined text-[64px] text-emerald-600 mb-2 drop-shadow-sm">manage_search</span>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">ศูนย์กลางค้นหาออเดอร์</h2>
          <p className="mt-2 text-sm font-medium text-slate-500">พิมพ์รหัส Order, Buyer, หรือ Seller เพื่อตรวจสอบประวัติการซื้อขาย</p>
        </div>
      )}

      <div className={`w-full transition-all duration-500 ease-out ${searched ? "max-w-4xl mb-6" : "max-w-2xl"}`}>
        <form
          onSubmit={handleSearch}
          className="relative flex w-full items-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.06)] transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 hover:border-slate-300"
        >
          <div className="relative border-r border-slate-200 bg-slate-50/50 rounded-l-lg" ref={searchDropdownRef}>
            <button
              type="button"
              onClick={toggleSearchDropdown}
              className="flex items-center justify-between w-48 bg-transparent py-2.5 pl-4 pr-3 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-100 transition-colors"
            >
              <span className="truncate">{searchTypeLabels[searchType]}</span>
              <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0">
                expand_more
              </span>
            </button>
            {(showSearchType || closingSearchType) && (
              <div className={`absolute top-full left-0 mt-2 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-20 ${closingSearchType ? "animate-dropdown-out" : "animate-dropdown-in"}`}>
                {Object.entries(searchTypeLabels).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setSearchType(val); closeSearchDropdown(); }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      searchType === val ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-1 items-center px-3">
            <span className="material-symbols-outlined mr-2 text-[20px] text-slate-400">search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์รหัสที่ต้องการค้นหา..."
              className="w-full border-0 bg-transparent py-2.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {searched && !loading && items.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <span className="material-symbols-outlined text-[40px] text-slate-300 mb-2">search_off</span>
          <p className="text-sm font-semibold text-slate-600">ไม่พบคำสั่งซื้อที่ตรงกับเงื่อนไข</p>
          <p className="mt-1 text-xs text-slate-400">หมายเหตุ: การค้นหา Buyer/Seller ต้องใช้รหัสเต็ม (Full ID) ไม่ใช่รหัสย่อ 8 ตัวแรก</p>
        </div>
      )}
      <ul className="flex flex-col gap-3 max-w-4xl">
        {items.map((o) => (
          <li key={o.id} className="group rounded-xl border border-slate-200/60 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)] hover:shadow-md hover:border-slate-300 transition-all duration-200">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">{o.productTitle}</p>
              <Badge
                text={ORDER_STATUS_LABEL[o.status] || o.status}
                style={o.status === "disputed" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium text-slate-500">
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-400">receipt_long</span> Order {o.id.slice(0, 8)}</span>
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-400">payments</span> ฿{o.price?.toLocaleString("th-TH")}</span>
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-400">person</span> Buyer {o.buyerId?.slice(0, 8)}</span>
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-400">storefront</span> Seller {o.sellerId?.slice(0, 8)}</span>
            </div>
            {o.status === "disputed" && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <Link
                  href={`/support/cases/${o.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold tracking-wide text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                  ดูข้อพิพาทของออเดอร์นี้
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
