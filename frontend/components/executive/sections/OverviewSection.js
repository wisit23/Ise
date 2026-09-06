"use client";
import { useEffect, useMemo, useState } from "react";
import MetricCard from "../MetricCard";
import DualTrendChart from "../DualTrendChart";
import RankingList from "../RankingList";
import ChartCard from "../../panel/ui/ChartCard";
import { apiFetch } from "../../../lib/api";
import {
  baht,
  buildPath,
  fetchWindowMetrics,
  fulfilled,
  growthPct,
  monthWindow,
  MONTH_NAMES,
  PROVIDERS,
} from "../../../lib/executive";

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

// ─── Overview Section ───────────────────────────────────────────────────────
// Compact, single-screen dashboard layout for executives:
// Row 1: 4 Key KPIs + 4 Secondary stats
// Row 2: GMV Trend and Platform Revenue Trend (12 months of current year, side-by-side)
// Row 3: Top Categories and Top Products rankings (side-by-side)

export default function OverviewSection({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const currentYear = new Date().getUTCFullYear();
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [rankings, setRankings] = useState(null);
  const [dualTrend, setDualTrend] = useState([]);

  useEffect(() => {
    const now = new Date();
    const currentWindow = monthWindow(now.getUTCFullYear(), now.getUTCMonth());
    const previousWindow = monthWindow(
      now.getUTCFullYear(),
      now.getUTCMonth() - 1,
    );

    const yearWindows = Array.from({ length: 12 }, (_, m) => ({
      ...monthWindow(currentYear, m),
      shortLabel: THAI_MONTHS_SHORT[m],
      fullLabel: `${MONTH_NAMES[m]} ${currentYear + 543}`,
    }));

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchWindowMetrics(currentWindow, token),
      fetchWindowMetrics(previousWindow, token),
      Promise.allSettled(
        yearWindows.map((win) =>
          Promise.all([
            apiFetch(buildPath(PROVIDERS.order, win), { token }),
            apiFetch(buildPath(PROVIDERS.auth, win), { token }),
          ]),
        ),
      ),
      Promise.allSettled([
        apiFetch(
          buildPath("/api/products/executive/top-catalog", currentWindow),
          { token },
        ),
      ]),
    ])
      .then(([cur, prev, yearSettled, rankingSettled]) => {
        if (cancelled) return;

        setCurrent(cur);
        setPrevious(prev);
        setRankings(fulfilled(rankingSettled[0]));

        const dualSeries = yearWindows.map((win, i) => {
          const pair = fulfilled(yearSettled[i]);
          const orderData = pair ? pair[0]?.data : undefined;
          return {
            label: win.shortLabel,
            shortLabel: win.shortLabel,
            fullLabel: win.fullLabel,
            gmv: orderData?.gmv ?? 0,
            platformRevenue: orderData?.platformRevenue ?? 0,
            unavailable: pair === null || pair[0] === undefined,
          };
        });

        setDualTrend(dualSeries);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [token, currentYear]);

  const { primaryCards, secondaryCards } = useMemo(() => {
    if (!current) return { primaryCards: [], secondaryCards: [] };
    const o = current.order?.data;
    const po = previous?.order?.data;
    const a = current.auth?.data;
    const pa = previous?.auth?.data;
    const p = current.product?.data;
    const pp = previous?.product?.data;

    return {
      primaryCards: [
        {
          key: "gmv",
          label: "ยอดขายรวม (GMV)",
          value: o?.gmv,
          unavailable: !current.order,
          delta: growthPct(o?.gmv, po?.gmv),
          formatValue: baht,
        },
        {
          key: "platformRevenue",
          label: "รายได้แพลตฟอร์ม",
          value: o?.platformRevenue,
          unavailable: !current.order,
          delta: growthPct(o?.platformRevenue, po?.platformRevenue),
          formatValue: baht,
        },
        {
          key: "completedOrders",
          label: "คำสั่งซื้อสำเร็จ",
          value: o?.completedOrders,
          unavailable: !current.order,
          delta: growthPct(o?.completedOrders, po?.completedOrders),
        },
        {
          key: "activeUsers",
          label: "ผู้ใช้งานที่ล็อกอิน (เดือนนี้)",
          value: a?.activeUsers,
          unavailable: !current.auth,
          delta: growthPct(a?.activeUsers, pa?.activeUsers),
        },
      ],
      secondaryCards: [
        {
          key: "newUsers",
          label: "ผู้ใช้งานใหม่",
          value: a?.newUsers,
          unavailable: !current.auth,
        },
        {
          key: "activeListings",
          label: "สินค้าพร้อมขายตอนนี้",
          value: p?.activeListings,
          unavailable: !current.product,
        },
        {
          key: "newListings",
          label: "สินค้าลงขายใหม่",
          value: p?.newListings,
          unavailable: !current.product,
        },
        {
          key: "soldListings",
          label: "สินค้าขายได้",
          value: p?.soldListings,
          unavailable: !current.product,
        },
      ],
    };
  }, [current, previous]);

  if (loading) {
    return <p className="text-slate-500">กำลังโหลด...</p>;
  }

  return (
    <div className="animate-fade-in-up space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ── 1. KPI Cards (4 Primary Cards + 4 Compact Secondary Stats) ── */}
      <div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {primaryCards.map((c) => (
            <MetricCard
              key={c.key}
              label={c.label}
              value={c.value}
              unavailable={c.unavailable}
              deltaPct={c.delta}
              formatValue={c.formatValue}
            />
          ))}
        </div>
        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {secondaryCards.map((c) => (
            <div
              key={c.key}
              className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white px-3 py-1.5 shadow-2xs text-xs"
            >
              <span className="text-slate-500 font-medium truncate mr-2">
                {c.label}
              </span>
              <span className="font-bold text-slate-800 shrink-0">
                {c.unavailable
                  ? "ไม่พร้อมใช้งาน"
                  : (c.value?.toLocaleString("th-TH") ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. 12-Month Combined Trend (GMV & Platform Revenue in one chart) ── */}
      <div>
        <ChartCard
          title={`แนวโน้มยอดขายรวมและรายได้แพลตฟอร์ม — 12 เดือน (ปี ${currentYear + 543})`}
          icon="query_stats"
        >
          <DualTrendChart
            data={dualTrend}
            formatValue={baht}
            label="แนวโน้มยอดขายรวม (GMV) และรายได้แพลตฟอร์ม"
          />
        </ChartCard>
      </div>

      {/* ── 3. Top Rankings (Categories & Products Side-by-Side) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="หมวดหมู่ที่ขายดีที่สุด" icon="category">
          <p className="mb-2 -mt-2 text-xs text-slate-500">
            จัดอันดับจากยอดขายในเดือนนี้
          </p>
          <RankingList
            rows={rankings?.data?.categories}
            unavailable={!rankings}
            emptyText="ยังไม่มีสินค้าที่ขายได้ในเดือนนี้"
          />
        </ChartCard>

        <ChartCard title="สินค้าที่ทำรายได้สูงสุด" icon="workspace_premium">
          <p className="mb-2 -mt-2 text-xs text-slate-500">
            จัดอันดับจากยอดขายในเดือนนี้
          </p>
          <RankingList
            rows={rankings?.data?.products}
            unavailable={!rankings}
            emptyText="ยังไม่มีสินค้าที่ขายได้ในเดือนนี้"
          />
        </ChartCard>
      </div>
    </div>
  );
}
