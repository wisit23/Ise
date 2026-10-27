"use client";
import Icon from "../../ui/Icon";


import { useMemo, useState } from "react";
import TrendBarChart from "../../charts/TrendBarChart";
import LineChart from "../../charts/LineChart";
import DonutChart from "../../charts/DonutChart";
import ChartCard from "../../panel/ui/ChartCard";
import KpiCard from "../../panel/ui/KpiCard";
import { CATEGORICAL } from "../../charts/palette";
import { baht, ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, StatusPill } from "./sellerStatus";
import { formatOrderId } from "../../../lib/orders";
import { PLATFORM_FEE_RATE, netRevenueForOrder } from "../../../lib/sellerRevenue";

/** Thai month abbreviations (index 0 = January). */
const MONTH_LABELS = [
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

const FULL_MONTH_LABELS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/**
 * Helper to get ISO date string (YYYY-MM-DD) in local time.
 */
function getTodayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOffsetDateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStartKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function formatShortDate(dateKey) {
  if (!dateKey) return "";
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10) - 1;
  return `${day} ${MONTH_LABELS[month] || ""}`;
}

function formatThaiDateFull(dateKey) {
  if (!dateKey) return "";
  const d = new Date(dateKey + "T00:00:00");
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDaysBetween(startKey, endKey, maxDays = 60) {
  if (!startKey || !endKey) return [];
  const start = new Date(startKey + "T00:00:00");
  const end = new Date(endKey + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

  const [realStart, realEnd] = start <= end ? [start, end] : [end, start];
  const days = [];
  const cur = new Date(realStart);
  let count = 0;
  while (cur <= realEnd && count < maxDays) {
    const year = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const key = `${year}-${m}-${d}`;
    days.push({
      key,
      label: `${cur.getDate()}/${cur.getMonth() + 1}`,
    });
    cur.setDate(cur.getDate() + 1);
    count++;
  }
  return days;
}

const BANGKOK_DATE_HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function bangkokDateHour(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    BANGKOK_DATE_HOUR.formatToParts(date).map(({ type, value: part }) => [type, part]),
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

function buildHourlyRevenue(orders, dateKey) {
  const slots = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, "0")}:00`,
    fullLabel: `${formatThaiDateFull(dateKey)} (${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59 น.)`,
    value: 0,
  }));
  orders
    .filter((o) => o.status === "completed" && o.createdAt)
    .forEach((o) => {
      const dateHour = bangkokDateHour(o.createdAt);
      if (!dateHour || dateHour.dateKey !== dateKey) return;
      slots[dateHour.hour].value += netRevenueForOrder(o);
    });
  return slots;
}

function buildDailyRangeRevenue(orders, startKey, endKey) {
  const days = getDaysBetween(startKey, endKey);
  const map = Object.fromEntries(days.map((d) => [d.key, 0]));
  orders
    .filter((o) => o.status === "completed")
    .forEach((o) => {
      const key = o.createdAt ? bangkokDateHour(o.createdAt)?.dateKey : "";
      if (key && key in map) {
        map[key] += netRevenueForOrder(o);
      }
    });
  return days.map((d) => ({
    label: d.label,
    fullLabel: formatThaiDateFull(d.key),
    value: map[d.key] || 0,
  }));
}

function filterOrdersByDateRange(orders, startKey, endKey) {
  return orders.filter((o) => {
    const key = o.createdAt ? o.createdAt.slice(0, 10) : "";
    if (!key) return false;
    if (startKey && key < startKey) return false;
    if (endKey && key > endKey) return false;
    return true;
  });
}

/**
 * Build 12-month net revenue array (Jan–Dec of current year) from completed orders after platform fee deduction.
 */
function buildMonthlyRevenue(orders) {
  const year = new Date().getFullYear();
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    label: MONTH_LABELS[i],
    fullLabel: FULL_MONTH_LABELS[i],
    value: 0,
  }));
  orders
    .filter((o) => o.status === "completed")
    .forEach((o) => {
      const d = new Date(o.createdAt);
      if (d.getFullYear() === year) {
        monthly[d.getMonth()].value += netRevenueForOrder(o);
      }
    });
  return monthly;
}

/**
 * Build cumulative profit series (LineChart format) — up to current month only.
 * Future months are set to null so the line chart stops at the present month.
 */
function buildCumulativeProfit(monthlyRevenue) {
  const currentMonth = new Date().getMonth();
  let running = 0;
  return monthlyRevenue.map((m, i) => {
    if (i > currentMonth) {
      return {
        x: m.label,
        y: null,
        monthLabel: m.label,
        monthFull: FULL_MONTH_LABELS[i],
        monthValue: m.value,
      };
    }
    running += m.value;
    return {
      x: m.label,
      y: running,
      monthLabel: m.label,
      monthFull: FULL_MONTH_LABELS[i],
      monthValue: m.value,
    };
  });
}

/**
 * Count how many *completed* orders fell into each product category, then
 * attach colors from the categorical palette for the DonutChart.
 */
function buildCategoryOrderData(orders, products) {
  const catById = {};
  products.forEach((p) => {
    catById[p.id] = p.category || "ไม่ระบุ";
  });

  const catStats = {};
  orders
    .filter((o) => o.status === "completed")
    .forEach((o) => {
      const cat = catById[o.productId] || o.productCategory || "ไม่ระบุ";
      const net = netRevenueForOrder(o);
      if (!catStats[cat]) {
        catStats[cat] = { count: 0, revenue: 0 };
      }
      catStats[cat].count += 1;
      catStats[cat].revenue += net;
    });

  return Object.entries(catStats)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([label, stat], i) => ({
      label,
      value: stat.count,
      count: stat.count,
      revenue: stat.revenue,
      color: CATEGORICAL[i % CATEGORICAL.length],
    }));
}

/**
 * Compact custom date filter toolbar for individual chart cards.
 */
function CustomDateToolbar({
  startDate,
  endDate,
  isSingle,
  onChangeStart,
  onChangeEnd,
  onToggleSingle,
  onSelectPreset,
}) {
  return (
    <div className="mb-3 rounded-lg border border-emerald-100/90 bg-emerald-50/40 p-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-emerald-600">
              calendar_month
            </span>
            <span className="text-[11px] font-medium text-slate-500">จาก:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => e.target.value && onChangeStart(e.target.value)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 shadow-2xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {!isSingle && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-slate-500">ถึง:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => e.target.value && onChangeEnd(e.target.value)}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 shadow-2xs focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          <button
            type="button"
            onClick={onToggleSingle}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
              isSingle
                ? "bg-emerald-600 text-white font-semibold shadow-2xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            {isSingle ? <>วันเดียว <Icon name="check" /></> : "เลือกวันเดียว"}
          </button>
        </div>

        <div className="flex items-center gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => onSelectPreset("today")}
            className="rounded bg-white px-1.5 py-0.5 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 transition"
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset("yesterday")}
            className="rounded bg-white px-1.5 py-0.5 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 transition"
          >
            เมื่อวาน
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset("7d")}
            className="rounded bg-white px-1.5 py-0.5 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 transition"
          >
            7 วัน
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset("30d")}
            className="rounded bg-white px-1.5 py-0.5 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 transition"
          >
            30 วัน
          </button>
          <button
            type="button"
            onClick={() => onSelectPreset("month")}
            className="rounded bg-white px-1.5 py-0.5 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 transition"
          >
            เดือนนี้
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section 1: Dashboard Charts ─────────────────────────────────────────────
export default function SellerDashboardCharts({
  stats = {},
  orders = [],
  products = [],
  orderCount = 0,
  onNavigateOrders,
  onNavigateProducts,
}) {
  const monthlyRevenue = useMemo(() => buildMonthlyRevenue(orders), [orders]);
  const cumulativeProfit = useMemo(() => buildCumulativeProfit(monthlyRevenue), [monthlyRevenue]);
  const categoryOrderData = useMemo(() => buildCategoryOrderData(orders, products), [orders, products]);

  // ─── Chart 1 (Revenue Trend Bar Chart) Independent State ───
  const [chart1View, setChart1View] = useState("monthly"); // "monthly" | "daily" | "custom"
  const [chart1Start, setChart1Start] = useState(() => getOffsetDateKey(6));
  const [chart1End, setChart1End] = useState(getTodayKey);
  const [chart1Single, setChart1Single] = useState(false);

  const handleChart1Preset = (preset) => {
    if (preset === "today") {
      const t = getTodayKey();
      setChart1Start(t);
      setChart1End(t);
      setChart1Single(true);
    } else if (preset === "yesterday") {
      const y = getOffsetDateKey(1);
      setChart1Start(y);
      setChart1End(y);
      setChart1Single(true);
    } else if (preset === "7d") {
      setChart1Start(getOffsetDateKey(6));
      setChart1End(getTodayKey());
      setChart1Single(false);
    } else if (preset === "30d") {
      setChart1Start(getOffsetDateKey(29));
      setChart1End(getTodayKey());
      setChart1Single(false);
    } else if (preset === "month") {
      setChart1Start(getMonthStartKey());
      setChart1End(getTodayKey());
      setChart1Single(false);
    }
  };

  const chart1Data = useMemo(() => {
    if (chart1View === "monthly") {
      return monthlyRevenue;
    }
    if (chart1View === "daily") {
      return (
        stats?.trend ||
        buildDailyRangeRevenue(orders, getOffsetDateKey(6), getTodayKey())
      );
    }
    // "custom"
    if (chart1Single || chart1Start === chart1End) {
      return buildHourlyRevenue(orders, chart1Start);
    }
    return buildDailyRangeRevenue(orders, chart1Start, chart1End);
  }, [
    chart1View,
    monthlyRevenue,
    stats?.trend,
    orders,
    chart1Single,
    chart1Start,
    chart1End,
  ]);

  const chart1Total = useMemo(() => {
    return chart1Data.reduce((s, d) => s + (d.value || 0), 0);
  }, [chart1Data]);

  const hasChart1Data = chart1Data.some((d) => d.value > 0);

  const chart1Title = useMemo(() => {
    if (chart1View === "monthly") return "ยอดขายสุทธิ (12 เดือน)";
    if (chart1View === "daily") return "ยอดขายสุทธิ (7 วัน)";
    if (chart1Single || chart1Start === chart1End) {
      return `ยอดขายสุทธิ (${formatShortDate(chart1Start)})`;
    }
    return `ยอดขายสุทธิ (${formatShortDate(chart1Start)} - ${formatShortDate(chart1End)})`;
  }, [chart1View, chart1Single, chart1Start, chart1End]);

  const chart1Subtitle = useMemo(() => {
    if (chart1View === "monthly") {
      return `ยอดรวมปีนี้: ${baht(chart1Total)}`;
    }
    if (chart1View === "daily") {
      return `ยอดรวม 7 วัน: ${baht(chart1Total)}`;
    }
    if (chart1Single || chart1Start === chart1End) {
      return `ยอดรวมวันที่ ${formatThaiDateFull(chart1Start)}: ${baht(chart1Total)}`;
    }
    return `ยอดรวมช่วงที่เลือก: ${baht(chart1Total)}`;
  }, [chart1View, chart1Total, chart1Single, chart1Start, chart1End]);

  const hasMonthlyData = monthlyRevenue.some((m) => m.value > 0);

  // ─── Chart 3 (Product Category Donut Chart) Independent State ───
  const [chart3View, setChart3View] = useState("all"); // "all" | "month" | "custom"
  const [chart3Start, setChart3Start] = useState(() => getMonthStartKey());
  const [chart3End, setChart3End] = useState(getTodayKey);
  const [chart3Single, setChart3Single] = useState(false);

  const handleChart3Preset = (preset) => {
    if (preset === "today") {
      const t = getTodayKey();
      setChart3Start(t);
      setChart3End(t);
      setChart3Single(true);
    } else if (preset === "yesterday") {
      const y = getOffsetDateKey(1);
      setChart3Start(y);
      setChart3End(y);
      setChart3Single(true);
    } else if (preset === "7d") {
      setChart3Start(getOffsetDateKey(6));
      setChart3End(getTodayKey());
      setChart3Single(false);
    } else if (preset === "30d") {
      setChart3Start(getOffsetDateKey(29));
      setChart3End(getTodayKey());
      setChart3Single(false);
    } else if (preset === "month") {
      setChart3Start(getMonthStartKey());
      setChart3End(getTodayKey());
      setChart3Single(false);
    }
  };

  const chart3CategoryData = useMemo(() => {
    if (chart3View === "all") {
      return categoryOrderData;
    }
    if (chart3View === "month") {
      const monthStart = getMonthStartKey();
      const filtered = orders.filter((o) => {
        const key = o.createdAt?.slice(0, 10);
        return key && key >= monthStart;
      });
      return buildCategoryOrderData(filtered, products);
    }
    // "custom"
    const filtered = filterOrdersByDateRange(
      orders,
      chart3Start,
      chart3Single ? chart3Start : chart3End,
    );
    return buildCategoryOrderData(filtered, products);
  }, [
    chart3View,
    categoryOrderData,
    orders,
    products,
    chart3Start,
    chart3End,
    chart3Single,
  ]);

  const chart3TotalCount = useMemo(() => {
    return chart3CategoryData.reduce((s, d) => s + (d.count || 0), 0);
  }, [chart3CategoryData]);

  const hasChart3Data = chart3CategoryData.length > 0;

  const chart3Title = useMemo(() => {
    if (chart3View === "all") return "หมวดสินค้าที่ขายดี";
    if (chart3View === "month") return "หมวดสินค้าที่ขายดี (เดือนนี้)";
    if (chart3Single || chart3Start === chart3End) {
      return `หมวดสินค้าที่ขายดี (${formatShortDate(chart3Start)})`;
    }
    return `หมวดสินค้าที่ขายดี (${formatShortDate(chart3Start)} - ${formatShortDate(chart3End)})`;
  }, [chart3View, chart3Single, chart3Start, chart3End]);

  const chart3Subtitle = useMemo(() => {
    if (chart3View === "all") {
      return `ขายสำเร็จทั้งหมด ${stats.soldCount ?? chart3TotalCount} ชิ้น`;
    }
    if (chart3View === "month") {
      return `ขายสำเร็จเดือนนี้ ${chart3TotalCount} ชิ้น`;
    }
    if (chart3Single || chart3Start === chart3End) {
      return `ขายสำเร็จวันที่ ${formatThaiDateFull(chart3Start)}: ${chart3TotalCount} ชิ้น`;
    }
    return `ขายสำเร็จ ${chart3TotalCount} ชิ้น (ช่วงที่เลือก)`;
  }, [chart3View, stats, chart3TotalCount, chart3Single, chart3Start]);

  // Specific date inspection state (YYYY-MM-DD)
  const todayKey = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayKey);

  // Orders on the selected date
  const ordersOnDate = useMemo(() => {
    return orders
      .filter((o) => o.createdAt && o.createdAt.slice(0, 10) === selectedDate)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, selectedDate]);

  const completedOnDate = useMemo(() => {
    return ordersOnDate.filter((o) => o.status === "completed");
  }, [ordersOnDate]);

  const grossOnDate = useMemo(() => {
    return completedOnDate.reduce(
      (sum, o) => sum + (o.finalPrice ?? o.price ?? 0),
      0,
    );
  }, [completedOnDate]);

  const netOnDate = useMemo(() => {
    return completedOnDate.reduce((sum, o) => sum + netRevenueForOrder(o), 0);
  }, [completedOnDate]);

  const formattedSelectedDate = useMemo(() => {
    const d = new Date(selectedDate);
    if (Number.isNaN(d.getTime())) return selectedDate;
    return d.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [selectedDate]);

  /** 8 most-recently completed orders, newest first. */
  const recentSales = [...orders]
    .filter((o) => o.status === "completed")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  const datePresets = [
    { label: "วันนี้", offsetDays: 0 },
    { label: "เมื่อวาน", offsetDays: 1 },
    { label: "2 วันก่อน", offsetDays: 2 },
    { label: "7 วันก่อน", offsetDays: 7 },
  ];

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="ยอดขายสำเร็จทั้งหมด"
          value={baht(
            Math.round(
              stats.totalGrossRevenue ??
                ((stats.regularGrossRevenue || 0) + (stats.auctionGrossRevenue || 0)),
            ),
          )}
          icon="payments"
          color="emerald"
          onClick={() => onNavigateOrders?.(null, "completed")}
        />
        <KpiCard
          label="คำสั่งซื้อทั้งหมด"
          value={orderCount}
          icon="receipt_long"
          color="sky"
          onClick={() => onNavigateOrders?.(null, "")}
        />
        <KpiCard
          label="สินค้าพร้อมขาย"
          value={stats.activeCount}
          icon="inventory_2"
          color="indigo"
          onClick={() => onNavigateProducts?.("available")}
        />
        <KpiCard
          label="ขายแล้ว (ชิ้น)"
          value={stats.soldCount}
          icon="check_circle"
          color="amber"
          onClick={() => onNavigateProducts?.("sold")}
        />
      </div>

      {/* ── กลุ่มกราฟทั้งหมด (All Charts Group - Located directly below KPI cards) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Chart 1: Revenue Trend Bar Chart */}
        <div className="col-span-1 md:col-span-2 lg:col-span-1">
          <ChartCard
            title={chart1Title}
            subtitle={chart1Subtitle}
            icon="bar_chart"
            action={
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setChart1View("monthly")}
                    className={`rounded-md px-2 py-0.5 font-medium transition ${
                      chart1View === "monthly"
                        ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    รายเดือน
                  </button>
                  <button
                    type="button"
                    onClick={() => setChart1View("daily")}
                    className={`rounded-md px-2 py-0.5 font-medium transition ${
                      chart1View === "daily"
                        ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    รายวัน
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setChart1View((prev) => (prev === "custom" ? "monthly" : "custom"))
                  }
                  className={`flex w-full items-center justify-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition border ${
                    chart1View === "custom"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px] text-emerald-600">
                    calendar_today
                  </span>
                  <span>เลือกวัน</span>
                </button>
              </div>
            }
          >
            {chart1View === "custom" && (
              <CustomDateToolbar
                startDate={chart1Start}
                endDate={chart1End}
                isSingle={chart1Single}
                onChangeStart={(v) => {
                  setChart1Start(v);
                  if (chart1Single || v > chart1End) setChart1End(v);
                }}
                onChangeEnd={setChart1End}
                onToggleSingle={() => {
                  if (!chart1Single) {
                    setChart1Single(true);
                    setChart1End(chart1Start);
                  } else {
                    setChart1Single(false);
                  }
                }}
                onSelectPreset={handleChart1Preset}
              />
            )}
            {hasChart1Data ? (
              <>
                {chart1View === "custom" && (chart1Single || chart1Start === chart1End) && (
                  <p className="mb-1 text-[11px] text-slate-500">เลื่อนกราฟแนวนอนเพื่อดูครบ 24 ชั่วโมง</p>
                )}
                <TrendBarChart
                  key={chart1View === "custom" && (chart1Single || chart1Start === chart1End)
                    ? `hourly-${chart1Start}` : chart1View}
                  data={chart1Data}
                  formatValue={(v) => baht(Math.round(v))}
                  height={190}
                  showAllLabels={chart1View === "custom" && (chart1Single || chart1Start === chart1End)}
                />
              </>
            ) : (
              <div className="flex h-[190px] items-center justify-center text-xs text-gray-400">
                ยังไม่มียอดขายในช่วงเวลาที่เลือก
              </div>
            )}
          </ChartCard>
        </div>

        {/* Chart 2: Cumulative Profit Line Chart */}
        <div className="col-span-1">
          <ChartCard
            title="รายรับสะสมตลอดปี"
            subtitle={`สะสมสุทธิล่าสุด: ${baht(cumulativeProfit.filter((point) => point.y !== null).at(-1)?.y ?? 0)}`}
            icon="trending_up"
          >
            {hasMonthlyData ? (
              <LineChart
                series={[
                  {
                    label: "รายรับสะสม",
                    color: "#10b981",
                    data: cumulativeProfit,
                  },
                ]}
                formatValue={(v) => baht(Math.round(v))}
                height={190}
                fillArea
              />
            ) : (
              <div className="flex h-[190px] items-center justify-center text-xs text-gray-400">
                ยังไม่มีข้อมูลรายรับ
              </div>
            )}
          </ChartCard>
        </div>

        {/* Chart 3: Product Category Donut Chart */}
        <div className="col-span-1">
          <ChartCard
            title={chart3Title}
            subtitle={chart3Subtitle}
            icon="donut_small"
            action={
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setChart3View("all")}
                    className={`rounded-md px-2 py-0.5 font-medium transition ${
                      chart3View === "all"
                        ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={() => setChart3View("month")}
                    className={`rounded-md px-2 py-0.5 font-medium transition ${
                      chart3View === "month"
                        ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    เดือนนี้
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setChart3View((prev) => (prev === "custom" ? "all" : "custom"))
                  }
                  className={`flex w-full items-center justify-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition border ${
                    chart3View === "custom"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px] text-emerald-600">
                    calendar_today
                  </span>
                  <span>เลือกวัน</span>
                </button>
              </div>
            }
          >
            {chart3View === "custom" && (
              <CustomDateToolbar
                startDate={chart3Start}
                endDate={chart3End}
                isSingle={chart3Single}
                onChangeStart={(v) => {
                  setChart3Start(v);
                  if (chart3Single || v > chart3End) setChart3End(v);
                }}
                onChangeEnd={setChart3End}
                onToggleSingle={() => {
                  if (!chart3Single) {
                    setChart3Single(true);
                    setChart3End(chart3Start);
                  } else {
                    setChart3Single(false);
                  }
                }}
                onSelectPreset={handleChart3Preset}
              />
            )}
            {hasChart3Data ? (
              <DonutChart
                data={chart3CategoryData}
                formatValue={(v) => baht(Math.round(v))}
                size={160}
                strokeWidth={34}
              />
            ) : (
              <div className="flex h-[190px] items-center justify-center text-xs text-gray-400">
                ยังไม่มีออเดอร์สำเร็จในช่วงเวลาที่เลือก
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {/* ── Sales Breakdown: Regular Sales vs Auction Sales ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Regular Sales Card */}
        <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-2xs">
                <span className="material-symbols-outlined text-[20px]">
                  storefront
                </span>
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  ยอดขายทั่วไป (ขายปกติ)
                </h4>
                <p className="text-[11px] text-slate-500">
                  สุทธิหลังหักรายได้แพลตฟอร์ม 3%
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              {stats.regularCompletedCount || 0} ชิ้น
            </span>
          </div>

          <div className="mt-3.5 flex items-baseline justify-between border-t border-emerald-100/60 pt-3">
            <div>
              <p className="text-2xl font-bold tracking-tight text-emerald-950">
                {baht(stats.regularRevenue || 0)}
              </p>
              {(stats.regularGrossRevenue || 0) > 0 && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ยอดก่อนหัก: {baht(stats.regularGrossRevenue || 0)}
                </p>
              )}
            </div>
            {stats.totalRevenue > 0 && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                สัดส่วน {Math.round(((stats.regularRevenue || 0) / stats.totalRevenue) * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Auction Sales Card */}
        <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 via-white to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 shadow-2xs">
                <span className="material-symbols-outlined text-[20px]">
                  gavel
                </span>
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  ยอดขายระบบประมูล
                </h4>
                <p className="text-[11px] text-slate-500">
                  สุทธิหลังหักรายได้แพลตฟอร์ม 3%
                </p>
              </div>
            </div>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
              {stats.auctionCompletedCount || 0} ชิ้น
            </span>
          </div>

          <div className="mt-3.5 flex items-baseline justify-between border-t border-sky-100/60 pt-3">
            <div>
              <p className="text-2xl font-bold tracking-tight text-sky-950">
                {baht(stats.auctionRevenue || 0)}
              </p>
              {(stats.auctionGrossRevenue || 0) > 0 && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ยอดก่อนหัก: {baht(stats.auctionGrossRevenue || 0)}
                </p>
              )}
            </div>
            {stats.totalRevenue > 0 && (
              <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2 py-1 rounded-md border border-sky-200">
                สัดส่วน {Math.round(((stats.auctionRevenue || 0) / stats.totalRevenue) * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Check metrics for a specific date (เช็คจำนวนรายการและยอดขายเฉพาะวัน) ── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-emerald-600">
              event_available
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                เช็คจำนวนรายการและยอดขายเฉพาะวัน
              </h3>
              <p className="text-xs text-slate-500">
                เลือกวันที่ต้องการเพื่อตรวจสอบจำนวนออเดอร์ สินค้าที่ขายได้ และยอดขายสุทธิ
              </p>
            </div>
          </div>

          {/* Date Picker + Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-slate-400">
                calendar_month
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1">
              {datePresets.map((preset) => {
                const d = new Date();
                d.setDate(d.getDate() - preset.offsetDays);
                const pKey = d.toISOString().slice(0, 10);
                const active = selectedDate === pKey;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSelectedDate(pKey)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "bg-emerald-600 text-white font-semibold"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Date Summary Metrics */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-xs text-slate-500">วันที่เลือก</p>
            <p className="mt-1 text-sm font-bold text-slate-800">
              {formattedSelectedDate}
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-xs text-slate-500">จำนวนคำสั่งซื้อ</p>
            <p className="mt-1 text-sm font-bold text-sky-700">
              {ordersOnDate.length} <span className="text-xs font-normal text-slate-500">รายการ</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-xs text-slate-500">ขายสำเร็จ</p>
            <p className="mt-1 text-sm font-bold text-emerald-700">
              {completedOnDate.length} <span className="text-xs font-normal text-slate-500">ชิ้น</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-xs text-slate-500">ยอดขายสุทธิ (หัก 3%)</p>
            <p className="mt-1 text-sm font-bold text-emerald-700">
              {baht(netOnDate)}
            </p>
            {grossOnDate > 0 && (
              <p className="text-[10px] text-slate-400">
                ยอดรวมก่อนหัก: {baht(grossOnDate)}
              </p>
            )}
          </div>
        </div>

        {/* Orders list for that specific date */}
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">
            รายการคำสั่งซื้อของวันที่ {formattedSelectedDate} ({ordersOnDate.length} รายการ)
          </h4>

          {ordersOnDate.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              ไม่มีคำสั่งซื้อในวันที่เลือก
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-3 py-2">เวลา</th>
                    <th className="px-3 py-2">หมายเลขออเดอร์</th>
                    <th className="px-3 py-2">สินค้า</th>
                    <th className="px-3 py-2 text-right">ราคา</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                    <th className="px-3 py-2 text-right">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordersOnDate.map((o) => {
                    const price = o.finalPrice ?? o.price ?? 0;
                    const netPrice = Math.round(price * (1 - PLATFORM_FEE_RATE));
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {new Date(o.createdAt).toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap" title={formatOrderId(o)}>
                          #{formatOrderId(o)}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800 max-w-[220px] truncate">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                                Boolean(o.auctionId) || o.orderType === "AUCTION" || o.id?.startsWith("AUC-")
                                  ? "bg-sky-50 text-sky-700 border border-sky-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {Boolean(o.auctionId) || o.orderType === "AUCTION" || o.id?.startsWith("AUC-")
                                ? "ประมูล"
                                : "ขายปกติ"}
                            </span>
                            <span className="truncate">{o.productTitle || "(ไม่มีชื่อสินค้า)"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">
                          <span>{baht(price)}</span>
                          {o.status === "completed" && (
                            <span className="block text-[10px] font-normal text-emerald-600">
                              สุทธิ {baht(netPrice)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <StatusPill
                            label={ORDER_STATUS_LABEL[o.status] || o.status}
                            style={ORDER_STATUS_STYLE[o.status]}
                          />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onNavigateOrders?.(o.id)}
                            className="font-medium text-emerald-600 hover:underline"
                          >
                            ดูออเดอร์
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>



      {/* ── Recent Sales ── */}
      <div className="rounded-xl border border-slate-200/70 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">
              sell
            </span>
            <h3 className="text-sm font-semibold text-slate-700">ขายล่าสุด</h3>
          </div>
          {recentSales.length > 0 && (
            <button
              onClick={() => onNavigateOrders?.()}
              className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
            >
              ดูทั้งหมด
              <span className="material-symbols-outlined text-[14px]">
                chevron_right
              </span>
            </button>
          )}
        </div>

        {recentSales.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="material-symbols-outlined text-[40px] text-slate-300">
              receipt_long
            </span>
            <p className="text-sm text-slate-400">ยังไม่มีรายการขายสำเร็จ</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentSales.map((o) => {
              const price = o.finalPrice ?? o.price ?? 0;
              const netPrice = Math.round(price * (1 - PLATFORM_FEE_RATE));
              return (
                <li key={o.id}>
                  <button
                    onClick={() => onNavigateOrders?.(o.id)}
                    className="flex w-full items-center justify-between gap-2.5 sm:gap-4 px-3.5 sm:px-5 py-3 text-left transition-colors hover:bg-emerald-50/40 group"
                  >
                    {/* Product info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                            Boolean(o.auctionId) || o.orderType === "AUCTION" || o.id?.startsWith("AUC-")
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {Boolean(o.auctionId) || o.orderType === "AUCTION" || o.id?.startsWith("AUC-")
                            ? "ประมูล"
                            : "ขายปกติ"}
                        </span>
                        <p className="truncate text-sm font-medium text-slate-800 group-hover:text-emerald-700 transition-colors">
                          {o.productTitle || "(ไม่มีชื่อสินค้า)"}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        <span className="font-mono text-[11px] text-slate-500 mr-1.5" title={formatOrderId(o)}>
                          #{formatOrderId(o)}
                        </span>
                        {" · "}
                        <span className="material-symbols-outlined align-middle text-[12px] mr-0.5">
                          calendar_today
                        </span>
                        {new Date(o.createdAt).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {" · "}
                        {new Date(o.createdAt).toLocaleTimeString("th-TH", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    {/* Price (gross and net) */}
                    <div className="text-right shrink-0">
                      <span className="block text-sm font-semibold text-slate-700">
                        {baht(price)}
                      </span>
                      <span className="block text-[11px] font-medium text-emerald-600">
                        สุทธิ {baht(netPrice)}
                      </span>
                    </div>

                    {/* Status pill */}
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      ขายสำเร็จ
                    </span>

                    {/* Arrow hint */}
                    <span className="hidden sm:inline-block material-symbols-outlined shrink-0 text-[16px] text-slate-300 group-hover:text-emerald-500 transition-colors">
                      arrow_forward_ios
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
