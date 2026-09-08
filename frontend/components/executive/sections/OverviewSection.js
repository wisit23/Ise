"use client";
import { useEffect, useMemo, useState } from "react";
import MetricCard from "../MetricCard";
import TrendLineChart from "../TrendLineChart";
import RankingList from "../RankingList";
import ChartCard from "../../panel/ui/ChartCard";
import { apiFetch } from "../../../lib/api";
import {
  baht,
  buildPath,
  fetchWindowMetrics,
  fulfilled,
  growthPct,
  lastNWindows,
  monthWindow,
  PROVIDERS,
} from "../../../lib/executive";

/** Helper to extract metric time-series from settled promises */
function extractSeries(windows, settledResults, fieldKey) {
  return windows.map((win, i) => {
    const pair = fulfilled(settledResults[i]);
    const orderData = pair ? pair[0]?.data : undefined;
    return {
      label: win.shortLabel,
      shortLabel: win.shortLabel,
      fullLabel: win.fullLabel,
      value: orderData?.[fieldKey] ?? 0,
      unavailable: pair === null || pair[0] === undefined,
    };
  });
}

// ─── Overview Section ───────────────────────────────────────────────────────
// Clean, single-screen dashboard layout:
// Row 1: The Golden 4 KPI Cards
// Row 2: 6-Month Line Charts (GMV & Revenue side-by-side with direct data labels)
// Row 3: Top Categories and Top Products rankings (side-by-side)

export default function OverviewSection({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [rankings, setRankings] = useState(null);
  const [trend, setTrend] = useState({ gmv: [], revenue: [] });

  useEffect(() => {
    const now = new Date();
    const currentWindow = monthWindow(now.getUTCFullYear(), now.getUTCMonth());
    const previousWindow = monthWindow(
      now.getUTCFullYear(),
      now.getUTCMonth() - 1,
    );

    const recentWindows = lastNWindows("month", 6).map((win) => ({
      ...win,
      shortLabel: win.label,
      fullLabel: win.longLabel,
    }));

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchWindowMetrics(currentWindow, token),
      fetchWindowMetrics(previousWindow, token),
      Promise.allSettled(
        recentWindows.map((win) =>
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
      .then(([cur, prev, recentSettled, rankingSettled]) => {
        if (cancelled) return;

        setCurrent(cur);
        setPrevious(prev);
        setRankings(fulfilled(rankingSettled[0]));

        setTrend({
          gmv: extractSeries(recentWindows, recentSettled, "gmv"),
          revenue: extractSeries(recentWindows, recentSettled, "platformRevenue"),
        });
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [token]);

  const cards = useMemo(() => {
    if (!current) return [];
    const o = current.order?.data;
    const po = previous?.order?.data;
    const a = current.auth?.data;
    const pa = previous?.auth?.data;

    return [
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
    ];
  }, [current, previous]);

  if (loading) {
    return <p className="text-slate-500">กำลังโหลด...</p>;
  }

  return (
    <div className="animate-fade-in-up space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ── 1. The Golden 4 KPI Cards (Clean Single Row) ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
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

      {/* ── 2. 6-Month Line Charts: GMV & Platform Revenue Side-by-Side ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="แนวโน้มยอดขายรวม (GMV) — 6 เดือนล่าสุด"
          icon="payments"
        >
          <TrendLineChart
            data={trend.gmv}
            color="#3b82f6"
            formatValue={baht}
            label="แนวโน้มยอดขายรวม (GMV)"
          />
        </ChartCard>

        <ChartCard
          title="แนวโน้มรายได้แพลตฟอร์ม — 6 เดือนล่าสุด"
          icon="account_balance_wallet"
        >
          <TrendLineChart
            data={trend.revenue}
            color="#10b981"
            formatValue={baht}
            label="แนวโน้มรายได้แพลตฟอร์ม"
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
