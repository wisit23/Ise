"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import KpiCard from "../../panel/ui/KpiCard";
import RadioSelect from "../../ui/RadioSelect";

const STATUS_LABEL = {
  OPEN: "ยังไม่ตรวจสอบ",
  REVIEWED: "กำลังตรวจสอบ",
  ACTIONED: "ดำเนินการแล้ว",
  DISMISSED: "ยกคำร้อง",
};

const STATUS_FILTERS = [
  { value: "", label: "ที่ยังเปิดอยู่" },
  { value: "OPEN", label: "ยังไม่ตรวจสอบ" },
  { value: "REVIEWED", label: "กำลังตรวจสอบ" },
  { value: "ACTIONED", label: "ดำเนินการแล้ว" },
  { value: "DISMISSED", label: "ยกคำร้อง" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "วันล่าสุด" },
  { value: "oldest", label: "วันเก่าสุด" },
  { value: "most_reported", label: "เป้าหมายที่โดน report มากที่สุด" },
];

// ─── Complaints Section ─────────────────────────────────────────────────
// Reads the `reports` table in auth-service — displays complaints with
// status filtering and sorting (newest, oldest, most_reported).
export default function ComplaintsSection({ token }) {
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [data, setData] = useState({
    items: [],
    statusCounts: {},
    totalOpen: 0,
    anomalySummary: { detected: false, highRiskTargets: [], threshold: 3 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: 50 });
    if (status) params.set("status", status);
    if (sortBy) params.set("sortBy", sortBy);
    if (selectedTargetId) params.set("targetId", selectedTargetId);

    apiFetch(`/api/auth/executive/reports?${params}`, { token })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, sortBy, selectedTargetId, token]);

  const highRiskTargets = data.anomalySummary?.highRiskTargets || [];

  const selectedTargetShopName =
    selectedTarget?.shopName ||
    data.items.find((r) => r.targetId === selectedTargetId)?.targetShopName ||
    highRiskTargets.find((t) => t.targetId === selectedTargetId)?.targetShopName;

  const selectedTargetOwnerName =
    selectedTarget?.name ||
    data.items.find((r) => r.targetId === selectedTargetId)?.targetName ||
    highRiskTargets.find((t) => t.targetId === selectedTargetId)?.targetName;

  const handleSelectTarget = (targetId, shopName, name, forceSort = false) => {
    setSelectedTargetId(targetId);
    setSelectedTarget({ id: targetId, shopName, name });
    if (forceSort) setSortBy("most_reported");
  };

  const handleClearTarget = () => {
    setSelectedTargetId("");
    setSelectedTarget(null);
  };

  return (
    <div className="animate-fade-in-up">
      {/* ── 1. Anomaly Risk Warning Banner (UR-30) ── */}
      {data.anomalySummary?.detected && (
        <div className="mb-5 rounded-2xl border-2 border-red-300 bg-red-50/90 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
                <span className="material-symbols-outlined text-[22px]">
                  warning
                </span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-red-900">
                  ตรวจพบเป้าหมายที่มีข้อร้องเรียนสูงผิดปกติ (ความเสี่ยงทางธุรกิจ)
                </h3>
                <p className="mt-0.5 text-xs text-red-700 leading-relaxed">
                  มีร้านค้า/เป้าหมายที่ถูกรายงานสะสมตั้งแต่{" "}
                  {data.anomalySummary.threshold} ครั้งขึ้นไป
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {highRiskTargets.map((t) => (
                    <button
                      key={t.targetId}
                      type="button"
                      onClick={() =>
                        handleSelectTarget(
                          t.targetId,
                          t.targetShopName,
                          t.targetName,
                          true,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-200 transition-colors"
                    >
                      <span>
                        {t.targetShopName || t.targetName || t.targetId.slice(0, 8)}
                      </span>
                      <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] text-white">
                        {t.count} ครั้ง
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {selectedTargetId && (
              <button
                type="button"
                onClick={handleClearTarget}
                className="self-start sm:self-center shrink-0 rounded-lg bg-white border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 shadow-xs"
              >
                ดูทุกเป้าหมาย
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 2. KPI Summary Cards ── */}
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="เรื่องที่ยังเปิดอยู่"
          value={data.totalOpen}
          icon="report"
          color="red"
        />
        {["OPEN", "REVIEWED", "ACTIONED"].map((key) => (
          <KpiCard
            key={key}
            label={STATUS_LABEL[key]}
            value={data.statusCounts[key] || 0}
            icon={
              key === "OPEN"
                ? "mark_email_unread"
                : key === "REVIEWED"
                  ? "visibility"
                  : "task_alt"
            }
            color={
              key === "OPEN" ? "amber" : key === "REVIEWED" ? "sky" : "emerald"
            }
          />
        ))}
      </div>

      {/* ── 2. Control Bar: Status Filter & Sorting ── */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 mr-1">
              สถานะ:
            </span>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value || "open"}
                type="button"
                onClick={() => setStatus(f.value)}
                aria-pressed={status === f.value}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  status === f.value
                    ? "bg-slate-900 text-white font-semibold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <label
              htmlFor="complaint-sort"
              className="text-xs font-semibold text-slate-500 whitespace-nowrap"
            >
              จัดเรียง:
            </label>
            <RadioSelect
              id="complaint-sort"
              value={sortBy}
              onChange={setSortBy}
              options={SORT_OPTIONS}
              size="sm"
              variant="panel"
              align="right"
              className="min-w-[210px]"
            />
          </div>
        </div>

        {/* Selected target indicator */}
        {selectedTargetId && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg bg-indigo-50/90 px-3.5 py-2 text-xs text-indigo-950 border border-indigo-200/80">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-semibold text-indigo-900">
                กำลังกรองเฉพาะข้อร้องเรียนของเป้าหมาย:
              </span>
              {selectedTargetShopName && (
                <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-bold text-slate-900 border border-indigo-200 shadow-2xs">
                  <span>ชื่อร้าน:</span>
                  <span className="text-indigo-950">{selectedTargetShopName}</span>
                </span>
              )}
              {selectedTargetOwnerName && (
                <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-medium text-slate-800 border border-indigo-200 shadow-2xs">
                  <span>เจ้าของร้าน:</span>
                  <span className="font-semibold text-slate-900">{selectedTargetOwnerName}</span>
                </span>
              )}
              <span className="font-mono text-[11px] text-slate-500">
                (ID: {selectedTargetId.slice(0, 37)})
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearTarget}
              className="self-end sm:self-auto shrink-0 font-bold text-indigo-700 hover:text-indigo-950 hover:underline cursor-pointer"
            >
              ✕ ยกเลิก
            </button>
          </div>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* ── 3. Complaints List ── */}
      <div className="rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <span>รายการข้อร้องเรียน</span>
            {!loading && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {data.items.length} รายการ
              </span>
            )}
          </h2>
          {sortBy === "most_reported" && (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 rounded-md px-2 py-0.5">
              เรียงตามเป้าหมายที่โดน report มากที่สุด
            </span>
          )}
        </div>

        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">กำลังโหลด...</p>
        ) : data.items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">
            ไม่มีข้อร้องเรียนในหมวดนี้
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((r) => (
              <li
                key={r.id}
                className="px-5 py-4 transition-colors hover:bg-slate-50/50"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Report Reason */}
                    <p className="text-sm font-semibold text-slate-900 leading-snug">
                      {r.reason}
                    </p>

                    {/* Meta information */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        โดย:{" "}
                        <strong className="text-slate-700 font-medium">
                          {r.reporterName || "ไม่ทราบชื่อ"}
                        </strong>
                      </span>
                      <span>
                        วันที่แจ้ง:{" "}
                        <strong className="text-slate-700 font-medium">
                          {new Date(r.reportedAt).toLocaleDateString("th-TH", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </strong>
                      </span>
                      {r.targetId && (
                        <span className="flex items-center gap-1">
                          เป้าหมาย:{" "}
                          <span className="font-semibold text-slate-800">
                            {r.targetShopName
                              ? `${r.targetShopName}`
                              : r.targetName
                                ? `${r.targetName}`
                                : r.targetId.slice(0, 8)}
                          </span>
                          {r.targetReportCount > 1 && (
                            <span className="text-[11px] text-slate-500 font-normal">
                              (โดนรายงานรวม {r.targetReportCount} ครั้ง)
                            </span>
                          )}
                        </span>
                      )}
                      {r.productId && (
                        <span className="font-mono text-slate-400">
                          รหัสสินค้า: {r.productId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Badge & Target Filter */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.status === "OPEN"
                          ? "bg-amber-100 text-amber-800"
                          : r.status === "REVIEWED"
                            ? "bg-sky-100 text-sky-800"
                            : r.status === "ACTIONED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    {r.targetId && !selectedTargetId && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectTarget(
                            r.targetId,
                            r.targetShopName,
                            r.targetName,
                          )
                        }
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                      >
                        กรองดูเป้าหมายนี้
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

