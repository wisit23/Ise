"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";
import ErrorState from "../../ui/ErrorState";
import Skeleton from "../../ui/Skeleton";
import ChartCard from "../../panel/ui/ChartCard";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import LineChart from "../../charts/LineChart";

const DAY_MS = 86400000;
const RANKING_DIMENSIONS = [
  ["category", "หมวดหมู่"],
  ["brand", "แบรนด์"],
  ["style", "สไตล์"],
];
const SIGNAL_OPTIONS = [
  ["all", "ทุกแหล่งสัญญาณ"],
  ["profile", "ข้อมูลโปรไฟล์"],
  ["search", "การค้นหา"],
  ["like", "การกดใจ"],
  ["purchase", "การซื้อจริง"],
];
const DIMENSION_ICONS = {
  category: "category",
  brand: "sell",
  style: "styler",
};
const FILTER_DIMENSIONS = ["category", "brand", "style"];

function dimensionLabel(dimension) {
  return RANKING_DIMENSIONS.find(([key]) => key === dimension)?.[1] || dimension;
}

function localInput(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultRange(days = 30) {
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY_MS);
  return { from: localInput(from), to: localInput(to) };
}

function changeLabel(value) {
  const number = Number(value || 0);
  if (!number) return "เท่ากับช่วงก่อนหน้า";
  return `${number > 0 ? "เพิ่ม" : "ลด"} ${Math.abs(number).toLocaleString("th-TH", { maximumFractionDigits: 1 })}% จากช่วงก่อนหน้า`;
}

function Metric({ label, value, note, icon }) {
  return (
    <article className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
        <span>{label}</span>
        <span className="material-symbols-outlined text-[18px] text-emerald-600">
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </div>
      <p className="mt-1 text-[11px] text-emerald-700">{note}</p>
    </article>
  );
}

function FilterSelect({ id, label, value, onChange, options, disabled }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-[11px] font-semibold text-slate-600">
        {label}
      </label>
      <DropdownFilter
        id={id}
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={options.map(([optionValue, optionLabel]) => ({
          value: optionValue,
          label: optionLabel,
        }))}
        className="mt-1 block w-full"
        align="auto"
      />
    </div>
  );
}

function RankingList({ rows = [] }) {
  const visibleRows = rows.filter((row) => row.interestedCustomers > 0);
  const maximum = Math.max(
    1,
    ...visibleRows.map((row) => row.interestedCustomers),
  );

  if (!visibleRows.length) {
    return (
      <p className="py-8 text-center text-xs text-slate-500">
        ไม่มีข้อมูลในช่วงที่เลือก
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {visibleRows.map((row) => (
        <div
          key={row.value}
          className="grid grid-cols-[110px_1fr_90px] items-center gap-3 text-xs"
        >
          <span className="truncate font-semibold text-slate-700">
            {row.value}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
              style={{ width: `${(row.interestedCustomers / maximum) * 100}%` }}
            />
          </div>
          <span className="text-right text-slate-600">
            {row.interestedCustomers.toLocaleString("th-TH")} คน{" "}
            <span className={row.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"}>
              {row.changePercent >= 0 ? "↑" : "↓"}
              {Math.abs(row.changePercent)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CustomerInsightsSection({ token, onCreateCampaign }) {
  const initialFilters = useMemo(
    () => ({
      ...defaultRange(),
      category: "",
      brand: "",
      style: "",
      signal: "all",
    }),
    [],
  );
  const [filters, setFilters] = useState(initialFilters);
  const [options, setOptions] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (nextFilters) => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          from: new Date(nextFilters.from).toISOString(),
          to: new Date(nextFilters.to).toISOString(),
          signal: nextFilters.signal,
        });
        for (const key of FILTER_DIMENSIONS) {
          if (nextFilters[key]) query.set(key, nextFilters[key]);
        }
        const result = await apiFetch(
          `/api/products/campaigns/interest-insights?${query}`,
          { token },
        );
        setData(result);
        if (result.dimensions) {
          setOptions((current) => current || { dimensions: result.dimensions });
        }
      } catch (requestError) {
        setError(requestError.message || "ไม่สามารถโหลดข้อมูลความสนใจลูกค้าได้");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/products/campaigns/audience/options", { token })
      .then((result) => {
        if (!cancelled) setOptions(result);
      })
      .catch(() => {});
    load(initialFilters);
    return () => {
      cancelled = true;
    };
  }, [initialFilters, load, token]);

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function quickRange(days) {
    const range = defaultRange(days);
    const next = { ...filters, ...range };
    setFilters(next);
    load(next);
  }

  function clearAppliedFilter(key) {
    const next = {
      ...filters,
      [key]: "",
    };
    setFilters(next);
    load(next);
  }

  const dimensions = options?.dimensions || data?.dimensions || {};
  const selected = data?.selected;
  const trendGridLines = Math.min(
    4,
    Math.max(
      1,
      ...(data?.trend || []).map((point) => Number(point.interestedCustomers) || 0),
    ),
  );
  const appliedFilters = data?.filters || {};
  const activeDrilldownFilters = FILTER_DIMENSIONS
    .filter((key) => appliedFilters[key])
    .map((key) => ({ key, label: dimensionLabel(key), value: appliedFilters[key] }));
  const trendScope = [
    `หมวดหมู่: ${appliedFilters.category || "ทุกหมวดหมู่"}`,
    appliedFilters.brand ? `แบรนด์: ${appliedFilters.brand}` : null,
    appliedFilters.style ? `สไตล์: ${appliedFilters.style}` : null,
    SIGNAL_OPTIONS.find(([value]) => value === appliedFilters.signal)?.[1] ||
      "ทุกแหล่งสัญญาณ",
  ].filter(Boolean);
  const latest = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";
  const rankingFor = (dimension) =>
    data?.rankings?.[dimension] ||
    (dimension === "category" ? data?.categoryRanking : null) ||
    (dimension === "brand" ? data?.brandRanking : null) ||
    [];
  const behaviorSummary = data?.behaviorSummary || {
    search: 0,
    like: 0,
    purchase: 0,
  };
  const hasBehaviorInSelectedPeriod = Object.values(behaviorSummary).some(
    (count) => Number(count) > 0,
  );

  if (error && !data) {
    return <ErrorState description={error} onRetry={() => load(filters)} />;
  }

  return (
    <section className="space-y-5" aria-labelledby="customer-insights-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="customer-insights-title" className="text-xl font-bold text-slate-900">
            ข้อมูลความสนใจลูกค้า
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            วิเคราะห์ข้อมูลรวมเพื่อเลือกกลุ่มเป้าหมาย โดยไม่แสดงรายชื่อหรือข้อมูลส่วนบุคคล
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            โปรไฟล์ใช้ค่าล่าสุดที่บันทึก ส่วนกราฟรายวันอ้างอิงการค้นหา การกดใจ และการซื้อในช่วงที่เลือก
          </p>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          อัปเดตล่าสุด<br />
          <span className="font-semibold text-slate-700">{latest}</span>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          load(filters);
        }}
        className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">กำหนดขอบเขตข้อมูล</h3>
            <p className="text-[11px] text-slate-500">ฟิลเตอร์ชุดนี้ควบคุม KPI และกราฟทั้งหมดด้านล่าง</p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => quickRange(days)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
              >
                {days} วัน
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <label className="text-[11px] font-semibold text-slate-600">
            เริ่มต้น
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(event) => update("from", event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            สิ้นสุด
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(event) => update("to", event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <FilterSelect id="insights-signal" label="แหล่งสัญญาณ" value={filters.signal} onChange={(value) => update("signal", value)} options={SIGNAL_OPTIONS} />
        </div>
        <div
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
          aria-label="ตัวกรองเจาะลึก"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-700">
            <span>
              <span className="material-symbols-outlined mr-1 align-middle text-[17px] text-emerald-600">filter_alt</span>
              กรองเจาะลึก
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              {FILTER_DIMENSIONS.filter((key) => filters[key]).length
                ? `เลือกแล้ว ${FILTER_DIMENSIONS.filter((key) => filters[key]).length} รายการ`
                : "ยังไม่ได้เลือก"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FilterSelect id="insights-category" label="หมวดหมู่" value={filters.category} onChange={(value) => update("category", value)} options={[["", "ทุกหมวดหมู่"], ...(dimensions.categories || []).map((value) => [value, value])]} />
            <FilterSelect id="insights-brand" label="แบรนด์" value={filters.brand} onChange={(value) => update("brand", value)} options={[["", "ทุกแบรนด์"], ...(dimensions.brands || []).map((value) => [value, value])]} />
            <FilterSelect id="insights-style" label="สไตล์" value={filters.style} onChange={(value) => update("style", value)} options={[["", "ทุกสไตล์"], ...(dimensions.styles || []).map((value) => [value, value])]} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={loading} className="rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
            {loading ? "กำลังประมวลผล..." : "แสดงผล"}
          </button>
        </div>
        {filters.signal === "profile" ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            โปรไฟล์แสดงค่าล่าสุดที่บันทึกไว้ จึงไม่มีแนวโน้มย้อนหลังรายวัน; เลือกการค้นหา การกดใจ หรือการซื้อจริงเพื่อดูกราฟตามเวลา
          </p>
        ) : null}
      </form>

      {loading && !data ? (
        <div className="grid grid-cols-4 gap-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : data ? (
        <>
          {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p> : null}
          {activeDrilldownFilters.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs">
              <span className="font-bold text-emerald-900">ต้องตรงครบทุกเงื่อนไข (AND):</span>
              {activeDrilldownFilters.map(({ key, label, value }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => clearAppliedFilter(key)}
                  className="rounded-full bg-white px-3 py-1.5 font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100"
                  aria-label={`ล้างตัวกรอง${label} ${value}`}
                >
                  {label}: {value} ×
                </button>
              ))}
              <span className="basis-full text-[10px] text-emerald-700">
                นับเฉพาะบัญชีเดียวกันที่มีสัญญาณความสนใจครบทุกตัวกรอง
              </span>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label={activeDrilldownFilters.length ? "ลูกค้าที่สนใจครบทุกเงื่อนไข" : "ลูกค้าที่มีสัญญาณในขอบเขตนี้"} value={`${Number(data.interestedCustomers || 0).toLocaleString("th-TH")} คน`} note={`${changeLabel(data.interestedCustomersChangePercent)} · ตรวจสอบ ${Number(data.totalCustomers || 0).toLocaleString("th-TH")} บัญชี`} icon="groups" />
            <Metric label="หมวดหมู่มาแรง" value={data.topCategory?.value || "-"} note={data.topCategory ? changeLabel(data.topCategory.changePercent) : "ไม่มีข้อมูล"} icon="category" />
            <Metric label="แบรนด์มาแรง" value={data.topBrand?.value || "-"} note={data.topBrand ? changeLabel(data.topBrand.changePercent) : "ไม่มีข้อมูล"} icon="sell" />
            <Metric label="สไตล์มาแรง" value={data.topStyle?.value || "-"} note={data.topStyle ? changeLabel(data.topStyle.changePercent) : "ไม่มีข้อมูล"} icon="styler" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {RANKING_DIMENSIONS.map(([dimension]) => (
              <ChartCard
                key={dimension}
                title={`อันดับ${dimensionLabel(dimension)}`}
                subtitle="จำนวนบัญชีที่มีสัญญาณของมิตินี้ ภายใต้ฟิลเตอร์ชุดเดียวกัน"
                icon={DIMENSION_ICONS[dimension]}
                align="start"
              >
                <RankingList rows={rankingFor(dimension)} />
              </ChartCard>
            ))}

            <ChartCard title="แนวโน้มพฤติกรรมความสนใจ" subtitle="จำนวนบัญชีที่ค้นหา กดใจ หรือซื้อจริงในแต่ละวัน" icon="show_chart">
              <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">ขอบเขตกราฟ:</span>
                {trendScope.map((scope) => (
                  <span key={scope} className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">
                    {scope}
                  </span>
                ))}
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {[
                  ["search", "ค้นหา", "search"],
                  ["like", "กดใจ", "favorite"],
                  ["purchase", "ซื้อจริง", "shopping_bag"],
                ].map(([key, label, icon]) => (
                  <div key={key} className="rounded-lg bg-slate-50 px-2 py-2 text-center">
                    <span className="material-symbols-outlined align-middle text-[15px] text-emerald-600">{icon}</span>
                    <span className="ml-1 text-[10px] text-slate-500">{label}</span>
                    <div className="text-sm font-bold text-slate-800">
                      {Number(behaviorSummary[key] || 0).toLocaleString("th-TH")} บัญชี
                    </div>
                  </div>
                ))}
              </div>
              <p className="mb-2 text-[10px] text-slate-500">
                นับบัญชีไม่ซ้ำตามประเภทพฤติกรรมในช่วงที่เลือก ไม่รวมค่าความชอบปัจจุบันจากโปรไฟล์
              </p>
              {data.filters.signal === "profile" ? (
                <div className="flex h-[220px] items-center justify-center rounded-xl bg-slate-50 px-6 text-center text-xs text-slate-500">
                  ข้อมูลโปรไฟล์เป็นค่าความชอบปัจจุบัน จึงไม่มีแนวโน้มย้อนหลังรายวัน
                </div>
              ) : !hasBehaviorInSelectedPeriod ? (
                <div className="flex h-[220px] items-center justify-center rounded-xl bg-slate-50 px-6 text-center text-xs text-slate-500">
                  ยังไม่มีพฤติกรรมการค้นหา กดใจ หรือซื้อจริงในช่วงเวลาที่เลือก
                </div>
              ) : (
                <LineChart
                  height={220}
                  fillArea
                  gridLines={trendGridLines}
                  formatValue={(value) => `${Number(value).toLocaleString("th-TH")} คน`}
                  series={[{ label: "ผู้สนใจ", color: "#059669", data: data.trend.map((point) => ({ x: new Date(point.date).toLocaleDateString("th-TH", { day: "numeric", month: "short" }), y: point.interestedCustomers })) }]}
                />
              )}
            </ChartCard>
          </div>

          {selected ? (
            <ChartCard title="รายละเอียดคะแนนของกลุ่มที่เลือก" subtitle="สถิติรวมเท่านั้น ไม่แสดงบัญชีรายบุคคล" icon="analytics" align="start">
              <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
                {[
                  ["ต่ำสุดที่พบ", selected.minimumObserved],
                  ["สูงสุดที่พบ", selected.maximumObserved],
                  ["คะแนนเฉลี่ย", selected.averageScore],
                  ["ค่ากลาง", selected.medianScore],
                  ["สูงสุดที่เป็นไปได้", `${selected.maximumPossible} / ${data.globalMaximum}`],
                  ["ผู้มีคะแนน", `${selected.interestedCustomers} คน`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[10px] font-semibold text-slate-500">{label}</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {selected.distribution.map((band) => (
                  <div key={band.key} className="rounded-xl border border-slate-200 px-3 py-2 text-center">
                    <div className="text-[10px] text-slate-500">{band.min === band.max ? "0" : `${band.min}–${band.max}`}</div>
                    <div className="text-sm font-bold text-slate-800">{band.count.toLocaleString("th-TH")} คน</div>
                    <div className="text-[10px] text-slate-500">{band.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => onCreateCampaign?.({ ...selected.criteria, from: data.filters.from, to: data.filters.to })} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700">
                  สร้างแคมเปญสำหรับกลุ่มนี้
                </button>
              </div>
            </ChartCard>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
