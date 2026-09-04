"use client";
import { useEffect, useMemo, useState } from "react";
import { toCsv, downloadCsv } from "../../../lib/csv";
import RadioSelect from "../../ui/RadioSelect";
import {
  baht,
  dayLabel,
  fetchMetricsSeries,
  monthLabel,
  monthWindow,
  MONTH_NAMES,
  PLATFORM_FEE_RATE,
  yearWindow,
} from "../../../lib/executive";

const FIRST_YEAR = 2024;
const UNAVAILABLE = "ไม่พร้อมใช้งาน";

function yearChoices() {
  const thisYear = new Date().getUTCFullYear();
  const years = [];
  for (let y = thisYear; y >= FIRST_YEAR; y--) years.push(y);
  return years;
}

/** Builds the [{period,label,gmv,platformRevenue,completedOrders,activeUsers}]
 * rows the table and the CSV both render from. Backbone comes from whichever
 * provider actually answered — if only one did, its periods still drive the
 * row list and the other provider's column reads "ไม่พร้อมใช้งาน" per row
 * (CEO-DEC-003: a provider outage must never render as a silent zero). */
function buildRows({ order, auth }, granularity) {
  const backbone = order || auth || [];
  const orderByPeriod = new Map((order || []).map((r) => [r.period, r]));
  const authByPeriod = new Map((auth || []).map((r) => [r.period, r]));
  const labelFor = granularity === "month" ? monthLabel : dayLabel;

  return backbone.map((b) => {
    const o = orderByPeriod.get(b.period);
    const a = authByPeriod.get(b.period);
    return {
      period: b.period,
      label: labelFor(b.period),
      gmv: o?.gmv,
      platformRevenue: o?.platformRevenue,
      completedOrders: o?.completedOrders,
      activeUsers: a?.activeUsers,
      orderUnavailable: !order,
      authUnavailable: !auth,
    };
  });
}

// ─── Reports Section ─────────────────────────────────────────────────────
// Month/year performance breakdown with CSV export.

export default function ReportsSection({ token }) {
  const now = new Date();
  const [granularity, setGranularity] = useState("month");
  const [year, setYear] = useState(now.getUTCFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getUTCMonth());
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const seriesGranularity = granularity === "year" ? "month" : "day";
  const periodLabel =
    granularity === "year"
      ? `ปี ${year + 543}`
      : `${MONTH_NAMES[monthIndex]} ${year + 543}`;

  useEffect(() => {
    const win =
      granularity === "year" ? yearWindow(year) : monthWindow(year, monthIndex);

    let cancelled = false;
    setLoading(true);
    setError("");

    fetchMetricsSeries(win, seriesGranularity, token)
      .then((result) => !cancelled && setSeries(result))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [granularity, year, monthIndex, seriesGranularity, token]);

  const rows = useMemo(() => {
    if (!series) return [];
    return buildRows(series, seriesGranularity);
  }, [series, seriesGranularity]);

  const bothUnavailable = series && !series.order && !series.auth;

  function handleDownload() {
    if (rows.length === 0) return;

    const columns = [
      { key: "label", label: "ช่วงเวลา" },
      { key: "gmv", label: "ยอดขาย (บาท)" },
      { key: "platformRevenue", label: "รายได้แพลตฟอร์ม (บาท)" },
      { key: "completedOrders", label: "คำสั่งซื้อ (รายการ)" },
      { key: "activeUsers", label: "ผู้ใช้งานที่ล็อกอิน (คน)" },
    ];

    const csvRows = rows.map((r) => ({
      label: r.label,
      gmv: r.orderUnavailable ? UNAVAILABLE : r.gmv,
      platformRevenue: r.orderUnavailable ? UNAVAILABLE : r.platformRevenue,
      completedOrders: r.orderUnavailable ? UNAVAILABLE : r.completedOrders,
      activeUsers: r.authUnavailable ? UNAVAILABLE : r.activeUsers,
    }));

    const csv = toCsv(columns, csvRows);
    const slug =
      granularity === "year"
        ? `${year}`
        : `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    downloadCsv(`reloop-executive-report-${slug}.csv`, csv);
  }

  return (
    <div className="animate-fade-in-up">
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
        <div>
          <label
            htmlFor="granularity"
            className="mb-1 block text-xs text-slate-500 font-medium"
          >
            รูปแบบรายงาน
          </label>
          <RadioSelect
            id="granularity"
            value={granularity}
            onChange={setGranularity}
            options={[
              { value: "month", label: "รายเดือน" },
              { value: "year", label: "รายปี" },
            ]}
            size="sm"
            variant="panel"
          />
        </div>

        {granularity === "month" && (
          <div>
            <label
              htmlFor="month"
              className="mb-1 block text-xs text-slate-500 font-medium"
            >
              เดือน
            </label>
            <RadioSelect
              id="month"
              value={monthIndex}
              onChange={setMonthIndex}
              options={MONTH_NAMES.map((name, i) => ({
                value: i,
                label: name,
              }))}
              size="sm"
              variant="panel"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="year"
            className="mb-1 block text-xs text-slate-500 font-medium"
          >
            ปี
          </label>
          <RadioSelect
            id="year"
            value={year}
            onChange={setYear}
            options={yearChoices().map((y) => ({
              value: y,
              label: String(y + 543),
            }))}
            size="sm"
            variant="panel"
          />
        </div>

        <button
          onClick={handleDownload}
          disabled={loading || rows.length === 0}
          className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          ⬇ ดาวน์โหลด CSV
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">กำลังโหลด...</p>
      ) : bothUnavailable ? (
        <p className="text-sm text-slate-500">
          ไม่สามารถโหลดข้อมูลได้ในขณะนี้ — {UNAVAILABLE}
        </p>
      ) : (
        <>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">
            {granularity === "year"
              ? "ผลการดำเนินงานรายเดือน"
              : "ผลการดำเนินงานรายวัน"}{" "}
            — {periodLabel}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            รายได้แพลตฟอร์มคำนวณที่ {PLATFORM_FEE_RATE * 100}% ของยอดขายใน
            {granularity === "year" ? "แต่ละเดือน" : "แต่ละวัน"}
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th scope="col" className="px-5 py-3 font-medium">
                    ช่วงเวลา
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    ยอดขาย
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    รายได้แพลตฟอร์ม
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    คำสั่งซื้อ
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    ผู้ใช้งานที่ล็อกอิน
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={r.period}>
                    <th
                      scope="row"
                      className="px-5 py-3 text-left font-normal text-slate-700"
                    >
                      {i + 1}. {r.label}
                    </th>
                    <td className="px-5 py-3 text-right text-slate-900">
                      {r.orderUnavailable ? UNAVAILABLE : baht(r.gmv)}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-900">
                      {r.orderUnavailable
                        ? UNAVAILABLE
                        : baht(r.platformRevenue)}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-900">
                      {r.orderUnavailable
                        ? UNAVAILABLE
                        : r.completedOrders.toLocaleString("th-TH")}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-900">
                      {r.authUnavailable
                        ? UNAVAILABLE
                        : r.activeUsers.toLocaleString("th-TH")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
