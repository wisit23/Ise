"use client";
import { formatReferenceCode, formatReferenceText } from "../../../lib/referenceCodes";


import { useEffect, useState } from "react";
import config from "../../../lib/customerServiceConfig";
import { apiFetch } from "../../../lib/api";
import Pagination from "../../Pagination";
import Badge from "../../panel/ui/Badge";
import DropdownFilter from "../../panel/ui/DropdownFilter";

const SOURCES = [
  { value: "auth", label: "บัญชี / KYC / Report", owner: "บัญชีผู้ใช้" },
  { value: "holds", label: "Hold / Release", owner: "คำสั่งซื้อ" },
  { value: "disputes", label: "ข้อพิพาท / หลักฐาน", owner: "ข้อพิพาท" },
  { value: "support", label: "สถานะ Ticket", owner: "คำร้อง" },
];

const ACTION_OPTIONS = {
  auth: [
    ["", "ทุกคำสั่ง"],
    ["USER_WARNED", "ตักเตือนผู้ใช้"],
    ["USER_SUSPENDED", "ระงับบัญชี"],
    ["USER_RESTORED", "ปลดระงับบัญชี"],
    ["COMMERCE_RESTRICTED_BUYER", "เพิกถอนสิทธิ์ซื้อ"],
    ["COMMERCE_RESTRICTED_SELLER", "เพิกถอนสิทธิ์ขาย"],
    ["COMMERCE_RESTRICTED_ALL", "เพิกถอนสิทธิ์ซื้อขาย"],
    ["COMMERCE_RESTRICTION_REVOKED", "คืนสิทธิ์ซื้อขาย"],
    ["REPORT_REVIEWED", "รับ Report ตรวจสอบ"],
    ["REPORT_WARN_USER", "Report: ตักเตือน"],
    ["REPORT_SUSPEND_USER", "Report: ระงับบัญชี"],
    ["REPORT_REMOVE_PRODUCT", "Report: ระงับสินค้า"],
    ["REPORT_DISMISS", "Report: ยกคำร้อง"],
    ["KYC_VERIFIED", "อนุมัติ KYC"],
    ["KYC_REJECTED", "ปฏิเสธ KYC"],
    ["KYC_DOCUMENT_VIEWED", "เปิดเอกสาร KYC"],
    ["REMOVE_PRODUCT", "ระงับสินค้า"],
    ["RESTORE_PRODUCT", "กู้คืนสินค้า"],
  ],
  holds: [
    ["", "ทุกคำสั่ง"],
    ["HOLD", "พักเงิน"],
    ["RELEASE", "ปล่อยเงิน"],
    ["EVIDENCE_VIEWED", "เปิดหลักฐานเดิม"],
  ],
  disputes: [
    ["", "ทุกคำสั่ง"],
    ["OPEN", "เปิดข้อพิพาท"],
    ["CLAIM", "รับเคส"],
    ["REASSIGN", "เปลี่ยนผู้รับผิดชอบ"],
    ["ESCALATE", "ส่งต่อ"],
    ["VIEW_EVIDENCE", "เปิดไฟล์หลักฐาน"],
    ["EVIDENCE_MISSING", "ไม่พบไฟล์หลักฐาน"],
    ["VIEW_CHAT_HISTORY", "เปิดประวัติแชท"],
    ["VIEW_CHAT_ATTACHMENT", "เปิดไฟล์แนบแชท"],
    ["CHAT_HISTORY_UNAVAILABLE", "แชทไม่พร้อมใช้งาน"],
    ["CHAT_ATTACHMENT_UNAVAILABLE", "ไฟล์แนบแชทไม่พร้อมใช้งาน"],
    ["DECIDE", "ตัดสินเคส"],
  ],
  support: [
    ["", "ทุกคำสั่ง"],
    ["ASSIGN", "รับ Ticket"],
    ["STATUS_CHANGE", "เปลี่ยนสถานะ Ticket"],
    ["REPLY", "ตอบ Ticket"],
    ["JOIN", "เข้าร่วมบทสนทนา"],
    ["HANDOFF", "รับช่วงบทสนทนา"],
    ["ESCALATE", "ส่งต่อ"],
    ["SLA_BREACH", "เกินกำหนด SLA"],
  ],
};

const ACTION_STYLE = {
  USER_SUSPENDED: "bg-red-50 text-red-700 border border-red-200",
  REPORT_SUSPEND_USER: "bg-red-50 text-red-700 border border-red-200",
  REMOVE_PRODUCT: "bg-red-50 text-red-700 border border-red-200",
  HOLD: "bg-red-50 text-red-700 border border-red-200",
  USER_WARNED: "bg-amber-50 text-amber-700 border border-amber-200",
  COMMERCE_RESTRICTED_BUYER:
    "bg-amber-50 text-amber-700 border border-amber-200",
  COMMERCE_RESTRICTED_SELLER:
    "bg-amber-50 text-amber-700 border border-amber-200",
  COMMERCE_RESTRICTED_ALL: "bg-red-50 text-red-700 border border-red-200",
  VIEW_EVIDENCE: "bg-amber-50 text-amber-700 border border-amber-200",
  EVIDENCE_VIEWED: "bg-amber-50 text-amber-700 border border-amber-200",
  EVIDENCE_MISSING: "bg-red-50 text-red-700 border border-red-200",
  VIEW_CHAT_HISTORY: "bg-sky-50 text-sky-700 border border-sky-200",
  VIEW_CHAT_ATTACHMENT: "bg-sky-50 text-sky-700 border border-sky-200",
  CHAT_HISTORY_UNAVAILABLE: "bg-red-50 text-red-700 border border-red-200",
  CHAT_ATTACHMENT_UNAVAILABLE: "bg-red-50 text-red-700 border border-red-200",
  USER_RESTORED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  COMMERCE_RESTRICTION_REVOKED:
    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  RELEASE: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  DECIDE: "bg-sky-50 text-sky-700 border border-sky-200",
  STATUS_CHANGE: "bg-sky-50 text-sky-700 border border-sky-200",
};

const PAGE_SIZE = config.pagination.audit;

function endpointFor(source) {
  if (source === "auth") return "/api/auth/admin/audit";
  if (source === "support") return "/api/support/audit";
  return `/api/orders/support/audit?kind=${source}`;
}

function eventSourceLabel(log) {
  const action = log.action || "";
  if (log.source === "AUTH") {
    if (action.startsWith("KYC_")) return "ยืนยันตัวตนผู้ขาย (KYC)";
    if (action.startsWith("REPORT_")) return ({ SHOP: "รายงานร้านค้า", PRODUCT: "รายงานสินค้า", REVIEW: "รายงานรีวิว" })[log.reportType] || "รายงาน (ไม่พบประเภทต้นทาง)";
    if (action.startsWith("COMMERCE_")) return "สิทธิ์การซื้อขาย";
    if (action.startsWith("USER_")) return "บัญชีผู้ใช้";
    if (action.startsWith("PRODUCT_") || ["REMOVE_PRODUCT", "RESTORE_PRODUCT"].includes(action)) return "จัดการสินค้า";
    return "กิจกรรมดูแลระบบ (ไม่ระบุประเภท)";
  }
  if (log.source === "ORDER_HOLD") {
    if (action === "EVIDENCE_VIEWED") return "หลักฐานประกอบการพักเงิน";
    return action === "RELEASE" ? "ปล่อยเงินคำสั่งซื้อ" : "พักเงินคำสั่งซื้อ";
  }
  if (log.source === "ORDER_DISPUTE") {
    if (action.includes("CHAT")) return "ประวัติแชตข้อพิพาท";
    if (action.includes("EVIDENCE")) return "หลักฐานข้อพิพาท";
    return "ข้อพิพาท";
  }
  if (log.source === "SUPPORT") return "ทิกเก็ต";
  return "ไม่ระบุแหล่งที่มา";
}

function caseLink(log) {
  if (log.source === "AUTH" && log.targetType === "REPORT") {
    return `/workspace?section=reports&reportId=${encodeURIComponent(log.caseId)}`;
  }
  if (log.source === "AUTH" && log.targetType === "USER") {
    return `/workspace?section=orders&userId=${encodeURIComponent(log.targetId)}`;
  }
  if (log.source?.startsWith("ORDER")) {
    return `/workspace?section=orders&orderId=${encodeURIComponent(log.targetId)}`;
  }
  if (log.source === "SUPPORT") {
    return `/workspace?section=tickets&case=${encodeURIComponent(log.caseId)}`;
  }
  return null;
}

export default function AuditSection({ token }) {
  const [source, setSource] = useState("auth");
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [draft, setDraft] = useState({
    actorId: "",
    targetId: "",
    requestId: "",
    from: "",
    to: "",
  });
  const [filters, setFilters] = useState(draft);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (actionFilter) params.set("action", actionFilter);
    if (filters.actorId) params.set("actorId", filters.actorId);
    if (filters.targetId) params.set("targetId", filters.targetId);
    if (filters.requestId) {
      if (source === "auth") params.set("requestId", filters.requestId);
      if (source === "support") {
        params.set("operationId", filters.requestId);
      }
    }
    if (filters.from) {
      params.set("from", `${filters.from}T00:00:00.000Z`);
    }
    if (filters.to) {
      params.set("to", `${filters.to}T23:59:59.999Z`);
    }
    const base = endpointFor(source);
    const separator = base.includes("?") ? "&" : "?";

    apiFetch(`${base}${separator}${params}`, { token })
      .then((data) => {
        if (cancelled) return;
        setEntries(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || `โหลดประวัติจาก ${source} ไม่สำเร็จ`);
        setEntries([]);
        setTotal(0);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [source, page, actionFilter, filters, refreshKey, token]);

  function changeSource(nextSource) {
    setSource(nextSource);
    setPage(1);
    setActionFilter("");
  }

  function submitFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters({
      actorId: draft.actorId.trim(),
      targetId: draft.targetId.trim(),
      requestId: draft.requestId.trim(),
      from: draft.from,
      to: draft.to,
    });
  }

  const activeSource = SOURCES.find((item) => item.value === source);
  const actionOptions = ACTION_OPTIONS[source].map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div className="animate-fade-in-up flex min-h-full flex-col">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Audit Log ของ Trust & Safety
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          ตรวจสอบผู้ดำเนินการ เวลา และเหตุผลย้อนหลัง โดยเลือกประเภทข้อมูลที่ต้องการ
        </p>
      </div>

      <div
        className="mb-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="ประเภทประวัติ"
      >
        {SOURCES.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={source === item.value}
            onClick={() => changeSource(item.value)}
            className={`rounded-lg border px-3 py-2 text-xs font-bold ${
              source === item.value
                ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={submitFilters}
        className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3 xl:grid-cols-6"
      >
        <input
          aria-label="รหัสผู้ดำเนินการ"
          value={draft.actorId}
          onChange={(e) =>
            setDraft((value) => ({ ...value, actorId: e.target.value }))
          }
          placeholder="รหัสผู้ดำเนินการ"
          className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
        />
        <input
          aria-label="รหัสรายการที่เกี่ยวข้อง"
          value={draft.targetId}
          onChange={(e) =>
            setDraft((value) => ({ ...value, targetId: e.target.value }))
          }
          placeholder="รหัสบัญชี คำสั่งซื้อ หรือคำร้อง"
          className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
        />
        <input
          aria-label="รหัสอ้างอิง"
          value={draft.requestId}
          disabled={!["auth", "support"].includes(source)}
          onChange={(e) =>
            setDraft((value) => ({ ...value, requestId: e.target.value }))
          }
          placeholder={
            source === "auth"
              ? "รหัสอ้างอิง"
              : source === "support"
                ? "รหัสอ้างอิงการดำเนินการ"
                : "ไม่มีรหัสอ้างอิงสำหรับประเภทนี้"
          }
          className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs disabled:bg-slate-100 disabled:text-slate-400"
        />
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
          วันที่เริ่มต้น
          <input
            type="date"
            value={draft.from}
            onChange={(e) =>
              setDraft((value) => ({ ...value, from: e.target.value }))
            }
            className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
          วันที่สิ้นสุด
          <input
            type="date"
            value={draft.to}
            onChange={(e) =>
              setDraft((value) => ({ ...value, to: e.target.value }))
            }
            className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white"
        >
          ค้นหา
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">
          แหล่งข้อมูล: {activeSource.owner} · ทั้งหมด {total} รายการ
        </p>
        <DropdownFilter
          value={actionFilter}
          onChange={(value) => {
            setActionFilter(value);
            setPage(1);
          }}
          options={actionOptions}
          align="right"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>
            โหลดประวัติจาก {activeSource.owner} ไม่สำเร็จ: {error}
          </p>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="mt-2 font-bold underline"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
          กำลังโหลดประวัติ...
        </div>
      ) : !error && entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center text-sm font-semibold text-slate-600">
          ไม่พบประวัติที่ตรงกับเงื่อนไข
        </div>
      ) : !error ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1000px] border-collapse text-left text-xs text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="p-3.5">เวลา</th>
                <th className="p-3.5">แหล่งที่มา (Source)</th>
                <th className="p-3.5">Actor</th>
                <th className="p-3.5">Action</th>
                <th className="p-3.5">Target / Case</th>
                <th className="p-3.5">เหตุผล / การเปลี่ยนแปลง</th>
                <th className="p-3.5">อ้างอิง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((log) => {
                const link = caseLink(log);
                const detail =
                  log.reason ||
                  (log.fromValue || log.toValue
                    ? `${log.fromValue || "—"} → ${log.toValue || "—"}`
                    : "—");
                return (
                  <tr
                    key={`${log.source}-${log.eventId}`}
                    className="hover:bg-slate-50/80"
                  >
                    <td className="p-3.5 whitespace-nowrap text-slate-500">
                      {new Date(log.occurredAt).toLocaleString("th-TH")}
                    </td>
                    <td className="p-3.5 font-bold">{eventSourceLabel(log)}</td>
                    <td className="p-3.5 font-mono">{formatReferenceCode(log.actorId)}</td>
                    <td className="p-3.5">
                      <Badge
                        text={actionOptions.find((option) => option.value === log.action)?.label || log.action}
                        style={
                          ACTION_STYLE[log.action] ||
                          "bg-slate-100 text-slate-700"
                        }
                      />
                    </td>
                    <td className="p-3.5 font-mono">
                      <div>
                        {({ USER: "บัญชี", REPORT: "รายงาน", PRODUCT: "สินค้า", ORDER: "คำสั่งซื้อ", TICKET: "คำร้อง", DISPUTE: "ข้อพิพาท", KYC_APPLICATION: "คำขอยืนยันตัวตน" })[log.targetType] || "รายการ"}: {formatReferenceCode(log.targetId)}
                      </div>
                      {log.caseId && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          เคส: {formatReferenceCode(log.caseId) || log.caseNumber}
                        </div>
                      )}
                    </td>
                    <td
                      className="p-3.5 max-w-xs text-slate-600"
                      title={formatReferenceText(detail)}
                    >
                      {formatReferenceText(detail)}
                    </td>
                    <td className="p-3.5">
                      {link ? (
                        <a
                          href={link}
                          className="font-bold text-emerald-700 hover:underline"
                        >
                          ดูข้อมูลที่เกี่ยวข้อง
                        </a>
                      ) : (
                        <span className="text-slate-400">unavailable</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {totalPages > 1 && !error && (
        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
