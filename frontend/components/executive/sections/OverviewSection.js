"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import MetricCard from "../MetricCard";
import TrendLineChart from "../TrendLineChart";
import PopularCategories from "../PopularCategories";
import CategoryDonut, {
  COLLAPSED_SLICES,
  EXPANDED_SLICES,
} from "../CategoryDonut";
import OrderStatusDonut from "../OrderStatusDonut";
import ChartCard from "../../panel/ui/ChartCard";
import { CHART_COLORS } from "../../charts/palette";
import DayField from "../DayField";
import MoreToggle from "../MoreToggle";
import PeriodTabs from "../PeriodTabs";
import {
  baht,
  fetchOverview,
  customDayError,
  defaultCustomDay,
  describeMode,
  PERIOD_MODES,
  growthPct,
  feePercent,
} from "../../../lib/executive";

// ─── Overview Section ───────────────────────────────────────────────────────
// One period picker (this month / this year / last 7 days) drives everything:
// Row 1: KPI cards, compared with an equally long previous period
// Row 2: a sales trend of whole periods beside the paid orders by status
// Row 3: the rankings

export default function OverviewSection({ token }) {
  const [mode, setMode] = useState("week");
  // The day picked in the date field, which is always on the page. It only
  // takes effect when "กำหนดเอง" is the chosen period: pressing that button
  // applies it, and while it is chosen a new day applies at once. A half-typed
  // or invalid date never blanks the page or refetches; the overview keeps the
  // last good day.
  const [draft, setDraft] = useState(() => defaultCustomDay());
  const draftError = customDayError(draft);
  const lastValid = useRef(draft);
  if (mode === "custom" && !draftError) lastValid.current = draft;
  const custom = lastValid.current;
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  // "ดูเพิ่มเติม": the popular list grows from 5 to 10 rows; the category ring
  // names 10 categories instead of 5 and folds fewer into "other".
  const [popularOpen, setPopularOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOverview(mode, token, new Date(), custom)
      .then((result) => {
        if (!cancelled) setOverview(result);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, token, custom]);

  const modeInfo = describeMode(mode, custom);
  const popular = overview?.rankings?.popularCategories;
  const popularRows = popular
    ? popular.slice(0, popularOpen ? EXPANDED_SLICES : COLLAPSED_SLICES)
    : null;

  const cards = useMemo(() => {
    if (!overview) return [];
    const { order, auth } = overview;
    const fee = feePercent(overview.feeRate);
    const o = order?.current;
    const po = order?.previous;
    const a = auth?.current;
    const pa = auth?.previous;

    return [
      {
        key: "gmvPurchase",
        label: "ยอดขายจากการสั่งซื้อ",
        value: o?.gmvPurchase,
        unavailable: !order || o?.gmvPurchase === undefined,
        delta: growthPct(o?.gmvPurchase, po?.gmvPurchase),
        noBaseline: po?.gmvPurchase === 0,
        formatValue: baht,
      },
      {
        key: "gmvAuction",
        label: "ยอดขายจากการประมูล",
        value: o?.gmvAuction,
        unavailable: !order || o?.gmvAuction === undefined,
        delta: growthPct(o?.gmvAuction, po?.gmvAuction),
        noBaseline: po?.gmvAuction === 0,
        formatValue: baht,
      },
      {
        key: "platformRevenue",
        label: fee === null ? "รายได้แพลตฟอร์ม" : `รายได้แพลตฟอร์ม (${fee}%)`,
        value: o?.platformRevenue,
        unavailable: !order,
        delta: growthPct(o?.platformRevenue, po?.platformRevenue),
        noBaseline: po?.platformRevenue === 0,
        formatValue: baht,
      },
      {
        key: "activeUsers",
        label: `ผู้ใช้งานเว็บ (${modeInfo.periodName})`,
        value: a?.activeUsers,
        unavailable: !auth,
        delta: growthPct(a?.activeUsers, pa?.activeUsers),
        noBaseline: pa?.activeUsers === 0,
      },
    ];
  }, [overview, modeInfo]);

  return (
    <div className="animate-fade-in-up space-y-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <PeriodTabs options={PERIOD_MODES} value={mode} onChange={setMode} />
        <DayField
          value={draft}
          onChange={setDraft}
          max={defaultCustomDay()}
          label="เลือกวันที่"
          error={draftError}
        />
      </div>

      {loading ? (
        <p role="status" className="text-slate-500">
          กำลังโหลด...
        </p>
      ) : !overview ? (
        <p role="alert" className="text-sm text-red-600">
          โหลดข้อมูลภาพรวมไม่สำเร็จ กรุณาลองใหม่
        </p>
      ) : (
        <>
          {/* ── 1. KPI cards ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <MetricCard
                key={c.key}
                label={c.label}
                value={c.value}
                unavailable={c.unavailable}
                deltaPct={c.delta}
                deltaLabel={modeInfo.compareLabel}
                baselineName={modeInfo.baselineName}
                noBaseline={c.noBaseline}
                hint={c.hint}
                formatValue={c.formatValue}
              />
            ))}
          </div>

          {/* ── 2. Two columns of cards: sales trend over the most popular
              categories, and order status over the category share. The last
              card of each column stretches so both columns end together. ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <ChartCard title="แนวโน้มยอดขาย" icon="trending_up" align="start">
                <p className="mb-2 -mt-2 text-xs text-slate-500">
                  {modeInfo.trendCaption}
                </p>
                {overview.trend ? (
                  <TrendLineChart
                    data={overview.trend}
                    color={CHART_COLORS.series}
                    formatValue={baht}
                    label="แนวโน้มยอดขาย"
                    height={215}
                  />
                ) : (
                  <p className="text-sm text-slate-500">ไม่พร้อมใช้งาน</p>
                )}
              </ChartCard>
              <ChartCard
                className="flex-1"
                title="หมวดหมู่ที่นิยมสุด"
                icon="workspace_premium"
                align="start"

                actions={
                  <MoreToggle
                    open={popularOpen}
                    onToggle={() => setPopularOpen((v) => !v)}
                  />
                }
              >
                <p className="mb-2 -mt-2 text-xs text-slate-500">
                  หมวดหมู่ที่นิยมสุด{modeInfo.inPeriod}
                </p>
                <PopularCategories
                  rows={popularRows}
                  total={overview.rankings?.categoryTotal}
                  emptyText="ยังไม่มีสินค้าที่ขายได้ในช่วงนี้"
                />
              </ChartCard>
            </div>
            <div className="flex flex-col gap-4">
              <ChartCard
                title="สถานะคำสั่งซื้อ"
                icon="donut_large"
                align="start"
              >
                <p className="mb-2 -mt-2 text-xs text-slate-500">
                  เฉพาะคำสั่งซื้อที่ชำระเงินแล้ว
                </p>
                <OrderStatusDonut counts={overview.orderStatus} />
              </ChartCard>
              <ChartCard
                className="flex-1"
                title="ประเภทสินค้ายอดขายสูงสุด"
                icon="donut_large"

                actions={
                  <MoreToggle
                    open={shareOpen}
                    onToggle={() => setShareOpen((v) => !v)}
                  />
                }
              >
                <p className="mb-2 -mt-2 text-xs text-slate-500">
                  ประเภทสินค้าที่ยอดขายสูงสุด{modeInfo.inPeriod}
                </p>
                <CategoryDonut
                  rows={overview.rankings?.categories ?? null}
                  expanded={shareOpen}
                  total={overview.rankings?.categoryTotal}
                />
              </ChartCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
