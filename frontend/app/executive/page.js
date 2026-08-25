"use client";

import { useEffect, useMemo, useState } from "react";
import ExecutiveShell from "../../components/executive/ExecutiveShell";
import MetricCard from "../../components/executive/MetricCard";
import TrendChart from "../../components/executive/TrendChart";
import RankingList from "../../components/executive/RankingList";
import { CATEGORICAL } from "../../components/charts/palette";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  baht,
  buildPath,
  fetchWindowMetrics,
  fulfilled,
  growthPct,
  lastNWindows,
  PROVIDERS,
} from "../../lib/executive";

const TREND_PERIODS = 6;

function OverviewContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [rankings, setRankings] = useState(null);
  const [meta, setMeta] = useState(null);
  const [trend, setTrend] = useState({ gmv: [], activeUsers: [] });

  useEffect(() => {
    const token = getAccessToken();
    const windows = lastNWindows("month", TREND_PERIODS);
    const currentWindow = windows[windows.length - 1];
    const previousWindow = windows[windows.length - 2];

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchWindowMetrics(currentWindow, token),
      fetchWindowMetrics(previousWindow, token),
      Promise.allSettled(
        windows
          .slice(0, -1)
          .map((win) =>
            Promise.all([
              apiFetch(buildPath(PROVIDERS.order, win), { token }),
              apiFetch(buildPath(PROVIDERS.auth, win), { token }),
            ]),
          ),
      ),
      Promise.allSettled([
        apiFetch(
          buildPath("/api/products/executive/top-catalog", currentWindow),
          {
            token,
          },
        ),
      ]),
    ])
      .then(([cur, prev, trendSettled, rankingSettled]) => {
        if (cancelled) return;

        setCurrent(cur);
        setPrevious(prev);
        setMeta(cur.auth?.meta || cur.order?.meta || cur.product?.meta || null);
        setRankings(fulfilled(rankingSettled[0]));

        const olderWindows = windows.slice(0, -1);
        const buildSeries = (pick, currentValue) => [
          ...olderWindows.map((win, i) => {
            const pair = fulfilled(trendSettled[i]);
            const value = pair ? pick(pair) : undefined;
            return {
              label: win.label,
              value: value ?? 0,
              unavailable: value === undefined,
            };
          }),
          {
            label: currentWindow.label,
            value: currentValue ?? 0,
            unavailable: currentValue === undefined,
          },
        ];

        setTrend({
          gmv: buildSeries(([order]) => order?.data?.gmv, cur.order?.data?.gmv),
          activeUsers: buildSeries(
            ([, auth]) => auth?.data?.activeUsers,
            cur.auth?.data?.activeUsers,
          ),
        });
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => {
    if (!current) return [];
    const o = current.order?.data;
    const po = previous?.order?.data;
    const a = current.auth?.data;
    const pa = previous?.auth?.data;
    const p = current.product?.data;
    const pp = previous?.product?.data;

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
      {
        key: "newUsers",
        label: "ผู้ใช้งานใหม่",
        value: a?.newUsers,
        unavailable: !current.auth,
        delta: growthPct(a?.newUsers, pa?.newUsers),
      },
      {
        key: "newListings",
        label: "สินค้าลงขายใหม่",
        value: p?.newListings,
        unavailable: !current.product,
        delta: growthPct(p?.newListings, pp?.newListings),
      },
      {
        key: "soldListings",
        label: "สินค้าขายได้",
        value: p?.soldListings,
        unavailable: !current.product,
        delta: growthPct(p?.soldListings, pp?.soldListings),
      },
      {
        key: "activeListings",
        label: "สินค้าพร้อมขายตอนนี้",
        value: p?.activeListings,
        unavailable: !current.product,
        delta: null,
      },
    ];
  }, [current, previous]);

  if (loading) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            แนวโน้มยอดขายรวม (GMV) — {TREND_PERIODS} เดือนล่าสุด
          </h2>
          <TrendChart
            data={trend.gmv}
            color={CATEGORICAL[0]}
            formatValue={baht}
            label="แนวโน้มยอดขายรวม (GMV)"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            แนวโน้มผู้ใช้งานที่ล็อกอิน — {TREND_PERIODS} เดือนล่าสุด
          </h2>
          <TrendChart
            data={trend.activeUsers}
            color={CATEGORICAL[2]}
            label="แนวโน้มผู้ใช้งานที่ล็อกอิน"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">
            หมวดหมู่ที่ขายดีที่สุด
          </h2>
          <p className="mb-3 text-xs text-gray-400">
            จัดอันดับจากยอดขายในเดือนนี้
          </p>
          <RankingList
            rows={rankings?.data?.categories}
            unavailable={!rankings}
            emptyText="ยังไม่มีสินค้าที่ขายได้ในเดือนนี้"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">
            สินค้าที่ทำรายได้สูงสุด
          </h2>
          <p className="mb-3 text-xs text-gray-400">
            จัดอันดับจากยอดขายในเดือนนี้
          </p>
          <RankingList
            rows={rankings?.data?.products}
            unavailable={!rankings}
            emptyText="ยังไม่มีสินค้าที่ขายได้ในเดือนนี้"
          />
        </div>
      </div>
    </>
  );
}

export default function ExecutiveDashboardPage() {
  return (
    <ExecutiveShell title="แดชบอร์ดผู้บริหาร" activeTab="/executive">
      <OverviewContent />
    </ExecutiveShell>
  );
}
