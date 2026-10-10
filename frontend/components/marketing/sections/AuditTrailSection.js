"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "../../ui/Button";
import Modal from "../../ui/Modal";
import EmptyState from "../../ui/EmptyState";
import ErrorState from "../../ui/ErrorState";
import { getMarketingAuditLogs } from "../../../lib/api";

const ACTION_OPTIONS = [
  { value: "", label: "ทุกการดำเนินงาน (All Actions)" },
  // Campaign
  { value: "CAMPAIGN_CREATE", label: "แคมเปญ: สร้างร่าง (CAMPAIGN_CREATE)" },
  { value: "CAMPAIGN_UPDATE", label: "แคมเปญ: แก้ไขข้อมูล (CAMPAIGN_UPDATE)" },
  { value: "CAMPAIGN_SUBMIT", label: "แคมเปญ: ส่งขออนุมัติ (CAMPAIGN_SUBMIT)" },
  { value: "CAMPAIGN_APPROVE", label: "แคมเปญ: อนุมัติ (CAMPAIGN_APPROVE)" },
  { value: "CAMPAIGN_REJECT", label: "แคมเปญ: ปฏิเสธ (CAMPAIGN_REJECT)" },
  { value: "CAMPAIGN_PUBLISH", label: "แคมเปญ: เผยแพร่ (CAMPAIGN_PUBLISH)" },
  { value: "CAMPAIGN_END", label: "แคมเปญ: สิ้นสุด (CAMPAIGN_END)" },
  // Auction
  {
    value: "AUCTION_ROUND_CREATE",
    label: "ประมูล: สร้างรอบ (AUCTION_ROUND_CREATE)",
  },
  {
    value: "AUCTION_ITEM_APPROVE",
    label: "ประมูล: อนุมัติสินค้า (AUCTION_ITEM_APPROVE)",
  },
  {
    value: "AUCTION_ITEM_REJECT",
    label: "ประมูล: ปฏิเสธสินค้า (AUCTION_ITEM_REJECT)",
  },
  {
    value: "AUCTION_ITEM_SCHEDULE",
    label: "ประมูล: กำหนดเวลา (AUCTION_ITEM_SCHEDULE)",
  },
  {
    value: "AUCTION_ITEM_CANCEL",
    label: "ประมูล: ยกเลิก (AUCTION_ITEM_CANCEL)",
  },
  { value: "AUCTION_ITEM_CLOSE", label: "ประมูล: ปิดรอบ (AUCTION_ITEM_CLOSE)" },
  // Article
  { value: "ARTICLE_CREATE", label: "บทความ: สร้างบทความ (ARTICLE_CREATE)" },
  { value: "ARTICLE_UPDATE", label: "บทความ: แก้ไขเนื้อหา (ARTICLE_UPDATE)" },
  {
    value: "ARTICLE_PUBLISH",
    label: "บทความ: เผยแพร่บทความ (ARTICLE_PUBLISH)",
  },
  { value: "ARTICLE_ARCHIVE", label: "บทความ: เก็บถาวร (ARTICLE_ARCHIVE)" },
  { value: "ARTICLE_DELETE", label: "บทความ: ลบบทความ (ARTICLE_DELETE)" },
];

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "ทุกประเภท (All Entities)" },
  { value: "CAMPAIGN", label: "แคมเปญ (CAMPAIGN)" },
  { value: "AUCTION_ROUND", label: "รอบประมูล (AUCTION_ROUND)" },
  { value: "AUCTION_ITEM", label: "สินค้าประมูล (AUCTION_ITEM)" },
  { value: "ARTICLE", label: "บทความ (ARTICLE)" },
];

const ACTION_BADGES = {
  // Campaign
  CAMPAIGN_CREATE: "bg-blue-50 text-blue-700 border-blue-200",
  CAMPAIGN_UPDATE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  CAMPAIGN_SUBMIT: "bg-amber-50 text-amber-700 border-amber-200",
  CAMPAIGN_APPROVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CAMPAIGN_REJECT: "bg-rose-50 text-rose-700 border-rose-200",
  CAMPAIGN_PUBLISH: "bg-teal-50 text-teal-700 border-teal-200",
  CAMPAIGN_END: "bg-slate-100 text-slate-700 border-slate-300",
  // Auction
  AUCTION_ROUND_CREATE: "bg-purple-50 text-purple-700 border-purple-200",
  AUCTION_ITEM_APPROVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  AUCTION_ITEM_REJECT: "bg-rose-50 text-rose-700 border-rose-200",
  AUCTION_ITEM_SCHEDULE: "bg-cyan-50 text-cyan-700 border-cyan-200",
  AUCTION_ITEM_CANCEL: "bg-red-50 text-red-700 border-red-200",
  AUCTION_ITEM_CLOSE: "bg-gray-100 text-gray-700 border-gray-300",
  // Article
  ARTICLE_CREATE: "bg-blue-50 text-blue-700 border-blue-200",
  ARTICLE_UPDATE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  ARTICLE_PUBLISH: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ARTICLE_ARCHIVE: "bg-amber-50 text-amber-700 border-amber-200",
  ARTICLE_DELETE: "bg-red-50 text-red-700 border-red-200",
};

export function convertAuditDateFilter(fromDateStr, toDateStr) {
  if (!fromDateStr && !toDateStr) return { from: undefined, to: undefined };

  if (fromDateStr && toDateStr && fromDateStr > toDateStr) {
    throw new Error("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
  }

  let from;
  let to;

  if (fromDateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDateStr)) {
      throw new Error("รูปแบบวันที่เริ่มต้นไม่ถูกต้อง");
    }
    from = `${fromDateStr}T00:00:00+07:00`;
  }

  if (toDateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDateStr)) {
      throw new Error("รูปแบบวันที่สิ้นสุดไม่ถูกต้อง");
    }
    const [year, month, day] = toDateStr.split("-").map(Number);
    const nextDate = new Date(Date.UTC(year, month - 1, day));
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextY = nextDate.getUTCFullYear();
    const nextM = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
    const nextD = String(nextDate.getUTCDate()).padStart(2, "0");
    to = `${nextY}-${nextM}-${nextD}T00:00:00+07:00`;
  }

  return { from, to };
}

export default function AuditTrailSection({ token }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters state
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [actorIdFilter, setActorIdFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");

  // Detail Modal state
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(
    async (pageToLoad = 1) => {
      setLoading(true);
      setError("");

      try {
        const params = {
          page: pageToLoad,
          limit: 20,
        };
        if (actionFilter) params.action = actionFilter;
        if (entityTypeFilter) params.entityType = entityTypeFilter;
        if (actorIdFilter.trim()) params.actorId = actorIdFilter.trim();
        if (fromDateFilter || toDateFilter) {
          try {
            const range = convertAuditDateFilter(fromDateFilter, toDateFilter);
            if (range.from) params.from = range.from;
            if (range.to) params.to = range.to;
          } catch (dateErr) {
            setError(dateErr.message);
            setLoading(false);
            return;
          }
        }

        const res = await getMarketingAuditLogs(params, token);
        const items = res.items || res.data || [];
        setLogs(items);
        setTotal(res.total || 0);
        setPage(res.page || pageToLoad);
        setTotalPages(res.totalPages || 1);
      } catch (err) {
        setError(err.message || "ไม่สามารถโหลดประวัติการดำเนินงานได้");
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [
      token,
      actionFilter,
      entityTypeFilter,
      actorIdFilter,
      fromDateFilter,
      toDateFilter,
    ],
  );

  useEffect(() => {
    fetchLogs(page);
  }, [fetchLogs, page]);

  function handleFilterSubmit(e) {
    e.preventDefault();
    if (fromDateFilter && toDateFilter && fromDateFilter > toDateFilter) {
      setError("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
      return;
    }
    setPage(1);
    fetchLogs(1);
  }

  function handleResetFilters() {
    setActionFilter("");
    setEntityTypeFilter("");
    setActorIdFilter("");
    setFromDateFilter("");
    setToDateFilter("");
    setPage(1);
  }

  function formatTimestamp(isoString) {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          ประวัติการดำเนินงาน (Marketing Audit Trail)
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          บันทึกตรวจสอบการเปลี่ยนแปลงข้อมูลแบบ Append-Only สำหรับแคมเปญการตลาด,
          ตารางประมูล และบทความ
        </p>
      </div>

      {/* Filter Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm">
        <form
          onSubmit={handleFilterSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
        >
          <div>
            <label
              htmlFor="actionFilter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              คำสั่ง (Action)
            </label>
            <select
              id="actionFilter"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="entityTypeFilter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              ประเภท (Entity Type)
            </label>
            <select
              id="entityTypeFilter"
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {ENTITY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="actorIdFilter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              ผู้กระทำ (Actor ID)
            </label>
            <input
              id="actorIdFilter"
              type="text"
              placeholder="e.g. SYSTEM หรือ user id"
              value={actorIdFilter}
              onChange={(e) => setActorIdFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label
              htmlFor="fromDateFilter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              ตั้งแต่วันที่ (From)
            </label>
            <input
              id="fromDateFilter"
              type="date"
              value={fromDateFilter}
              onChange={(e) => setFromDateFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label
              htmlFor="toDateFilter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              ถึงวันที่ (To)
            </label>
            <input
              id="toDateFilter"
              type="date"
              value={toDateFilter}
              onChange={(e) => setToDateFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-5 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleResetFilters}
            >
              ล้างตัวกรอง
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              icon="search"
              disabled={loading}
            >
              กรองข้อมูล
            </Button>
          </div>
        </form>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          <span className="material-symbols-outlined animate-spin text-3xl text-violet-600 mb-2">
            progress_activity
          </span>
          <p className="text-sm">กำลังโหลดประวัติการดำเนินงาน...</p>
        </div>
      ) : error ? (
        <ErrorState
          title="โหลดประวัติการดำเนินงานไม่สำเร็จ"
          detail={error}
          onRetry={() => fetchLogs(page)}
        />
      ) : logs.length === 0 ? (
        <EmptyState
          icon="history"
          title="ไม่พบประวัติการดำเนินงาน"
          description="ไม่พบรายการบันทึกที่ตรงตามเงื่อนไขตัวกรองที่คุณกำหนด"
          action={
            <Button variant="secondary" size="sm" onClick={handleResetFilters}>
              รีเซ็ตตัวกรองทั้งหมด
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Table Container */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-700 font-semibold">
                    <th className="py-3 px-4 whitespace-nowrap">
                      วันและเวลา (BKK)
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap">
                      ผู้ดำเนินการ (Actor)
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap">
                      บทบาท (Role)
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap">
                      การกระทำ (Action)
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap">ประเภท</th>
                    <th className="py-3 px-4 whitespace-nowrap">
                      รหัสเป้าหมาย (ID)
                    </th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">
                      รายละเอียด
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {logs.map((log) => {
                    const isSystem = log.actorId === "SYSTEM";
                    const badgeClass =
                      ACTION_BADGES[log.action] ||
                      "bg-slate-100 text-slate-700 border-slate-200";

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="py-3 px-4 whitespace-nowrap text-slate-800 font-mono text-[11px]">
                          {formatTimestamp(log.createdAt)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-medium">
                          {isSystem ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                              <span className="material-symbols-outlined text-[13px]">
                                smart_toy
                              </span>
                              ระบบอัตโนมัติ (SYSTEM)
                            </span>
                          ) : (
                            <span className="text-slate-900 font-mono text-[11px]">
                              {log.actorId}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 tracking-wider">
                            {log.actorRole}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold border ${badgeClass}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-700 font-medium">
                          {log.entityType}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px] max-w-[140px] truncate">
                          {log.entityId}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => setSelectedLog(log)}
                          >
                            ดูรายละเอียด
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-600">
              <div>
                <span>
                  ทั้งหมด <span className="font-semibold">{total}</span> รายการ
                </span>
                <span className="mx-2">·</span>
                <span>
                  หน้า <span className="font-semibold">{page}</span> จาก{" "}
                  <span className="font-semibold">{totalPages}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <Modal
          open={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title="รายละเอียดบันทึกการดำเนินงาน (Audit Detail)"
          size="lg"
          footer={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedLog(null)}
            >
              ปิดหน้าต่าง
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  Audit ID
                </span>
                <span className="font-mono text-slate-800 break-all">
                  {selectedLog.id}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  Timestamp
                </span>
                <span className="text-slate-800 font-mono">
                  {formatTimestamp(selectedLog.createdAt)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  Action & Entity
                </span>
                <span className="font-semibold text-violet-700">
                  {selectedLog.action}
                </span>{" "}
                ({selectedLog.entityType}: {selectedLog.entityId})
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  Actor
                </span>
                <span className="text-slate-800">
                  {selectedLog.actorId === "SYSTEM"
                    ? "ระบบอัตโนมัติ (SYSTEM)"
                    : selectedLog.actorId}{" "}
                  [{selectedLog.actorRole}]
                </span>
              </div>
              {selectedLog.idempotencyKey && (
                <div className="sm:col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Idempotency Key
                  </span>
                  <span className="font-mono text-slate-700">
                    {selectedLog.idempotencyKey}
                  </span>
                </div>
              )}
            </div>

            {/* Previous State vs New State */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <h4 className="font-semibold text-slate-700 mb-1">
                  สถานะก่อนหน้า (Previous State)
                </h4>
                <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 text-slate-100 font-mono text-[11px] overflow-auto max-h-60">
                  {selectedLog.previousState ? (
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.previousState, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-slate-500 italic">
                      (ไม่มีข้อมูลก่อนหน้า / สร้างใหม่)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-1">
                  สถานะใหม่ (New State)
                </h4>
                <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 text-slate-100 font-mono text-[11px] overflow-auto max-h-60">
                  {selectedLog.newState ? (
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.newState, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-slate-500 italic">
                      (ไม่มีข้อมูลใหม่ / ถูกลบออก)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Metadata if present */}
            {selectedLog.metadata && (
              <div>
                <h4 className="font-semibold text-slate-700 mb-1">
                  ข้อมูลเพิ่มเติม (Metadata)
                </h4>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800 font-mono text-[11px] overflow-auto max-h-40">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
