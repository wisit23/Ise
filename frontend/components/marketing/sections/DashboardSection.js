"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../../../lib/api";
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

export default function DashboardSection({ token, onNavigate }) {
  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (fromDate) queryParams.set("from", fromDate);
      if (toDate) queryParams.set("to", toDate);
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
  }, [token, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleResetFilters = () => {
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── Filter Bar ── */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-slate-800">
          <span className="material-symbols-outlined text-[20px] text-violet-600">
            calendar_today
          </span>
          <span className="text-sm font-semibold">
            ช่วงเวลาการวัดผล (Attribution Window)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>ตั้งแต่:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>ถึง:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-violet-500 focus:outline-none"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={handleResetFilters}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              ล้างตัวกรอง
            </button>
          )}
          <button
            onClick={loadData}
            className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">
              refresh
            </span>
            รีเฟรช
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
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

      {/* ── Conversion & Revenue KPI Row ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
      <div className="rounded-xl border border-slate-200/70 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span className="material-symbols-outlined text-[20px] text-violet-600">
              table_chart
            </span>
            <span>ตารางเปรียบเทียบประสิทธิภาพแคมเปญ (Campaign Comparison)</span>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate("campaigns")}
              className="text-xs font-semibold text-violet-600 hover:text-violet-700 hover:underline"
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
