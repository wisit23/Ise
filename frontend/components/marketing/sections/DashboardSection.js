"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch, getMarketingUserAnalytics } from "../../../lib/api";
import KpiCard from "../../panel/ui/KpiCard";
import ChartCard from "../../panel/ui/ChartCard";
import DonutChart from "../../charts/DonutChart";
import TrendBarChart from "../../charts/TrendBarChart";

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
    timeZone: "Asia/Bangkok",
    month: "short",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
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
    timeZone: "Asia/Bangkok",
    month: "numeric",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
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

  return { from, to, timezone: "Asia/Bangkok" };
}

export { formatPeakHour, formatHourLabel };

export default function DashboardSection({ token, onNavigate }) {
  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Loading & Error states for Campaign/Overview
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // User Analytics states (UR-08) — independent error handling
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

  // Applied filter range for API queries (null means default 7 days)
  const [appliedRange, setAppliedRange] = useState(null);
  const [filterValidationError, setFilterValidationError] = useState(null);

  const loadUserAnalytics = useCallback(
    async (targetRange = appliedRange) => {
      setUserAnalyticsLoading(true);
      setUserAnalyticsError(null);
      try {
        const params = targetRange
          ? {
              from: targetRange.from,
              to: targetRange.to,
              timezone: "Asia/Bangkok",
            }
          : { timezone: "Asia/Bangkok" };
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
    [token, appliedRange],
  );

  const loadOverviewData = useCallback(
    async (targetRange = appliedRange) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (targetRange?.from) queryParams.set("from", targetRange.from);
        if (targetRange?.to) queryParams.set("to", targetRange.to);
        const queryStr = queryParams.toString()
          ? `?${queryParams.toString()}`
          : "";

        // 1. Fetch Overview Metrics
        const overviewRes = await apiFetch(
          `/api/products/campaigns/metrics/overview${queryStr}`,
          { token },
        ).catch(() => ({
          completedOrders: 0,
          grossRevenue: 0,
          totalDiscount: 0,
          netRevenue: 0,
          totalClaimed: 0,
          totalRedeemed: 0,
          overallConversionRate: 0,
        }));
        setMetrics(overviewRes);

        // 2. Fetch Sales Trends
        const trendsRes = await apiFetch(
          `/api/products/campaigns/metrics/trends${queryStr}`,
          { token },
        ).catch(() => ({ series: [] }));
        const formattedTrends = (trendsRes.series || []).map((item) => ({
          label: item.date ? item.date.slice(5) : "-", // MM-DD
          value: item.grossRevenue || 0,
        }));
        setTrendData(formattedTrends);

        // 3. Fetch Campaign Comparison
        const compareRes = await apiFetch(
          `/api/products/campaigns/metrics/compare${queryStr}`,
          { token },
        ).catch(() => ({ comparisons: [] }));
        setCampaigns(compareRes.comparisons || []);

        // 4. Fetch Auction Status for Pipeline
        const fc = (status) =>
          apiFetch(`/api/products/auctions?status=${status}&limit=1`, { token })
            .then((d) => d.total)
            .catch(() => 0);

        const [pApp, app, sch, op] = await Promise.all([
          fc("pending_approval"),
          fc("approved"),
          fc("scheduled"),
          fc("open"),
        ]);
        setAuctionStats({
          pendingApproval: pApp,
          approved: app,
          scheduled: sch,
          open: op,
        });

        const donutValues = await Promise.all(
          Object.keys(DONUT_LABEL).map((st) => fc(st)),
        );
        setAuctionStatusData(
          Object.keys(DONUT_LABEL).map((st, idx) => ({
            label: DONUT_LABEL[st],
            value: donutValues[idx] || 0,
            color: DONUT_COLORS[st],
          })),
        );
      } catch (err) {
        setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล Dashboard");
      } finally {
        setLoading(false);
      }
    },
    [token, appliedRange],
  );

  const loadData = useCallback(() => {
    loadUserAnalytics(appliedRange);
    loadOverviewData(appliedRange);
  }, [loadUserAnalytics, loadOverviewData, appliedRange]);

  useEffect(() => {
    loadUserAnalytics(null);
    loadOverviewData(null);
  }, [token]);

  const handleApplyFilter = () => {
    if (!fromDate && !toDate) {
      setFilterValidationError(null);
      setAppliedRange(null);
      loadUserAnalytics(null);
      loadOverviewData(null);
      return;
    }
    if (!fromDate || !toDate) {
      setFilterValidationError("กรุณาระบุทั้งวันที่เริ่มต้นและวันที่สิ้นสุด");
      return;
    }
    if (fromDate > toDate) {
      setFilterValidationError("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
      return;
    }
    setFilterValidationError(null);
    const converted = convertThaiDateFilterToRange(fromDate, toDate);
    setAppliedRange(converted);
    loadUserAnalytics(converted);
    loadOverviewData(converted);
  };

  const handleResetFilters = () => {
    setFromDate("");
    setToDate("");
    setFilterValidationError(null);
    setAppliedRange(null);
    loadUserAnalytics(null);
    loadOverviewData(null);
  };

  const formattedHourlyData = (userAnalytics?.hourlyUsage || []).map(
    (item) => ({
      label: formatHourLabel(item.hour),
      value: item.usageCount || 0,
    }),
  );

  const isUserAnalyticsEmpty =
    userAnalytics &&
    userAnalytics.activeUsers === 0 &&
    userAnalytics.newUsers === 0 &&
    (userAnalytics.hourlyUsage || []).every((h) => h.usageCount === 0);

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── Filter Bar ── */}
      <div className="flex flex-col gap-3.5 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-slate-800 min-w-0">
          <span className="material-symbols-outlined text-[20px] text-violet-600 shrink-0">
            calendar_today
          </span>
          <span className="text-xs sm:text-sm font-semibold truncate">
            ช่วงเวลาการวัดผล (Attribution Window)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="shrink-0">ตั้งแต่:</span>
            <input
              type="date"
              aria-label="วันที่เริ่มต้น"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setFilterValidationError(null);
              }}
              className="w-full sm:w-auto rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="shrink-0">ถึง:</span>
            <input
              type="date"
              aria-label="วันที่สิ้นสุด"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setFilterValidationError(null);
              }}
              className="w-full sm:w-auto rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            {(fromDate || toDate) && (
              <button
                onClick={handleResetFilters}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                ล้างตัวกรอง
              </button>
            )}
            <button
              onClick={handleApplyFilter}
              className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">
                refresh
              </span>
              ค้นหา / รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {filterValidationError && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">info</span>
          <span>{filterValidationError}</span>
        </div>
      )}

      {/* ── Error Banner for Overview ── */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between">
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

      {/* ── User & Peak-Usage Analytics Section (UR-08) ── */}
      <div className="space-y-4 rounded-xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-violet-600">
              insights
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                สถิติผู้ใช้งานและช่วงเวลาการใช้งาน (User & Peak-Usage Analytics)
              </h2>
              <p className="text-xs text-slate-500">
                วิเคราะห์พฤติกรรมผู้ใช้งานจริงและช่วงเวลาหนาแน่นเพื่อวางแผนโปรโมชัน
                (UR-08)
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

        {/* Hourly Usage Chart & Table Fallback */}
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold text-slate-700">
            กราฟแสดงการใช้งานรายชั่วโมง (Hourly Usage)
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
              <TrendBarChart
                data={formattedHourlyData}
                height={180}
                formatValue={(v) => `${v.toLocaleString("th-TH")} คน`}
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

      {/* ── Conversion & Revenue KPI Row ── */}
      <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <KpiCard
          label="คำสั่งซื้อสำเร็จ"
          value={loading ? "…" : metrics.completedOrders?.toLocaleString()}
          icon="shopping_bag"
          color="indigo"
          sub="Attributed Orders"
        />
        <KpiCard
          label="ยอดขายรวม (Gross)"
          value={
            loading ? "…" : `฿${(metrics.grossRevenue || 0).toLocaleString()}`
          }
          icon="payments"
          color="sky"
          sub="ก่อนหักส่วนลด"
        />
        <KpiCard
          label="ส่วนลดทั้งหมด"
          value={
            loading ? "…" : `฿${(metrics.totalDiscount || 0).toLocaleString()}`
          }
          icon="loyalty"
          color="amber"
          sub="งบแคมเปญที่ใช้จริง"
        />
        <KpiCard
          label="ยอดขายสุทธิ (Net)"
          value={
            loading ? "…" : `฿${(metrics.netRevenue || 0).toLocaleString()}`
          }
          icon="account_balance_wallet"
          color="emerald"
          sub="หลังหักส่วนลด"
        />
        <KpiCard
          label="Conversion Rate"
          value={loading ? "…" : `${metrics.overallConversionRate || 0}%`}
          icon="trending_up"
          color="violet"
          sub="ใช้จริง / เก็บสิทธิ์"
        />
        <KpiCard
          label="คูปองเก็บ vs ใช้"
          value={
            loading
              ? "…"
              : `${metrics.totalClaimed || 0} / ${metrics.totalRedeemed || 0}`
          }
          icon="confirmation_number"
          color="sky"
          sub="Claimed vs Redeemed"
        />
      </div>

      {/* ── Charts Grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sales Trend Bar Chart */}
        <ChartCard
          title="แนวโน้มยอดขายแคมเปญรายวัน (Gross Sales Trend)"
          icon="bar_chart"
        >
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              กำลังคำนวณแนวโน้มยอดขาย...
            </div>
          ) : trendData.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              ยังไม่มียอดขายแคมเปญในช่วงเวลาที่เลือก
            </div>
          ) : (
            <TrendBarChart
              data={trendData}
              height={180}
              formatValue={(v) => `฿${v.toLocaleString("th-TH")}`}
            />
          )}
        </ChartCard>

        {/* Auction Pipeline Donut */}
        <ChartCard
          title="สัดส่วนสถานะการประมูล (Auction Pipeline)"
          icon="donut_small"
        >
          <DonutChart data={auctionStatusData} size={170} strokeWidth={38} />
        </ChartCard>
      </div>

      {/* ── Campaign Comparison & Performance Table ── */}
      <div className="rounded-xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
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
                        {c.campaignCode || c.campaignId}
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
      <div className="border-t border-slate-200/60 pt-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          การจัดการรอบประมูล (Auction Workspace Quick Stats)
        </h3>
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="รอการอนุมัติ (Marketing)"
            value={auctionStats.pendingApproval}
            icon="pending_actions"
            color="amber"
            onClick={() => onNavigate?.("auctions")}
            sub="รอตรวจสอบสินค้าประมูล"
          />
          <KpiCard
            label="อนุมัติแล้ว พร้อมเปิด"
            value={auctionStats.approved}
            icon="event_available"
            color="sky"
            onClick={() => onNavigate?.("auctions")}
            sub="รอจัดรอบประมูล"
          />
          <KpiCard
            label="ตั้งเวลาแล้ว"
            value={auctionStats.scheduled}
            icon="schedule"
            color="indigo"
            onClick={() => onNavigate?.("auctions")}
            sub="รอเปิดตามเวลา"
          />
          <KpiCard
            label="กำลังประมูลสด"
            value={auctionStats.open}
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
