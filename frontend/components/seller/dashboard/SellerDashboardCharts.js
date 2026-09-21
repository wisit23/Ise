"use client";

import TrendBarChart from "../../charts/TrendBarChart";
import LineChart from "../../charts/LineChart";
import DonutChart from "../../charts/DonutChart";
import ChartCard from "../../panel/ui/ChartCard";
import KpiCard from "../../panel/ui/KpiCard";
import { CATEGORICAL } from "../../charts/palette";
import { baht } from "./sellerStatus";

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

/**
 * Build 12-month revenue array (Jan–Dec of the current year) from completed
 * orders.  Returns Array<{ label: string, value: number }> length 12.
 */
function buildMonthlyRevenue(orders) {
  const year = new Date().getFullYear();
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    label: MONTH_LABELS[i],
    value: 0,
  }));
  orders
    .filter((o) => o.status === "completed")
    .forEach((o) => {
      const d = new Date(o.createdAt);
      if (d.getFullYear() === year) {
        monthly[d.getMonth()].value += o.price;
      }
    });
  return monthly;
}

/**
 * Build cumulative profit series (LineChart format) — same data as
 * monthlyRevenue but summed progressively.
 */
function buildCumulativeProfit(monthlyRevenue) {
  let running = 0;
  return monthlyRevenue.map((m) => {
    running += m.value;
    return { x: m.label, y: running };
  });
}

/**
 * Count how many *completed* orders fell into each product category, then
 * attach colors from the categorical palette for the DonutChart.
 */
function buildCategoryOrderData(orders, products) {
  // Build a productId → category lookup from the seller's product list.
  const catById = {};
  products.forEach((p) => {
    catById[p.id] = p.category || "ไม่ระบุ";
  });

  const counts = {};
  orders
    .filter((o) => o.status === "completed")
    .forEach((o) => {
      const cat = catById[o.productId] || o.productCategory || "ไม่ระบุ";
      counts[cat] = (counts[cat] || 0) + 1;
    });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      color: CATEGORICAL[i % CATEGORICAL.length],
    }));
}

// ─── Section 1: Dashboard Charts ─────────────────────────────────────────────
export default function SellerDashboardCharts({
  stats,
  orders,
  products,
  orderCount,
  onNavigateOrders,
  onNavigateProducts,
}) {
  const monthlyRevenue = buildMonthlyRevenue(orders);
  const cumulativeProfit = buildCumulativeProfit(monthlyRevenue);
  const categoryOrderData = buildCategoryOrderData(orders, products);

  const hasMonthlyData = monthlyRevenue.some((m) => m.value > 0);
  const hasCategoryData = categoryOrderData.length > 0;

  /** 8 most-recently completed orders, newest first. */
  const recentSales = [...orders]
    .filter((o) => o.status === "completed")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="ยอดขายสำเร็จทั้งหมด"
          value={baht(stats.totalRevenue)}
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

      {/* ── Row 1: Monthly revenue bar chart (full width) ── */}
      <ChartCard title="ยอดขายรายเดือน (12 เดือน)" icon="bar_chart">
        {hasMonthlyData ? (
          <TrendBarChart
            data={monthlyRevenue}
            formatValue={baht}
            height={200}
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-gray-400">
            ยังไม่มียอดขายในปีนี้
          </div>
        )}
      </ChartCard>

      {/* ── Row 2: Cumulative profit line + Category donut ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="รายรับสะสมตลอดปี (กำไร)" icon="trending_up">
          {hasMonthlyData ? (
            <LineChart
              series={[
                {
                  label: "รายรับสะสม",
                  color: "#1baf7a",
                  data: cumulativeProfit,
                },
              ]}
              height={200}
              fillArea
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              ยังไม่มีข้อมูลรายรับ
            </div>
          )}
        </ChartCard>

        <ChartCard title="หมวดสินค้าที่ขายดี" icon="donut_small">
          {hasCategoryData ? (
            <DonutChart data={categoryOrderData} size={180} strokeWidth={40} />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              ยังไม่มีออเดอร์สำเร็จ
            </div>
          )}
        </ChartCard>
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
            {recentSales.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => onNavigateOrders?.(o.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition-colors hover:bg-emerald-50/40 group"
                >
                  {/* Product info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 group-hover:text-emerald-700 transition-colors">
                      {o.productTitle || "(ไม่มีชื่อสินค้า)"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
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

                  {/* Price */}
                  <span className="shrink-0 text-sm font-semibold text-slate-700">
                    {baht(o.price)}
                  </span>

                  {/* Status pill */}
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    ขายสำเร็จ
                  </span>

                  {/* Arrow hint */}
                  <span className="material-symbols-outlined shrink-0 text-[16px] text-slate-300 group-hover:text-emerald-500 transition-colors">
                    arrow_forward_ios
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
