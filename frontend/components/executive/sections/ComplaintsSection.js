"use client";
import useExecutiveComplaints from "../../../lib/useExecutiveComplaints";
import KpiCard from "../../panel/ui/KpiCard";
import RadioSelect from "../../ui/RadioSelect";
import ComplaintDetailsModal from "./ComplaintDetailsModal";
import ComplaintRow from "./ComplaintRow";
import Button from "../../ui/Button";
import ErrorState from "../../ui/ErrorState";
import Pagination from "../../Pagination";
import { REPORT_STATUS_LABELS } from "../../../lib/executiveComplaints";

const STATUS_FILTERS = [
  { value: "", label: "ที่ยังเปิดอยู่" },
  { value: "OPEN", label: "ยังไม่ตรวจสอบ" },
  { value: "REVIEWED", label: "กำลังตรวจสอบ" },
  { value: "ACTIONED", label: "ดำเนินการแล้ว" },
  { value: "DISMISSED", label: "ยกคำร้อง" },
  { value: "ALL", label: "ทั้งหมด" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "วันล่าสุด" },
  { value: "oldest", label: "วันเก่าสุด" },
  { value: "most_reported", label: "เป้าหมายที่โดน report มากที่สุด" },
];

// Complaints Section
// Reads the `reports` table in auth-service — displays complaints with
// status filtering and sorting (newest, oldest, most_reported).
export default function ComplaintsSection({ token }) {
  const {
    status,
    setStatus,
    sortBy,
    setSortBy,
    selectedTargetId,
    selectedReport,
    setSelectedReport,
    searchInput,
    setSearchInput,
    search,
    setIsComposing,
    page,
    setPage,
    data,
    loading,
    error,
    selectedTargetShopName,
    selectedTargetOwnerName,
    highRiskTargets,
    handleSelectTarget,
    handleClearTarget,
    handleSearch,
    clearSearch,
    retry,
  } = useExecutiveComplaints(token);
  if (error && !data) {
    return <ErrorState detail={error} onRetry={retry} />;
  }
  if (!data) {
    return (
      <p role="status" className="text-sm text-slate-500">
        กำลังโหลดข้อร้องเรียน...
      </p>
    );
  }

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
                  ตรวจพบเป้าหมายที่มีข้อร้องเรียนสูงผิดปกติ
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
                        {t.targetShopName ||
                          t.targetName ||
                          t.targetId.slice(0, 8)}
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
            label={REPORT_STATUS_LABELS[key]}
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
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
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
              onChange={(value) => {
                setSortBy(value);
                setPage(1);
              }}
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
                  <span className="text-indigo-950">
                    {selectedTargetShopName}
                  </span>
                </span>
              )}
              {selectedTargetOwnerName && (
                <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-medium text-slate-800 border border-indigo-200 shadow-2xs">
                  <span>เจ้าของร้าน:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedTargetOwnerName}
                  </span>
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

      {/* ── 3. Complaints List ── */}
      <div className="rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <span>รายการข้อร้องเรียน</span>
            {!loading && !error && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {data.total ?? data.items.length} รายการ
              </span>
            )}
          </h2>
          <form
            onSubmit={handleSearch}
            className="ml-auto flex w-full items-center gap-2 sm:w-auto"
          >
            <label htmlFor="complaint-target-search" className="sr-only">
              ค้นหาเป้าหมายหรือชื่อร้านค้า
            </label>
            <input
              id="complaint-target-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              maxLength={100}
              placeholder="ค้นหาเป้าหมายหรือชื่อร้านค้า"
              className="focus-ring min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 sm:w-64"
            />
            <Button type="submit" variant="secondary" size="sm" icon="search">
              ค้นหา
            </Button>
            {(search || searchInput) && (
              <Button variant="ghost" size="sm" onClick={clearSearch}>
                ล้าง
              </Button>
            )}
          </form>
        </div>
        {search && (
          <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-600">
            ผลการค้นหา: <strong>{search}</strong> ตามสถานะที่เลือก
          </p>
        )}
        {sortBy === "most_reported" && (
          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 rounded-md px-2 py-0.5">
            เรียงตามเป้าหมายที่โดน report มากที่สุด
          </span>
        )}

        {error ? (
          <ErrorState detail={error} onRetry={retry} />
        ) : loading ? (
          <p role="status" className="px-5 py-8 text-sm text-slate-500">
            กำลังค้นหาข้อร้องเรียน...
          </p>
        ) : data.items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">
            {search
              ? "ไม่พบข้อร้องเรียนของเป้าหมายหรือร้านค้านี้ตามสถานะที่เลือก"
              : "ไม่มีข้อร้องเรียนในหมวดนี้"}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((r) => (
              <ComplaintRow
                key={r.id}
                report={r}
                targetFiltered={Boolean(selectedTargetId)}
                onDetails={setSelectedReport}
                onSelectTarget={handleSelectTarget}
              />
            ))}
          </ul>
        )}
      </div>
      {!loading && !error && data.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={data.totalPages}
          onChange={setPage}
        />
      )}
      <ComplaintDetailsModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
}
