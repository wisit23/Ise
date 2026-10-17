"use client";

import Sparkline from "../../charts/Sparkline";
import TrendBarChart from "../../charts/TrendBarChart";
import CategoryBarChart from "../../charts/CategoryBarChart";
import { baht } from "./sellerStatus";

function Panel({ title, children, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-line bg-white p-5 shadow-sm ${className}`}
    >
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone || "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

/* Revenue hero, the four stat tiles, and the four charts. */
export default function SalesSummary({ stats, orderCount, trendDays }) {
  return (
    <>
      <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-5 shadow-sm lg:col-span-2 lg:row-span-2">
        <div>
          <p className="text-sm text-ink-muted">ยอดขายสำเร็จทั้งหมด</p>
          <p className="mt-2 text-5xl font-semibold tracking-tight text-gray-900">
            {baht(Math.round(stats.totalGrossRevenue ?? stats.totalRevenue ?? 0))}
          </p>
          {stats.delta !== null && (
            <p
              className={`mt-2 text-sm font-medium ${
                stats.delta >= 0 ? "text-[#006300]" : "text-danger"
              }`}
            >
              {/* The arrow is decorative: the sign is already carried by the
                  colour and by the number itself. */}
              <span aria-hidden="true">{stats.delta >= 0 ? "▲" : "▼"}</span>{" "}
              {Math.abs(stats.delta)}%{" "}
              <span className="font-normal text-ink-subtle">
                เทียบ 7 วันก่อนหน้า
              </span>
            </p>
          )}

          {/* แยกยอดขายปกติ vs ยอดขายประมูล */}
          <div className="mt-4 pt-3.5 border-t border-gray-150 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-emerald-50/70 p-2.5 border border-emerald-200">
              <span className="text-emerald-800 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">storefront</span>
                ยอดขายปกติ
              </span>
              <p className="text-base font-bold text-emerald-950 mt-1">
                {baht(stats.regularRevenue || 0)}
              </p>
              <span className="text-[11px] text-emerald-700">
                {stats.regularCompletedCount || 0} รายการ
              </span>
            </div>
            <div className="rounded-lg bg-sky-50/70 p-2.5 border border-sky-200">
              <span className="text-sky-800 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">gavel</span>
                ยอดขายประมูล
              </span>
              <p className="text-base font-bold text-sky-950 mt-1">
                {baht(stats.auctionRevenue || 0)}
              </p>
              <span className="text-[11px] text-sky-700">
                {stats.auctionCompletedCount || 0} รายการ
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <p className="text-xs text-ink-subtle">
            แนวโน้ม {trendDays} วันล่าสุด
          </p>
          <Sparkline values={stats.sparklineValues} width={140} height={36} />
        </div>
      </div>

      <Tile label="คำสั่งซื้อทั้งหมด" value={orderCount} />
      <Tile label="สินค้าพร้อมขาย" value={stats.activeCount} />
      <Tile
        label="รอลูกค้าชำระเงิน"
        value={baht(stats.pendingRevenue)}
        tone="text-amber-700"
      />
      <Tile label="ขายแล้ว (ชิ้น)" value={stats.soldCount} />

      <Panel
        title={`ยอดขายรายวัน (${trendDays} วันล่าสุด)`}
        className="sm:col-span-2 lg:col-span-4"
      >
        {stats.totalRevenue === 0 ? (
          <Empty>ยังไม่มียอดขายสำเร็จในช่วงนี้</Empty>
        ) : (
          <TrendBarChart data={stats.trend} formatValue={baht} />
        )}
      </Panel>

      <Panel title="สถานะคำสั่งซื้อ" className="sm:col-span-2">
        {stats.orderStatusData.length === 0 ? (
          <Empty>ยังไม่มีคำสั่งซื้อ</Empty>
        ) : (
          <CategoryBarChart data={stats.orderStatusData} />
        )}
      </Panel>

      <Panel title="สถานะสินค้า" className="sm:col-span-2">
        {stats.productStatusData.length === 0 ? (
          <Empty>ยังไม่มีสินค้าที่ลงขาย</Empty>
        ) : (
          <CategoryBarChart data={stats.productStatusData} />
        )}
      </Panel>

      <Panel title="สินค้าตามหมวดหมู่" className="sm:col-span-2">
        {stats.categoryData.length === 0 ? (
          <Empty>ยังไม่มีสินค้าที่ลงขาย</Empty>
        ) : (
          <CategoryBarChart data={stats.categoryData} />
        )}
      </Panel>
    </>
  );
}
