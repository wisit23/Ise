"use client";
import { formatReferenceCode } from "../../../lib/referenceCodes";

import { useState } from "react";
import useExecutiveInbox from "../../../lib/useExecutiveInbox";
import {
  FILTER_LABELS,
  INBOX_PERIODS,
  INBOX_SORTS,
  MAX_SEARCH_LENGTH,
  INBOX_SOURCES,
  INBOX_SOURCE_CHOICES,
  filterOptions,
  filtersFor,
  statusSummary,
} from "../../../lib/executiveInbox";
import KpiCard from "../../panel/ui/KpiCard";
import RadioSelect from "../../ui/RadioSelect";
import ErrorState from "../../ui/ErrorState";
import Pagination from "../../Pagination";
import DayField from "../DayField";
import PeriodTabs from "../PeriodTabs";
import ComplaintDetailsModal from "./ComplaintDetailsModal";
import ComplaintRow from "./ComplaintRow";
import InboxItemRow from "./InboxItemRow";
import CaseDetailsModal from "./CaseDetailsModal";
import { defaultCustomDay } from "../../../lib/executive";

const noop = () => {};

function FilterField({ id, label, value, options, onChange }) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <RadioSelect
        id={id}
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={options}
        size="sm"
        variant="panel"
        hoverToOpen={false}
        className="w-full"
      />
    </div>
  );
}

// Complaints Section
// One list of everything people raised: complaints about a user or product
// (auth-service), support tickets (support-service) and order disputes
// (order-service). Each kind has its own filters; "all" shows every kind
// newest first, over the chosen period (today by default).
export default function ComplaintsSection({ token }) {
  const inbox = useExecutiveInbox(token);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const {
    source,
    period,
    draft,
    draftError,
    filters,
    page,
    result,
    items,
    options,
    loading,
  } = inbox;

  if (!result) {
    return (
      <p role="status" className="text-sm text-slate-500">
        กำลังโหลดข้อร้องเรียน...
      </p>
    );
  }

  const active = filtersFor(source);
  const choices = filterOptions(source, options[source]);
  const answer = result.results[source];
  const anomaly = result.results.report?.anomalySummary;
  const today = defaultCustomDay();

  return (
    <div className="animate-fade-in-up space-y-4">
      {/* ── Filters ── */}
      <section
        aria-label="ตัวกรองข้อร้องเรียน"
        className="rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="material-symbols-outlined text-[20px] text-brand-600">
              tune
            </span>
            ตัวกรองข้อร้องเรียน
          </h2>
          <span className="text-xs text-slate-500">
            เลือกประเภทเรื่อง ช่วงเวลา และตัวกรองของแต่ละประเภท
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField
            id="inbox-source"
            label="ประเภทเรื่อง"
            value={source}
            options={INBOX_SOURCE_CHOICES}
            onChange={inbox.changeSource}
          />
          {active.map((name) => (
            <FilterField
              key={name}
              id={`inbox-${name}`}
              label={FILTER_LABELS[name]}
              value={filters[name]}
              options={choices[name] || []}
              onChange={(value) => inbox.changeFilter(name, value)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 border-t border-slate-100 px-5 py-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">
              ช่วงเวลา
            </p>
            <PeriodTabs
              options={INBOX_PERIODS}
              value={period}
              onChange={inbox.changePeriod}
            />
          </div>
          {period === "custom" && (
            <div className="flex flex-wrap items-start gap-3 pt-6">
              <DayField
                caption="ตั้งแต่"
                label="ตั้งแต่วันที่"
                value={draft.from}
                max={today}
                error={draftError}
                onChange={(from) =>
                  inbox.changeDraft({
                    from,
                    // Picking the first day alone keeps a one-day range.
                    to:
                      draft.from === draft.to || draft.to < from
                        ? from
                        : draft.to,
                  })
                }
              />
              <DayField
                caption="ถึง"
                label="ถึงวันที่"
                value={draft.to}
                max={today}
                onChange={(to) => inbox.changeDraft({ ...draft, to })}
              />
            </div>
          )}
          {/* Reference search, at the right end of the period row. */}
          <div className="ml-auto w-full sm:w-64">
            <label
              htmlFor="inbox-search"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              ค้นหาด้วยรหัส
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400"
              >
                search
              </span>
              <input
                id="inbox-search"
                type="search"
                value={inbox.searchText}
                onChange={(event) => inbox.setSearchText(event.target.value)}
                placeholder="รหัส หรือชื่อร้าน"
                title="ค้นด้วยรหัสของเรื่อง (เต็มหรือบางส่วน) เช่น RPT-8AX4 หรือ #CS-000002 · ข้อร้องเรียนและข้อพิพาทค้นด้วยชื่อร้านได้ · Ticket ค้นด้วยรหัสเท่านั้น · ค้นในช่วงเวลาที่เลือก"
                maxLength={MAX_SEARCH_LENGTH}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Risk warning for repeatedly reported targets ── */}
      {anomaly?.detected && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 p-4"
        >
          <span className="material-symbols-outlined text-[22px] text-red-600">
            warning
          </span>
          <div>
            <p className="text-sm font-bold text-red-900">
              ตรวจพบเป้าหมายที่มีข้อร้องเรียนสะสมสูงผิดปกติ
            </p>
            <p className="mt-0.5 text-xs text-red-700">
              ถูกรายงานสะสมตั้งแต่ {anomaly.threshold} ครั้งขึ้นไป ·
              กดชื่อเพื่อดูข้อร้องเรียนของเป้าหมายนั้น
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {anomaly.highRiskTargets.map((t) => {
                const name =
                  t.targetShopName ||
                  t.targetName ||
                  formatReferenceCode(t.targetId);
                const selected = inbox.focus?.id === t.targetId;
                return (
                  <li key={t.targetId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        selected
                          ? inbox.clearFocus()
                          : inbox.focusTarget({ id: t.targetId, label: name })
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-400/40 ${
                        selected
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-red-300 bg-white text-red-800 hover:bg-red-100"
                      }`}
                    >
                      {name} ({t.count} ครั้ง)
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {inbox.focus && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-700"
        >
          <span>
            ข้อร้องเรียนของ{" "}
            <strong className="text-slate-900">{inbox.focus.label}</strong> ·
            ทุกสถานะ ทุกช่วงเวลา
          </span>
          <button
            type="button"
            onClick={inbox.clearFocus}
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ล้างตัวกรอง
          </button>
        </div>
      )}

      {/* ── Summary ── */}
      {source === "all" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Object.values(INBOX_SOURCES).map((kind) => (
            <KpiCard
              key={kind.value}
              label={kind.label}
              value={
                result.failed.includes(kind.value)
                  ? "ไม่พร้อมใช้งาน"
                  : (result.results[kind.value]?.total ?? 0)
              }
              icon={
                kind.value === "report"
                  ? "report"
                  : kind.value === "ticket"
                    ? "support_agent"
                    : "gavel"
              }
              color={
                kind.value === "report"
                  ? "red"
                  : kind.value === "ticket"
                    ? "sky"
                    : "amber"
              }
              onClick={() => inbox.changeSource(kind.value)}
            />
          ))}
        </div>
      ) : (
        answer && (
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="จำนวนตามสถานะ"
          >
            {statusSummary(source, answer.statusCounts, answer.options).map(
              (chip) => (
                <button
                  key={chip.code}
                  type="button"
                  aria-pressed={filters.status === chip.code}
                  onClick={() =>
                    inbox.changeFilter(
                      "status",
                      filters.status === chip.code ? "" : chip.code,
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filters.status === chip.code
                      ? "bg-slate-900 font-semibold text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {chip.label} {chip.count}
                </button>
              ),
            )}
          </div>
        )
      )}

      {/* ── List ── */}
      <div
        aria-busy={loading}
        className="overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span>รายการ</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {result.total} รายการ
            </span>
          </h2>
          {/* Loading note to the left of the sort, which stays at the right. */}
          <div className="ml-auto flex items-center gap-3">
            {loading && (
              <span role="status" className="text-xs text-slate-500">
                กำลังโหลด...
              </span>
            )}
            <RadioSelect
              id="inbox-sort"
              ariaLabel="เรียงลำดับ"
              value={inbox.sort}
              onChange={inbox.changeSort}
              options={INBOX_SORTS}
              size="sm"
              variant="panel"
              align="right"
              hoverToOpen={false}
            />
          </div>
        </div>

        {result.failed.length > 0 && (
          <p
            role="alert"
            className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800"
          >
            {result.failed.map((kind) => INBOX_SOURCES[kind].label).join(", ")}{" "}
            ไม่พร้อมใช้งานในขณะนี้ จึงยังไม่แสดงรวมอยู่ในรายการ
          </p>
        )}
        {result.truncated && (
          <p className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-600">
            แสดงรายการล่าสุดของแต่ละประเภทไม่เกิน 50 รายการ
            เลือกประเภทเรื่องเพื่อดูทั้งหมด
          </p>
        )}

        {source !== "all" && result.failed.length > 0 ? (
          <ErrorState detail="โหลดข้อมูลไม่สำเร็จ" onRetry={inbox.retry} />
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">
            {filters.q
              ? `ไม่พบ “${filters.q}” ในช่วงเวลาที่เลือก ลองขยายช่วงเวลาหรือตรวจรหัส/ชื่อร้านอีกครั้ง`
              : "ไม่มีรายการในช่วงเวลานี้"}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) =>
              item.source === "report" ? (
                <ComplaintRow
                  key={item.key}
                  report={item.report}
                  targetFiltered
                  onDetails={setSelectedReport}
                  onSelectTarget={noop}
                />
              ) : (
                <InboxItemRow
                  key={item.key}
                  item={item}
                  onDetails={setSelectedCase}
                />
              ),
            )}
          </ul>
        )}
      </div>

      {result.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={result.totalPages}
          onChange={inbox.setPage}
        />
      )}
      <CaseDetailsModal
        item={selectedCase}
        token={token}
        onClose={() => setSelectedCase(null)}
      />
      <ComplaintDetailsModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
}
