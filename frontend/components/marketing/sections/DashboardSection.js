"use client";
import { formatReferenceCode } from "../../../lib/referenceCodes";


import { useEffect, useState, useCallback } from "react";
import { apiFetch, getMarketingUserAnalytics } from "../../../lib/api";
import KpiCard from "../../panel/ui/KpiCard";
import ChartCard from "../../panel/ui/ChartCard";
import TrendLineChart from "../../charts/TrendLineChart";
import AuctionStatusBars from "./AuctionStatusBars";
import { MARKETING_TIME_ZONE } from "../marketingConstants";
import SalesMixChart, { formatMoney } from "./SalesMixChart";
import UsageHeatmap, {
  getUsageHeatmapTitle,
  resolveUsageHeatmapMode,
} from "./UsageHeatmap";

const DEFAULT_RANGE_PRESET = "week";
const RANGE_PRESETS = [
  { key: "day", label: "วัน" },
  { key: "week", label: "สัปดาห์" },
  { key: "month", label: "เดือน" },
  { key: "year", label: "ปี" },
  { key: "custom", label: "กำหนดเอง" },
];

const DONUT_COLORS = {
  pending_approval: "#f59e0b",
  approved: "#0ea5e9",
  scheduled: "#6366f1",
  open: "#10b981",
  closed: "#94a3b8",
  rejected: "#ef4444",
  cancelled: "#cbd5e1",
};

const DONUT_LABEL = {
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  scheduled: "ตั้งเวลาแล้ว",
  open: "กำลังประมูล",
  closed: "ปิดแล้ว",
  rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิก",
};

function formatPeakHour(peakHour) {
  if (!peakHour || !peakHour.hour) return "—";
  const date = new Date(peakHour.hour);
  if (Number.isNaN(date.getTime())) return "—";
  const dayStr = date.toLocaleDateString("th-TH", {
    timeZone: MARKETING_TIME_ZONE,
    month: "short",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("th-TH", {
    timeZone: MARKETING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${dayStr} ${timeStr} น.`;
}

function formatHourLabel(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const dayStr = date.toLocaleDateString("th-TH", {
    timeZone: MARKETING_TIME_ZONE,
    month: "numeric",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("th-TH", {
    timeZone: MARKETING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${dayStr} ${timeStr}`;
}

export function convertThaiDateFilterToRange(fromDateStr, toDateStr) {
  if (!fromDateStr || !toDateStr) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fromDateStr) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toDateStr)
  ) {
    return null;
  }
  const from = `${fromDateStr}T00:00:00+07:00`;

  const [year, month, day] = toDateStr.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day));
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextY = nextDate.getUTCFullYear();
  const nextM = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
  const nextD = String(nextDate.getUTCDate()).padStart(2, "0");
  const to = `${nextY}-${nextM}-${nextD}T00:00:00+07:00`;

  return { from, to, timezone: MARKETING_TIME_ZONE };
}

function formatCalendarDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function getCalendarDateRange(preset, now = new Date()) {
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = bangkokNow.getUTCFullYear();
  const month = bangkokNow.getUTCMonth();
  const day = bangkokNow.getUTCDate();
  const today = new Date(Date.UTC(year, month, day));
  let from = new Date(today);
  let to = new Date(today);

  if (preset === "week") {
    from.setUTCDate(from.getUTCDate() - 6);
  } else if (preset === "month") {
    from = new Date(Date.UTC(year, month, 1));
    to = new Date(Date.UTC(year, month + 1, 0));
  } else if (preset === "year") {
    from = new Date(Date.UTC(year, 0, 1));
    to = new Date(Date.UTC(year, 11, 31));
  }

  return { fromDate: formatCalendarDate(from), toDate: formatCalendarDate(to) };
}

function isDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

export function readDashboardFilter(search = "", now = new Date()) {
  const params = new URLSearchParams(search);
  const requestedPreset = params.get("range");
  const preset = RANGE_PRESETS.some((item) => item.key === requestedPreset)
    ? requestedPreset
    : DEFAULT_RANGE_PRESET;
  const queryFrom = params.get("from");
  const queryTo = params.get("to");
  const fallback = getCalendarDateRange(
    preset === "custom" ? DEFAULT_RANGE_PRESET : preset,
    now,
  );
  const fromDate = isDateInput(queryFrom) ? queryFrom : fallback.fromDate;
  const toDate = isDateInput(queryTo) ? queryTo : fallback.toDate;
  const safePreset =
    preset === "custom" && (!isDateInput(queryFrom) || !isDateInput(queryTo))
      ? DEFAULT_RANGE_PRESET
      : preset;
  return {
    preset: safePreset,
    fromDate,
    toDate,
    range: convertThaiDateFilterToRange(fromDate, toDate),
  };
}

function syncDashboardFilterToUrl({ preset, fromDate, toDate }) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("range", preset);
  url.searchParams.set("from", fromDate);
  url.searchParams.set("to", toDate);
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function formatSelectedRange(fromDate, toDate) {
  const format = (value) =>
    new Date(`${value}T00:00:00+07:00`).toLocaleDateString("th-TH", {
      timeZone: MARKETING_TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${format(fromDate)} – ${format(toDate)}`;
}

function formatUpdatedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("th-TH", {
    timeZone: MARKETING_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function ComparisonText({ comparison }) {
  if (!comparison) return null;
  const difference = Number(comparison.difference || 0);
  if (difference === 0) {
    return <span className="text-slate-500">ไม่เปลี่ยนแปลงจากช่วงก่อน</span>;
  }
  const increase = difference > 0;
  const percent = comparison.percentChange;
  return (
    <span className={increase ? "text-emerald-600" : "text-rose-600"}>
      {increase ? "เพิ่มขึ้น" : "ลดลง"} {formatMoney(Math.abs(difference))}
      {percent === null
        ? " (ช่วงก่อนยังไม่มียอดขาย)"
        : ` (${Math.abs(percent)}%)`}
    </span>
  );
}

function SalesKpiCard({
  label,
  data,
  icon,
  color,
  onClick,
  className = "",
  loading,
  error,
}) {
  const Component = onClick ? "button" : "article";
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    sky: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex min-h-44 w-full flex-col rounded-xl border border-slate-200/70 bg-white p-5 text-left shadow-sm transition-all ${
        onClick
          ? "hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
          : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {loading ? "…" : error ? "—" : formatMoney(data?.sales)}
          </p>
        </div>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full ${colors[color]}`}
        >
          <span className="material-symbols-outlined text-[21px]">{icon}</span>
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {loading || error
          ? "กำลังเตรียมข้อมูล"
          : `${Number(data?.completedOrders || 0).toLocaleString("th-TH")} คำสั่งซื้อสำเร็จ`}
      </p>
      <p className="mt-auto pt-4 text-xs font-semibold">
        {!loading && !error && <ComparisonText comparison={data?.comparison} />}
      </p>
      {onClick && (
        <span className="mt-2 text-[11px] font-semibold text-violet-600">
          ไปยังหน้าที่เกี่ยวข้อง →
        </span>
      )}
    </Component>
  );
}

export { formatPeakHour, formatHourLabel };

export default function DashboardSection({ token, onNavigate }) {
  const [initialFilter] = useState(() =>
    readDashboardFilter(
      typeof window === "undefined" ? "" : window.location.search,
    ),
  );
  const [rangePreset, setRangePreset] = useState(initialFilter.preset);
  const [fromDate, setFromDate] = useState(initialFilter.fromDate);
  const [toDate, setToDate] = useState(initialFilter.toDate);

  // Loading & Error states for Campaign/Overview
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // User analytics has an independent error state because it comes from Auth.
  const [userAnalytics, setUserAnalytics] = useState(null);
  const [userAnalyticsLoading, setUserAnalyticsLoading] = useState(true);
  const [userAnalyticsError, setUserAnalyticsError] = useState(null);

  // Marketing Overview Metrics
  const [metrics, setMetrics] = useState({
    completedOrders: 0,
    grossRevenue: 0,
    totalDiscount: 0,
    netRevenue: 0,
    totalClaimed: 0,
    totalRedeemed: 0,
    overallConversionRate: 0,
  });
  const [salesOverview, setSalesOverview] = useState(null);

  // Trends data
  const [trendData, setTrendData] = useState([]);

  // Campaign Comparison Table
  const [campaigns, setCampaigns] = useState([]);

  // Auction stats
  const [auctionStats, setAuctionStats] = useState({
    pendingApproval: null,
    approved: null,
    scheduled: null,
    open: null,
  });
  const [auctionStatusData, setAuctionStatusData] = useState([]);
  const [auctionActivity, setAuctionActivity] = useState({
    distinctBidders: 0,
    activeStores: 0,
  });

  const [appliedFilter, setAppliedFilter] = useState(initialFilter);
  const appliedRange = appliedFilter.range;
  const heatmapMode = resolveUsageHeatmapMode(appliedFilter);
  const [filterValidationError, setFilterValidationError] = useState(null);

  const loadUserAnalytics = useCallback(
    async (targetRange) => {
      setUserAnalyticsLoading(true);
      setUserAnalyticsError(null);
      try {
        const params = targetRange
          ? {
              from: targetRange.from,
              to: targetRange.to,
              timezone: MARKETING_TIME_ZONE,
            }
          : { timezone: MARKETING_TIME_ZONE };
        const uaRes = await getMarketingUserAnalytics(params, token);
        setUserAnalytics(uaRes);
      } catch (err) {
        setUserAnalyticsError(
          err.message || "ไม่สามารถโหลดข้อมูลสถิติผู้ใช้งานได้",
        );
        setUserAnalytics(null);
      } finally {
        setUserAnalyticsLoading(false);
      }
    },
    [token],
  );

  const loadOverviewData = useCallback(
    async (targetRange) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (targetRange?.from) queryParams.set("from", targetRange.from);
        if (targetRange?.to) queryParams.set("to", targetRange.to);
        const queryStr = queryParams.toString()
          ? `?${queryParams.toString()}`
          : "";

        const [overviewRes, trendsRes, compareRes, auctionRes, salesRes] =
          await Promise.all([
            apiFetch(`/api/products/campaigns/metrics/overview${queryStr}`, {
              token,
            }),
            apiFetch(`/api/products/campaigns/metrics/trends${queryStr}`, {
              token,
            }),
            apiFetch(`/api/products/campaigns/metrics/compare${queryStr}`, {
              token,
            }),
            apiFetch(
              `/api/products/campaigns/metrics/auction-activity${queryStr}`,
              { token },
            ),
            apiFetch(`/api/orders/marketing/sales-dashboard${queryStr}`, {
              token,
            }),
          ]);
        setMetrics(overviewRes);
        setSalesOverview(salesRes.data || null);

        const formattedTrends = (trendsRes.series || []).map((item) => ({
          label: item.date ? item.date.slice(5) : "-", // MM-DD
          value: item.grossRevenue || 0,
        }));
        setTrendData(formattedTrends);

        setCampaigns(compareRes.comparisons || []);
        setAuctionActivity({
          distinctBidders: auctionRes.distinctBidders || 0,
          activeStores: auctionRes.activeStores || 0,
        });
        const statusCounts = auctionRes.statusCounts || {};
        setAuctionStats({
          pendingApproval: statusCounts.pending_approval || 0,
          approved: statusCounts.approved || 0,
          scheduled: statusCounts.scheduled || 0,
          open: statusCounts.open || 0,
        });
        setAuctionStatusData(
          Object.keys(DONUT_LABEL).map((st) => ({
            label: DONUT_LABEL[st],
            value: statusCounts[st] || 0,
            color: DONUT_COLORS[st],
          })),
        );
      } catch (err) {
        setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล Dashboard");
        setMetrics(null);
        setSalesOverview(null);
        setTrendData([]);
        setCampaigns([]);
        setAuctionActivity(null);
        setAuctionStats({
          pendingApproval: null,
          approved: null,
          scheduled: null,
          open: null,
        });
        setAuctionStatusData([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const loadData = useCallback(() => {
    loadUserAnalytics(appliedRange);
    loadOverviewData(appliedRange);
  }, [loadUserAnalytics, loadOverviewData, appliedRange]);

  useEffect(() => {
    syncDashboardFilterToUrl(appliedFilter);
    loadUserAnalytics(appliedRange);
    loadOverviewData(appliedRange);
  }, [appliedFilter, appliedRange, loadUserAnalytics, loadOverviewData]);

  const applyFilter = (preset, nextFromDate, nextToDate) => {
    const converted = convertThaiDateFilterToRange(nextFromDate, nextToDate);
    setRangePreset(preset);
    setFromDate(nextFromDate);
    setToDate(nextToDate);
    setAppliedFilter({
      preset,
      fromDate: nextFromDate,
      toDate: nextToDate,
      range: converted,
    });
  };

  const handlePresetChange = (preset) => {
    setFilterValidationError(null);
    setRangePreset(preset);
    if (preset === "custom") return;
    const dates = getCalendarDateRange(preset);
    applyFilter(preset, dates.fromDate, dates.toDate);
  };

  const handleApplyFilter = () => {
    if (!fromDate || !toDate) {
      setFilterValidationError("กรุณาระบุทั้งวันที่เริ่มต้นและวันที่สิ้นสุด");
      return;
    }
    if (fromDate > toDate) {
      setFilterValidationError("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
      return;
    }
    setFilterValidationError(null);
    applyFilter("custom", fromDate, toDate);
  };

  const handleResetFilters = () => {
    const dates = getCalendarDateRange(DEFAULT_RANGE_PRESET);
    setFilterValidationError(null);
    applyFilter(DEFAULT_RANGE_PRESET, dates.fromDate, dates.toDate);
  };

  const isUserAnalyticsEmpty =
    userAnalytics &&
    userAnalytics.activeUsers === 0 &&
    userAnalytics.newUsers === 0 &&
    (userAnalytics.hourlyUsage || []).every((h) => h.usageCount === 0);

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      {/* ── Filter Bar ── */}
      <div className="order-0 space-y-4 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-slate-800">
            <span className="material-symbols-outlined shrink-0 text-[20px] text-violet-600">
              calendar_today
            </span>
            <span className="text-sm font-semibold">
              ช่วงเวลาของข้อมูล Dashboard
            </span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <span className="material-symbols-outlined text-[15px]">sync</span>
            {salesOverview?.refreshedAt
              ? `อัปเดตล่าสุด ${formatUpdatedAt(salesOverview.refreshedAt)} น.`
              : "กำลังอัปเดตข้อมูล"}
          </span>
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2" aria-label="เลือกช่วงเวลา">
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  aria-pressed={rangePreset === preset.key}
                  onClick={() => handlePresetChange(preset.key)}
                  className={`h-10 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                    rangePreset === preset.key
                      ? "border-violet-600 bg-violet-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              ข้อมูลทุกการ์ดและทุกกราฟใช้ช่วงเดียวกัน:{" "}
              {formatSelectedRange(
                appliedFilter.fromDate,
                appliedFilter.toDate,
              )}
            </p>
          </div>
          {rangePreset === "custom" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                ตั้งแต่วันที่
                <input
                  type="date"
                  aria-label="วันที่เริ่มต้น"
                  value={fromDate}
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    setFilterValidationError(null);
                  }}
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 focus:border-violet-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                ถึงวันที่
                <input
                  type="date"
                  aria-label="วันที่สิ้นสุด"
                  value={toDate}
                  onChange={(event) => {
                    setToDate(event.target.value);
                    setFilterValidationError(null);
                  }}
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 focus:border-violet-500 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={handleApplyFilter}
                className="h-10 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
              >
                ใช้ช่วงเวลานี้
              </button>
            </div>
          )}
          {rangePreset !== DEFAULT_RANGE_PRESET && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="h-10 self-start rounded-lg px-3 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 xl:self-end"
            >
              กลับไปดู 7 วันล่าสุด
            </button>
          )}
        </div>
      </div>

      {filterValidationError && (
        <div className="order-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">info</span>
          <span>{filterValidationError}</span>
        </div>
      )}

      {/* ── Error Banner for Overview ── */}
      {error && (
        <div className="order-1 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-rose-600">
              error
            </span>
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="text-xs font-semibold underline hover:text-rose-900"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {/* ── Sales overview: the primary 5-second view ── */}
      <section
        className="order-2 space-y-4"
        aria-labelledby="sales-overview-title"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="sales-overview-title"
              className="text-base font-bold text-slate-900"
            >
              ภาพรวมยอดขาย
            </h2>
            <p className="text-xs text-slate-500">
              นับเฉพาะคำสั่งซื้อสำเร็จตามเวลาชำระเงินในช่วงที่เลือก
            </p>
          </div>
          <p className="text-[11px] text-slate-400">
            เทียบกับช่วงก่อนหน้าที่มีจำนวนวันเท่ากัน
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SalesKpiCard
            label="ยอดขายสุทธิรวม"
            data={salesOverview?.total}
            icon="monitoring"
            color="slate"
            className="xl:col-span-2"
            loading={loading}
            error={error}
          />
          <SalesKpiCard
            label="ยอดขายทั่วไป"
            data={salesOverview?.byType?.standard}
            icon="shopping_bag"
            color="sky"
            loading={loading}
            error={error}
          />
          <SalesKpiCard
            label="ยอดขายจากแคมเปญ"
            data={salesOverview?.byType?.campaign}
            icon="confirmation_number"
            color="violet"
            onClick={() => onNavigate?.("campaigns")}
            loading={loading}
            error={error}
          />
          <SalesKpiCard
            label="ยอดขายจากประมูล"
            data={salesOverview?.byType?.auction}
            icon="gavel"
            color="emerald"
            onClick={() => onNavigate?.("auctions")}
            loading={loading}
            error={error}
          />
        </div>
      </section>

      {/* ── User & Peak-Usage Analytics Section ── */}
      <div className="order-6 space-y-4 rounded-xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-violet-600">
              insights
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                สถิติผู้ใช้งานและช่วงเวลาการใช้งาน
              </h2>
              <p className="text-xs text-slate-500">
                วิเคราะห์พฤติกรรมผู้ใช้งานจริงและช่วงเวลาหนาแน่นเพื่อวางแผนโปรโมชัน
              </p>
            </div>
          </div>
          {userAnalytics?.range && (
            <span className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200/60 rounded-lg px-2.5 py-1">
              Timezone: {userAnalytics.range.timezone}
            </span>
          )}
        </div>

        {/* User Analytics Error Banner */}
        {userAnalyticsError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-rose-600">
                error
              </span>
              <span>{userAnalyticsError}</span>
            </div>
            <button
              onClick={() => loadUserAnalytics(appliedRange)}
              className="text-xs font-semibold underline hover:text-rose-900"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* User Analytics KPI Cards */}
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <KpiCard
            label="ผู้ใช้งานที่มีการใช้งาน (Active Users)"
            value={
              userAnalyticsLoading
                ? "…"
                : userAnalyticsError
                  ? "—"
                  : (userAnalytics?.activeUsers ?? 0).toLocaleString()
            }
            icon="group"
            color="indigo"
            sub={
              userAnalyticsError
                ? "ไม่พร้อมใช้งาน"
                : "ผู้ใช้ distinct ที่มีกิจกรรมจริง"
            }
          />
          <KpiCard
            label="ผู้ใช้งานใหม่ (New Users)"
            value={
              userAnalyticsLoading
                ? "…"
                : userAnalyticsError
                  ? "—"
                  : (userAnalytics?.newUsers ?? 0).toLocaleString()
            }
            icon="person_add"
            color="emerald"
            sub={
              userAnalyticsError ? "ไม่พร้อมใช้งาน" : "บัญชีที่สมัครในช่วงเวลา"
            }
          />
          <KpiCard
            label="ช่วงเวลาใช้งานสูงสุด (Peak Usage Hour)"
            value={
              userAnalyticsLoading
                ? "…"
                : userAnalyticsError
                  ? "ไม่พร้อมใช้งาน"
                  : formatPeakHour(userAnalytics?.peakHour)
            }
            icon="schedule"
            color="amber"
            sub={
              userAnalyticsLoading
                ? "…"
                : userAnalyticsError
                  ? "ไม่พร้อมใช้งาน"
                  : `${userAnalytics?.peakHour?.usageCount ?? 0} ผู้ใช้งาน active ในชั่วโมงนี้`
            }
          />
        </div>

        {/* Weekday × hour usage heatmap */}
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold text-slate-700">
            Heatmap การใช้งาน: {getUsageHeatmapTitle(heatmapMode)}
          </h3>
          {userAnalyticsLoading ? (
            <div className="flex h-44 items-center justify-center text-xs text-slate-400">
              กำลังโหลดข้อมูลสถิติการใช้งานรายชั่วโมง...
            </div>
          ) : userAnalyticsError ? (
            <div className="flex h-44 items-center justify-center text-xs text-rose-500">
              ไม่สามารถแสดงกราฟได้เนื่องจากเกิดข้อผิดพลาดในการโหลดข้อมูล
            </div>
          ) : isUserAnalyticsEmpty ? (
            <div className="flex h-44 flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[32px] text-slate-300">
                history_toggle_off
              </span>
              <p className="mt-1 text-xs font-medium text-slate-600">
                ยังไม่มีข้อมูลกิจกรรมผู้ใช้ในช่วงเวลาที่เลือก
              </p>
              <p className="text-[11px] text-slate-400">
                เมื่อมีผู้ใช้งานล็อกอินหรือใช้งานแอปพลิเคชัน
                ข้อมูลความหนาแน่นจะปรากฏที่นี่
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <UsageHeatmap
                hourlyUsage={userAnalytics?.hourlyUsage || []}
                mode={heatmapMode}
                fromDate={appliedFilter.fromDate}
                toDate={appliedFilter.toDate}
              />
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer text-violet-600 hover:text-violet-700 font-semibold select-none">
                  ดูตารางสถิติรายชั่วโมง (Accessible Table View)
                </summary>
                <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                  <table
                    className="w-full text-left text-xs"
                    aria-label="ตารางสถิติการใช้งานรายชั่วโมง"
                  >
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-1.5 font-semibold text-slate-700">
                          ช่วงเวลา (Hour)
                        </th>
                        <th className="px-3 py-1.5 text-right font-semibold text-slate-700">
                          จำนวนผู้ใช้งาน active (คน)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(userAnalytics?.hourlyUsage || []).map((item) => (
                        <tr key={item.hour} className="hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-mono text-slate-800">
                            {formatHourLabel(item.hour)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium text-slate-900">
                            {item.usageCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* ── Supporting operational KPIs ── */}
      <div className="order-3 grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <KpiCard
          label="คำสั่งซื้อสำเร็จทั้งหมด"
          value={
            loading
              ? "…"
              : error
                ? "—"
                : salesOverview?.total?.completedOrders?.toLocaleString("th-TH")
          }
          icon="shopping_bag"
          color="indigo"
          sub="รวมยอดขายทั่วไป แคมเปญ และประมูล"
        />
        <KpiCard
          label="ส่วนลดจากแคมเปญ"
          value={
            loading ? "…" : error ? "—" : formatMoney(metrics?.totalDiscount)
          }
          icon="loyalty"
          color="amber"
          onClick={() => onNavigate?.("campaigns")}
          sub="ส่วนลดที่ใช้สำเร็จในช่วงที่เลือก"
        />
        <KpiCard
          label="อัตราการใช้คูปองสำเร็จ"
          value={
            loading
              ? "…"
              : error
                ? "—"
                : `${metrics?.overallConversionRate || 0}%`
          }
          icon="trending_up"
          color="violet"
          onClick={() => onNavigate?.("campaigns")}
          sub="สิทธิ์ที่ใช้สำเร็จเทียบกับสิทธิ์ที่เก็บ"
        />
        <KpiCard
          label="คูปองเก็บ vs ใช้"
          value={
            loading
              ? "…"
              : error
                ? "—"
                : `${metrics?.totalClaimed || 0} / ${metrics?.totalRedeemed || 0}`
          }
          icon="confirmation_number"
          color="sky"
          onClick={() => onNavigate?.("campaigns")}
          sub="จำนวนสิทธิ์ที่เก็บ / ใช้สำเร็จ"
        />
        <KpiCard
          label="ผู้เข้าร่วมประมูล"
          value={
            loading
              ? "…"
              : error
                ? "—"
                : (auctionActivity?.distinctBidders || 0).toLocaleString()
          }
          icon="groups"
          color="violet"
          sub="ผู้เสนอราคาไม่ซ้ำในช่วงที่เลือก"
        />
        <KpiCard
          label="ร้านค้าที่มีกิจกรรม"
          value={
            loading
              ? "…"
              : error
                ? "—"
                : (auctionActivity?.activeStores || 0).toLocaleString()
          }
          icon="storefront"
          color="emerald"
          sub="ร้านที่ลงสินค้าหรือมีกิจกรรมประมูล"
        />
      </div>

      {/* ── Charts Grid ── */}
      <div className="order-4 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="ยอดขายสุทธิแยกตามประเภท" icon="bar_chart">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              กำลังคำนวณสัดส่วนยอดขาย...
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-xs text-rose-500">
              ไม่สามารถแสดงสัดส่วนยอดขายได้
            </div>
          ) : (
            <SalesMixChart
              byType={salesOverview?.byType}
              total={salesOverview?.total?.sales}
            />
          )}
        </ChartCard>

        {/* Sales Trend Line Chart */}
        <ChartCard title="แนวโน้มยอดขายจากแคมเปญรายวัน" icon="show_chart">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              กำลังคำนวณแนวโน้มยอดขาย...
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-xs text-rose-500">
              ไม่สามารถแสดงแนวโน้มยอดขายได้
            </div>
          ) : trendData.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              ยังไม่มียอดขายแคมเปญในช่วงเวลาที่เลือก
            </div>
          ) : (
            <TrendLineChart
              data={trendData}
              height={180}
              formatValue={(v) => `฿${v.toLocaleString("th-TH")}`}
            />
          )}
        </ChartCard>

        {/* Auction status comparison */}
        <ChartCard title="จำนวนรอบประมูลแยกตามสถานะ" icon="stacked_bar_chart">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              กำลังโหลดสถานะการประมูล...
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-xs text-rose-500">
              ไม่สามารถแสดงสถานะการประมูลได้
            </div>
          ) : auctionStatusData.every((item) => item.value === 0) ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              ไม่มีกิจกรรมประมูลในช่วงเวลาที่เลือก
            </div>
          ) : (
            <AuctionStatusBars data={auctionStatusData} />
          )}
        </ChartCard>
      </div>

      {/* ── Campaign Comparison & Performance Table ── */}
      <div className="order-5 rounded-xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-violet-600 shrink-0">
              table_chart
            </span>
            <span className="truncate">
              ตารางเปรียบเทียบประสิทธิภาพแคมเปญ (Campaign Comparison)
            </span>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate("campaigns")}
              className="text-xs font-semibold text-violet-600 hover:text-violet-700 hover:underline shrink-0 text-left sm:text-right"
            >
              จัดการแคมเปญทั้งหมด &rarr;
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            กำลังโหลดข้อมูลประสิทธิภาพแคมเปญ...
          </div>
        ) : error ? (
          <div className="py-12 text-center text-xs text-rose-500">
            ไม่สามารถโหลดตารางประสิทธิภาพแคมเปญได้
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-12 text-center">
            <span className="material-symbols-outlined text-[36px] text-slate-300">
              confirmation_number
            </span>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              ยังไม่มีข้อมูลการใช้ออเดอร์ในแคมเปญ
            </p>
            <p className="mt-1 text-xs text-slate-400">
              เมื่อมีการสั่งซื้อที่ใช้คูปองเสร็จสมบูรณ์
              ตัวเลขยอดขายและการแปลงสิทธิ์จะปรากฏที่นี่
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[720px] text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">รหัส / ชื่อแคมเปญ</th>
                  <th className="px-3 py-2.5 text-center">
                    เก็บคูปอง (Claimed)
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    ใช้สำเร็จ (Redeemed)
                  </th>
                  <th className="px-3 py-2.5 text-center">Orders สำเร็จ</th>
                  <th className="px-3 py-2.5 text-right">ยอดขายรวม (Gross)</th>
                  <th className="px-3 py-2.5 text-right">ส่วนลด (Discount)</th>
                  <th className="px-3 py-2.5 text-right">ยอดสุทธิ (Net)</th>
                  <th className="px-3 py-2.5 text-center font-bold text-violet-700">
                    Conversion %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr
                    key={c.campaignId}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-900">
                        {c.campaignCode || formatReferenceCode(c.campaignId)}
                      </div>
                      {c.campaignName && (
                        <div className="text-[11px] text-slate-500">
                          {c.campaignName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-slate-800">
                      {c.claimedCount ?? 0}
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-emerald-600">
                      {c.redeemedCount ?? 0}
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-slate-800">
                      {c.completedOrders ?? 0}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-slate-900">
                      ฿{(c.grossRevenue || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-amber-600">
                      ฿{(c.totalDiscount || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-600">
                      ฿{(c.netRevenue || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-violet-700">
                      {c.conversionRate ?? 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Auction Pipeline Quick KPI Cards (Retained for completeness) ── */}
      <div className="order-7 border-t border-slate-200/60 pt-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          การจัดการรอบประมูล (Auction Workspace Quick Stats)
        </h3>
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="รอการอนุมัติ (Marketing)"
            value={error ? "—" : auctionStats.pendingApproval}
            icon="pending_actions"
            color="amber"
            onClick={() => onNavigate?.("auctions")}
            sub="รอตรวจสอบสินค้าประมูล"
          />
          <KpiCard
            label="อนุมัติแล้ว พร้อมเปิด"
            value={error ? "—" : auctionStats.approved}
            icon="event_available"
            color="sky"
            onClick={() => onNavigate?.("auctions")}
            sub="รอจัดรอบประมูล"
          />
          <KpiCard
            label="ตั้งเวลาแล้ว"
            value={error ? "—" : auctionStats.scheduled}
            icon="schedule"
            color="indigo"
            onClick={() => onNavigate?.("auctions")}
            sub="รอเปิดตามเวลา"
          />
          <KpiCard
            label="กำลังประมูลสด"
            value={error ? "—" : auctionStats.open}
            icon="gavel"
            color="emerald"
            onClick={() => onNavigate?.("auctions")}
            sub="เปิดประมูลอยู่ตอนนี้"
          />
        </div>
      </div>
    </div>
  );
}
