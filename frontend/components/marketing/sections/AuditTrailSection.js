"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "../../ui/Button";
import Modal from "../../ui/Modal";
import EmptyState from "../../ui/EmptyState";
import ErrorState from "../../ui/ErrorState";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import { getMarketingAuditLogs } from "../../../lib/api";
import { MARKETING_PAGE_SIZE } from "../marketingConstants";
import MarketingPagination from "./MarketingPagination";

const ACTION_OPTIONS = [
  { value: "AUCTION_ROUND_UPDATE", label: "ประมูล: แก้ไขเวลารอบ (AUCTION_ROUND_UPDATE)" },
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
  AUCTION_ROUND_UPDATE: "bg-purple-50 text-purple-700 border-purple-200",
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

const ACTION_LABELS_THAI = {
  AUCTION_ROUND_UPDATE: "แก้ไขเวลารอบประมูล",
  CAMPAIGN_CREATE: "สร้างแคมเปญใหม่ (ร่าง)",
  CAMPAIGN_UPDATE: "แก้ไขข้อมูลแคมเปญ",
  CAMPAIGN_SUBMIT: "ส่งแคมเปญขออนุมัติ",
  CAMPAIGN_APPROVE: "อนุมัติแคมเปญ",
  CAMPAIGN_REJECT: "ปฏิเสธแคมเปญ",
  CAMPAIGN_PUBLISH: "เผยแพร่แคมเปญ",
  CAMPAIGN_END: "สิ้นสุดแคมเปญ",
  AUCTION_ROUND_CREATE: "สร้างรอบประมูลใหม่",
  AUCTION_ROUND_CANCEL: "ยกเลิกรอบประมูล",
  AUCTION_ITEM_APPROVE: "อนุมัติสินค้าประมูล",
  AUCTION_ITEM_REJECT: "ปฏิเสธสินค้าประมูล",
  AUCTION_ITEM_SCHEDULE: "กำหนดเวลารอบประมูล",
  AUCTION_ITEM_CANCEL: "ยกเลิกสินค้าประมูล",
  AUCTION_ITEM_CLOSE: "ปิดรอบการประมูล",
  ARTICLE_CREATE: "สร้างบทความใหม่ (ร่าง)",
  ARTICLE_UPDATE: "แก้ไขเนื้อหาบทความ",
  ARTICLE_PUBLISH: "เผยแพร่บทความ",
  ARTICLE_ARCHIVE: "เก็บถาวรบทความ",
  ARTICLE_DELETE: "ลบบทความ",
};

const ENTITY_LABELS_THAI = {
  CAMPAIGN: "แคมเปญและคูปอง",
  AUCTION_ROUND: "รอบการประมูล",
  AUCTION_ITEM: "สินค้าประมูล",
  ARTICLE: "บทความ",
};

const ROLE_LABELS_THAI = {
  MARKETING: "ฝ่ายการตลาด",
  ADMIN: "ผู้ดูแลระบบ",
  SYSTEM: "ระบบอัตโนมัติ",
  SELLER: "ผู้ขาย",
  BUYER: "ผู้ซื้อ",
  CUSTOMER_SERVICE: "ฝ่ายบริการลูกค้า",
  TRUST_AND_SAFETY: "ฝ่ายตรวจสอบความปลอดภัย",
};

const FIELD_TRANSLATIONS = {
  auctionStartsAt: "วันเวลาเริ่มประมูลของรอบ",
  auctionEndsAt: "วันเวลาปิดประมูลของรอบ",
  maxItems: "จำนวนสินค้าสูงสุดต่อรอบ",
  softCloseEndsAt: "เวลาปิดที่ต่อจากการเสนอราคา",
  id: "รหัสรายการ (ID)",
  name: "ชื่อรายการ",
  title: "หัวข้อ / ชื่อ",
  code: "รหัสโค้ดคูปอง",
  description: "คำอธิบาย / รายละเอียด",
  summary: "บทคัดย่อ / สรุปย่อ",
  content: "เนื้อหาบทความ",
  category: "หมวดหมู่",
  status: "สถานะ",
  discountType: "ประเภทส่วนลด",
  discountValue: "มูลค่าส่วนลด",
  minSpend: "ยอดซื้อขั้นต่ำ",
  maxDiscount: "ส่วนลดสูงสุด",
  budget: "งบประมาณแคมเปญ",
  totalQuota: "โควตารวมทั้งหมด",
  userQuota: "โควตาต่อผู้ใช้",
  targetSegment: "กลุ่มเป้าหมาย",
  startsAt: "วันเวลาเริ่มต้น",
  endsAt: "วันเวลาสิ้นสุด",
  coverImage: "รูปภาพหน้าปก",
  authorId: "รหัสผู้เขียน",
  authorName: "ชื่อผู้เขียน",
  startingPrice: "ราคาเริ่มต้น",
  stepPrice: "ขั้นราคาเสนอ",
  currentPrice: "ราคาปัจจุบัน",
  reservePrice: "ราคาขั้นต่ำที่ยอมรับ",
  scheduledStartAt: "วันเวลาเริ่มประมูล",
  scheduledEndAt: "วันเวลาสิ้นสุดประมูล",
  submissionStartsAt: "วันเริ่มรับสินค้า",
  submissionEndsAt: "วันปิดรับสินค้า",
  reason: "เหตุผล / หมายเหตุ",
  comment: "ความคิดเห็น",
  tags: "ป้ายกำกับ (Tags)",
  condition: "สภาพสินค้า",
  productId: "รหัสสินค้า",
  sellerId: "รหัสผู้ขาย",
  roundId: "รหัสรอบประมูล",
  searchText: "ข้อความสำหรับค้นหา",
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

function formatBangkokTimestamp(isoString) {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
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
    return String(isoString);
  }
}

/**
 * Expandable text viewer for long content like article body or long descriptions.
 */
function ExpandableText({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="text-slate-400 italic">-</span>;
  const str = String(text);

  if (str.length <= 120) {
    return <span className="whitespace-pre-wrap break-words">{str}</span>;
  }

  return (
    <div className="space-y-1.5">
      <div
        className={`whitespace-pre-wrap break-words ${
          !expanded
            ? "line-clamp-2 text-slate-700"
            : "max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-800 text-[11px] leading-relaxed"
        }`}
      >
        {expanded ? str : str.slice(0, 120) + "..."}
      </div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 transition-colors"
      >
        <span className="material-symbols-outlined text-[14px]">
          {expanded ? "expand_less" : "expand_more"}
        </span>
        {expanded ? "ย่อข้อความ" : "ขยายอ่านเพิ่มเติม"}
      </button>
    </div>
  );
}

const ENUM_LABELS_THAI = {
  PERCENT: "ลดเป็นเปอร์เซ็นต์ (%)",
  FIXED: "ลดเป็นจำนวนเงินคงที่ (บาท)",
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "กำหนดเวลาแล้ว",
  ACTIVE: "ใช้งานอยู่",
  PUBLISHED: "เผยแพร่แล้ว",
  EXPIRED: "หมดอายุ",
  ARCHIVED: "เก็บถาวร",
  DELETED: "ลบแล้ว",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ปฏิเสธ",
  PENDING: "รอดำเนินการ",
  CANCELLED: "ยกเลิกแล้ว",
  CLOSED: "ปิดการประมูลแล้ว",
  ALL: "ทั้งหมด / ทั่วไป",
  NEW_USERS: "ผู้ใช้ใหม่",
  ACTIVE_BUYERS: "ผู้ซื้อประจำ",
  INACTIVE_BUYERS: "ผู้ใช้ที่ไม่ได้ใช้งานนาน",
  HIGH_SPENDERS: "ผู้มียอดซื้อสูง",
};

/**
 * Formats a value for human-readable diff presentation.
 * Handles null, boolean, array of primitives/objects, dates, discountType/currency, and nested objects cleanly.
 * Never outputs raw JSON or [object Object].
 */
export function renderDiffValue(key, value, contextObj = null) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400 italic font-normal">-</span>;
  }

  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        ใช่ / เปิดใช้งาน
      </span>
    ) : (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
        ไม่ใช่ / ปิดใช้งาน
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span className="text-slate-400 italic font-normal">
          (ไม่มีรายการ / ว่าง)
        </span>
      );
    }

    const hasObjects = value.some((item) => typeof item === "object" && item !== null);

    if (hasObjects) {
      return (
        <div className="space-y-1.5 w-full">
          {value.map((item, idx) => (
            <div
              key={idx}
              className="rounded border border-slate-200/90 bg-slate-50/80 p-2 text-[11px] space-y-1"
            >
              {typeof item === "object" && item !== null ? (
                Object.entries(item).map(([subK, subV]) => (
                  <div key={subK} className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-medium text-slate-600">
                      {FIELD_TRANSLATIONS[subK] || subK}:
                    </span>
                    <div className="inline-block text-slate-800">
                      {renderDiffValue(subK, subV, item)}
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-slate-800">
                  {renderDiffValue(key, item, contextObj)}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-1">
        {value.map((item, idx) => (
          <span
            key={idx}
            className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
          >
            {typeof item === "number"
              ? renderDiffValue(key, item, contextObj)
              : typeof item === "boolean"
                ? item
                  ? "ใช่ / เปิดใช้งาน"
                  : "ไม่ใช่ / ปิดใช้งาน"
                : ENUM_LABELS_THAI[String(item)] || String(item)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof value === "string") {
    // Check if ISO date string
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return (
        <span className="font-mono text-slate-800">
          {formatBangkokTimestamp(value)}
        </span>
      );
    }

    if (
      key === "content" ||
      key === "description" ||
      key === "summary" ||
      value.length > 120
    ) {
      return <ExpandableText text={value} />;
    }

    if (key === "discountType") {
      return (
        <span className="font-semibold text-slate-800">
          {ENUM_LABELS_THAI[value] || value}
        </span>
      );
    }

    return (
      <span className="break-words text-slate-800">
        {ENUM_LABELS_THAI[value] || value}
      </span>
    );
  }

  if (typeof value === "number") {
    // Handle discount values: respect discountType of context (PERCENT -> %, FIXED -> ฿)
    if (key === "discountValue" || /discountValue$/i.test(key)) {
      const type = contextObj?.discountType;
      if (type === "PERCENT") {
        return (
          <span className="font-semibold text-slate-900">
            {value}%
          </span>
        );
      }
      if (type === "FIXED") {
        return (
          <span className="font-semibold text-slate-900">
            ฿{value.toLocaleString("th-TH")}
          </span>
        );
      }
      // No confirmed type: display plain number without guessing unit
      return <span className="font-mono text-slate-900">{value}</span>;
    }

    // Known monetary amounts: display THB (฿)
    const isCurrencyField =
      /price|budget|spend|amount|maxDiscount|minSpend/i.test(key) &&
      !/quota|count|percent/i.test(key);
    if (isCurrencyField) {
      return (
        <span className="font-semibold text-slate-900">
          ฿{value.toLocaleString("th-TH")}
        </span>
      );
    }

    return <span className="font-mono text-slate-900">{value}</span>;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="text-slate-400 italic font-normal">-</span>;
    }
    return (
      <div className="space-y-1 rounded border border-slate-200 bg-slate-50/70 p-2 text-[11px] w-full">
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-medium text-slate-600">
              {FIELD_TRANSLATIONS[k] || k}:
            </span>
            <div className="inline-block text-slate-800">
              {renderDiffValue(k, v, value)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-slate-800">{String(value)}</span>;
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
          limit: MARKETING_PAGE_SIZE,
        };
        if (actionFilter) params.action = actionFilter;
        if (entityTypeFilter) params.entityType = entityTypeFilter;
        if (actorIdFilter.trim()) {
          const qVal = actorIdFilter.trim();
          params.actorQuery = qVal;
          params.q = qVal;
        }
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
        const newTotal = res.total || 0;
        const newTotalPages =
          res.totalPages ||
          Math.max(1, Math.ceil(newTotal / MARKETING_PAGE_SIZE));

        if (pageToLoad > newTotalPages && newTotalPages > 0) {
          setPage(newTotalPages);
          return;
        }

        setLogs(items);
        setTotal(newTotal);
        setPage(res.page || pageToLoad);
        setTotalPages(newTotalPages);
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
    if (e && e.preventDefault) e.preventDefault();
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

  function computeStateDiff(previousState, newState) {
    const prev = previousState || {};
    const next = newState || {};
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

    const rows = [];
    for (const key of allKeys) {
      const prevVal = prev[key];
      const nextVal = next[key];
      const isChanged = JSON.stringify(prevVal) !== JSON.stringify(nextVal);
      rows.push({
        key,
        label: FIELD_TRANSLATIONS[key] || key,
        prevVal,
        nextVal,
        isChanged,
      });
    }

    // Sort: changed fields first, then alphabetical
    rows.sort((a, b) => {
      if (a.isChanged && !b.isChanged) return -1;
      if (!a.isChanged && b.isChanged) return 1;
      return a.key.localeCompare(b.key);
    });

    return rows;
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
            <DropdownFilter
              id="actionFilter"
              value={actionFilter}
              onChange={(val) => {
                setActionFilter(val);
                setPage(1);
              }}
              options={ACTION_OPTIONS}
              className="w-full"
              size="sm"
            />
          </div>

          <div>
            <label
              htmlFor="entityTypeFilter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              ประเภท (Entity Type)
            </label>
            <DropdownFilter
              id="entityTypeFilter"
              value={entityTypeFilter}
              onChange={(val) => {
                setEntityTypeFilter(val);
                setPage(1);
              }}
              options={ENTITY_TYPE_OPTIONS}
              className="w-full"
              size="sm"
            />
          </div>

          <div>
            <label
              htmlFor="actorIdFilter"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              ผู้ดำเนินการ (Operator)
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-[15px] text-slate-400 pointer-events-none">
                person_search
              </span>
              <input
                id="actorIdFilter"
                type="text"
                placeholder="ค้นหาชื่อหรือรหัสผู้ดำเนินการ"
                value={actorIdFilter}
                onChange={(e) => {
                  setActorIdFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
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
          description={
            actorIdFilter.trim()
              ? `ไม่พบรายการบันทึกที่ตรงกับคำค้นหา "${actorIdFilter.trim()}" หรือเงื่อนไขที่กำหนด`
              : "ไม่พบรายการบันทึกที่ตรงตามเงื่อนไขตัวกรองที่คุณกำหนด"
          }
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
              <table className="w-full table-fixed text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-700 font-semibold">
                    <th className="py-2.5 px-2 text-[11px] whitespace-nowrap w-[12%]">
                      วันและเวลา
                    </th>
                    <th className="py-2.5 px-2 text-[11px] whitespace-nowrap w-[16%]">
                      ผู้ดำเนินการ
                    </th>
                    <th className="py-2.5 px-1.5 text-[11px] whitespace-nowrap w-[11%]">
                      บทบาท
                    </th>
                    <th className="py-2.5 px-2 text-[11px] whitespace-nowrap w-[15%]">
                      การกระทำ
                    </th>
                    <th className="py-2.5 px-2 text-[11px] whitespace-nowrap w-[12%]">
                      ประเภท
                    </th>
                    <th className="py-2.5 px-2 text-[11px] whitespace-nowrap w-[20%]">
                      รายการที่เกี่ยวข้อง
                    </th>
                    <th className="py-2.5 px-2 text-right text-[11px] whitespace-nowrap w-[14%]">
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

                    // Operator display: prefer actorName, fallback to actorId
                    const operatorDisplayName = isSystem
                      ? "ระบบอัตโนมัติ (SYSTEM)"
                      : log.actorName || log.actorId;
                    const hasDistinctActorName =
                      !isSystem &&
                      log.actorName &&
                      log.actorName !== log.actorId;

                    // Related entity display: prefer entityName or snapshot name, fallback to entityId
                    const entityDisplayName =
                      log.entityName ||
                      log.newState?.name ||
                      log.previousState?.name ||
                      log.newState?.title ||
                      log.previousState?.title ||
                      log.entityId;
                    const hasDistinctEntityName =
                      entityDisplayName && entityDisplayName !== log.entityId;
                    const isRenamed =
                      log.previousEntityName &&
                      log.newEntityName &&
                      log.previousEntityName !== log.newEntityName;

                    const formattedTs = formatBangkokTimestamp(log.createdAt);
                    const tsParts = formattedTs.includes(" ")
                      ? [
                          formattedTs.slice(0, formattedTs.lastIndexOf(" ")),
                          formattedTs.slice(formattedTs.lastIndexOf(" ") + 1),
                        ]
                      : [formattedTs, ""];

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="py-2 px-2 text-slate-800">
                          <div className="font-mono text-[11px] leading-tight">
                            <span className="block whitespace-nowrap">
                              {tsParts[0]}
                            </span>
                            {tsParts[1] && (
                              <span className="block text-[10px] text-slate-400 whitespace-nowrap">
                                {tsParts[1]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 font-medium">
                          {isSystem ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200 whitespace-nowrap">
                              <span className="material-symbols-outlined text-[12px]">
                                smart_toy
                              </span>
                              ระบบอัตโนมัติ (SYSTEM)
                            </span>
                          ) : (
                            <div className="flex flex-col min-w-0">
                              <span
                                className="text-slate-900 font-medium truncate block text-xs"
                                title={operatorDisplayName}
                              >
                                {operatorDisplayName}
                              </span>
                              {hasDistinctActorName && (
                                <span
                                  className="text-[10px] text-slate-400 font-mono truncate block"
                                  title={log.actorId}
                                >
                                  {log.actorId}
                                  {log.isCurrentName && (
                                    <span className="ml-1 text-[9px] text-slate-400 font-sans">
                                      (ชื่อปัจจุบัน)
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-1.5 whitespace-nowrap">
                          <span className="inline-block rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600 tracking-wide whitespace-nowrap">
                            {ROLE_LABELS_THAI[log.actorRole] || log.actorRole}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`inline-block w-full max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-semibold border text-center whitespace-nowrap ${badgeClass}`}
                            title={ACTION_LABELS_THAI[log.action] || log.action}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-700 font-medium text-[11px] truncate">
                          <span
                            className="truncate block"
                            title={
                              ENTITY_LABELS_THAI[log.entityType] ||
                              log.entityType
                            }
                          >
                            {ENTITY_LABELS_THAI[log.entityType] ||
                              log.entityType}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex flex-col min-w-0">
                            <span
                              className="font-medium text-slate-900 truncate block text-xs"
                              title={entityDisplayName}
                            >
                              {entityDisplayName}
                            </span>
                            {hasDistinctEntityName && (
                              <span
                                className="text-[10px] text-slate-400 font-mono truncate block"
                                title={log.entityId}
                              >
                                {log.entityId}
                                {isRenamed && (
                                  <span className="ml-1 text-[9px] text-violet-600 font-sans font-medium">
                                    (เปลี่ยนชื่อ)
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-1 text-right whitespace-nowrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="!px-2 !py-0.5 !text-[11px] whitespace-nowrap"
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
            <MarketingPagination
              page={page}
              totalPages={totalPages}
              total={total}
              loading={loading}
              onPageChange={(p) => {
                setPage(p);
                fetchLogs(p);
              }}
            />
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
            {/* 1. Summary Overview Card */}
            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 to-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100/80 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded-md px-2.5 py-1 text-xs font-semibold border ${
                      ACTION_BADGES[selectedLog.action] ||
                      "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {selectedLog.action}
                  </span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {ACTION_LABELS_THAI[selectedLog.action] ||
                      selectedLog.action}
                  </span>
                </div>
                <span className="font-mono text-slate-500 text-[11px]">
                  {formatBangkokTimestamp(selectedLog.createdAt)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                <div>
                  <span className="text-[11px] text-slate-500 block">
                    รายการที่เกี่ยวข้อง:
                  </span>
                  <span className="text-slate-900 font-semibold text-sm">
                    {selectedLog.entityName || selectedLog.entityId}
                  </span>
                  <span className="text-slate-500 text-[11px] ml-1.5">
                    ({ENTITY_LABELS_THAI[selectedLog.entityType] ||
                      selectedLog.entityType})
                  </span>
                  {selectedLog.previousEntityName &&
                    selectedLog.newEntityName &&
                    selectedLog.previousEntityName !==
                      selectedLog.newEntityName && (
                      <div className="text-[11px] text-violet-700 mt-0.5">
                        <span className="text-slate-400">เปลี่ยนจาก: </span>
                        <span>{selectedLog.previousEntityName}</span>
                      </div>
                    )}
                </div>

                <div>
                  <span className="text-[11px] text-slate-500 block">
                    ผู้ดำเนินการ:
                  </span>
                  {selectedLog.actorId === "SYSTEM" ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                      <span className="material-symbols-outlined text-[14px]">
                        smart_toy
                      </span>
                      ระบบอัตโนมัติ (SYSTEM)
                    </span>
                  ) : (
                    <div>
                      <span className="text-slate-900 font-semibold">
                        {selectedLog.actorName || selectedLog.actorId}
                      </span>
                      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ml-1.5">
                        {ROLE_LABELS_THAI[selectedLog.actorRole] ||
                          selectedLog.actorRole}
                      </span>
                      {selectedLog.isCurrentName && (
                        <span className="text-[10px] text-slate-400 ml-1">
                          (ชื่อปัจจุบัน)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Metadata / Additional Note Card if present */}
            {selectedLog.metadata &&
              Object.keys(selectedLog.metadata).length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
                  <div className="flex items-center gap-1.5 text-amber-800 font-semibold mb-2">
                    <span className="material-symbols-outlined text-[16px]">
                      info
                    </span>
                    <span>ข้อมูลเพิ่มเติมและหมายเหตุ (Metadata)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {Object.entries(selectedLog.metadata).map(([k, v]) => (
                      <div
                        key={k}
                        className="rounded bg-white/80 p-2 border border-amber-100"
                      >
                        <span className="text-[10px] font-bold text-amber-900/70 block uppercase tracking-wider">
                          {FIELD_TRANSLATIONS[k] || k}
                        </span>
                        <div className="mt-0.5">
                          {renderDiffValue(k, v, selectedLog.metadata)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* 3. Field Changes Diff Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-violet-600">
                    difference
                  </span>
                  <span>ตารางเปรียบเทียบการเปลี่ยนแปลง (Field Changes)</span>
                </h4>
              </div>

              {(() => {
                const diffRows = computeStateDiff(
                  selectedLog.previousState,
                  selectedLog.newState,
                );

                if (diffRows.length === 0) {
                  return (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                      <span className="material-symbols-outlined text-2xl text-slate-400 mb-1">
                        checklist
                      </span>
                      <p className="text-xs">
                        ไม่มีบันทึกการเปลี่ยนแปลงฟิลด์ข้อมูลในสถานะก่อนหน้าและใหม่
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold z-10">
                          <tr>
                            <th className="py-2.5 px-3 w-1/3">ข้อมูล (Field)</th>
                            <th className="py-2.5 px-3 w-1/3">
                              ก่อนดำเนินการ (Before)
                            </th>
                            <th className="py-2.5 px-3 w-1/3">
                              หลังดำเนินการ (After)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {diffRows.map((row) => (
                            <tr
                              key={row.key}
                              className={
                                row.isChanged
                                  ? "bg-violet-50/25 hover:bg-violet-50/50 transition-colors"
                                  : "hover:bg-slate-50/50 transition-colors"
                              }
                            >
                              <td className="py-2.5 px-3 align-top">
                                <span className="font-semibold text-slate-800 block">
                                  {row.label}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {row.key}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 align-top text-slate-600">
                                {renderDiffValue(row.key, row.prevVal, selectedLog.previousState)}
                              </td>
                              <td className="py-2.5 px-3 align-top font-medium text-slate-900">
                                {renderDiffValue(row.key, row.nextVal, selectedLog.newState)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 4. System Reference Info Section at bottom */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[15px]">
                  terminal
                </span>
                <span>ข้อมูลอ้างอิงสำหรับการตรวจสอบ (System References)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="rounded bg-white p-2 border border-slate-200/70">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">
                    Audit Log ID
                  </span>
                  <span className="text-slate-800 break-all select-all">
                    {selectedLog.id}
                  </span>
                </div>
                <div className="rounded bg-white p-2 border border-slate-200/70">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">
                    Entity ID ({selectedLog.entityType})
                  </span>
                  <span className="text-slate-800 break-all select-all">
                    {selectedLog.entityId}
                  </span>
                </div>
                <div className="rounded bg-white p-2 border border-slate-200/70">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">
                    Operator ID ({selectedLog.actorRole})
                  </span>
                  <span className="text-slate-800 break-all select-all">
                    {selectedLog.actorId === "SYSTEM"
                      ? "SYSTEM (ระบบอัตโนมัติ)"
                      : `${selectedLog.actorName ? selectedLog.actorName + " : " : ""}${selectedLog.actorId}`}
                  </span>
                </div>
                {selectedLog.idempotencyKey && (
                  <div className="rounded bg-white p-2 border border-slate-200/70">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">
                      Idempotency Key
                    </span>
                    <span className="text-slate-700 break-all select-all">
                      {selectedLog.idempotencyKey}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
