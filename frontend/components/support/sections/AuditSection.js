"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import Pagination from "../../Pagination";
import Badge from "../../panel/ui/Badge";
import DropdownFilter from "../../panel/ui/DropdownFilter";

const ACTION_OPTIONS = [
  { value: "", label: "ทุกคำสั่ง (ALL ACTIONS)" },
  { value: "USER_SUSPENDED", label: "ระงับบัญชี (USER_SUSPENDED)" },
  { value: "WARN_USER", label: "ตักเตือนผู้ใช้ (WARN_USER)" },
  { value: "USER_RESTORED", label: "ปลดระงับบัญชี (USER_RESTORED)" },
  { value: "KYC_APPROVED", label: "อนุมัติ KYC (KYC_APPROVED)" },
  { value: "KYC_REJECTED", label: "ปฏิเสธ KYC (KYC_REJECTED)" },
  { value: "PRODUCT_REMOVED", label: "ระงับสินค้า (PRODUCT_REMOVED)" },
  { value: "PRODUCT_RESTORED", label: "กู้คืนสินค้า (PRODUCT_RESTORED)" },
];

const ACTION_STYLE = {
  USER_SUSPENDED: "bg-red-50 text-red-700 border border-red-200",
  KYC_REJECTED: "bg-red-50 text-red-700 border border-red-200",
  PRODUCT_REMOVED: "bg-red-50 text-red-700 border border-red-200",
  WARN_USER: "bg-amber-50 text-amber-700 border border-amber-200",
  KYC_APPROVED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  USER_RESTORED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  PRODUCT_RESTORED: "bg-sky-50 text-sky-700 border border-sky-200",
};

const PAGE_SIZE = 15;

export default function AuditSection({ token }) {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [searchTarget, setSearchTarget] = useState("");

  function load() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (actionFilter) params.set("action", actionFilter);
    if (searchTarget.trim()) params.set("targetId", searchTarget.trim());

    apiFetch(`/api/auth/admin/audit?${params}`, { token })
      .then((data) => {
        setEntries(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => {
        setError(err.message);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [page, actionFilter]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  return (
    <div className="animate-fade-in-up flex flex-col min-h-full">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Audit Log ของ Trust & Safety
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            บันทึกประวัติการตรวจสอบและลงโทษทั้งหมด {total} รายการ (Append-Only)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={searchTarget}
              onChange={(e) => setSearchTarget(e.target.value)}
              placeholder="ค้นหา Target ID..."
              className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-900"
            >
              ค้นหา
            </button>
          </form>

          <DropdownFilter
            value={actionFilter}
            onChange={(val) => {
              setActionFilter(val);
              setPage(1);
            }}
            options={ACTION_OPTIONS}
            align="right"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <p className="text-sm font-medium text-slate-500">กำลังโหลดประวัติ Audit Log...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-slate-400 mb-2">
            receipt_long
          </span>
          <p className="text-sm font-semibold text-slate-700">
            ไม่มี Audit Log ที่ตรงกับเงื่อนไข
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ลองล้างคำค้นหาหรือเลือกประเภท Action อื่น
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[800px] border-collapse text-left text-xs text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="p-3.5 font-bold text-slate-600">เวลาที่บันทึก</th>
                <th className="p-3.5 font-bold text-slate-600">
                  ผู้ดำเนินการ (Staff ID)
                </th>
                <th className="p-3.5 font-bold text-slate-600">การดำเนินการ (Action)</th>
                <th className="p-3.5 font-bold text-slate-600">เป้าหมาย (Target ID)</th>
                <th className="p-3.5 font-bold text-slate-600">เหตุผล / บันทึก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((log) => {
                const actor = log.actorId || log.adminId || "—";
                const target = log.targetId || log.targetUserId || log.targetProductId || "—";
                const badgeStyle =
                  ACTION_STYLE[log.action] || "bg-slate-100 text-slate-700";

                return (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="p-3.5 whitespace-nowrap text-slate-500 font-medium">
                      {new Date(log.createdAt).toLocaleString("th-TH")}
                    </td>
                    <td className="p-3.5 font-mono text-slate-700 font-semibold">
                      {actor.length > 12 ? `${actor.slice(0, 10)}...` : actor}
                    </td>
                    <td className="p-3.5">
                      <Badge text={log.action} style={badgeStyle} />
                    </td>
                    <td className="p-3.5 font-mono text-slate-800 font-semibold">
                      {target.length > 16 ? `${target.slice(0, 14)}...` : target}
                    </td>
                    <td className="p-3.5 max-w-xs truncate text-slate-600 font-medium" title={log.reason}>
                      {log.reason || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
