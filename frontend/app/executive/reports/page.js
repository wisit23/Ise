"use client";

import { useEffect, useMemo, useState } from "react";
import ExecutiveShell from "../../../components/executive/ExecutiveShell";
import { getAccessToken } from "../../../lib/auth";
import { toCsv, downloadCsv } from "../../../lib/csv";
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

function ReportsContent() {
  const now = new Date();
  const [granularity, setGranularity] = useState("month");
  const [year, setYear] = useState(now.getUTCFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getUTCMonth());
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // "รายเดือน" breaks the selected month down by day; "รายปี" breaks the
  // selected year down by month — the API's bucket size follows the same
  // choice as the report's own granularity toggle.
  const seriesGranularity = granularity === "year" ? "month" : "day";
  const periodLabel =
    granularity === "year"
      ? `ปี ${year + 543}`
      : `${MONTH_NAMES[monthIndex]} ${year + 543}`;

  useEffect(() => {
    const token = getAccessToken();
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
  }, [granularity, year, monthIndex, seriesGranularity]);

  const rows = useMemo(() => {
    if (!series) return [];
    return buildRows(series, seriesGranularity);
  }, [series, seriesGranularity]);

  const bothUnavailable = series && !series.order && !series.auth;

  function handleDownload() {
    if (rows.length === 0) return;

    // Each column carries exactly one unit (บาท / รายการ / คน), so opening
    // this in Excel or pandas and summing a column never mixes currency with
    // a headcount — see the earlier long-format CSV this replaced.
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
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="granularity"
            className="mb-1 block text-xs text-gray-500"
          >
            รูปแบบรายงาน
          </label>
          <select
            id="granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            <option value="month">รายเดือน</option>
            <option value="year">รายปี</option>
          </select>
        </div>

        {granularity === "month" && (
          <div>
            <label htmlFor="month" className="mb-1 block text-xs text-gray-500">
              เดือน
            </label>
            <select
              id="month"
              value={monthIndex}
              onChange={(e) => setMonthIndex(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="year" className="mb-1 block text-xs text-gray-500">
            ปี
          </label>
          <select
            id="year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            {yearChoices().map((y) => (
              <option key={y} value={y}>
                {y + 543}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={loading || rows.length === 0}
          className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          ⬇ ดาวน์โหลด CSV
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">กำลังโหลด...</p>
      ) : bothUnavailable ? (
        <p className="text-sm text-gray-400">
          ไม่สามารถโหลดข้อมูลได้ในขณะนี้ — {UNAVAILABLE}
        </p>
      ) : (
        <>
          <h2 className="mb-1 text-sm font-semibold text-gray-900">
            {granularity === "year"
              ? "ผลการดำเนินงานรายเดือน"
              : "ผลการดำเนินงานรายวัน"}{" "}
            — {periodLabel}
          </h2>
          <p className="mb-3 text-xs text-gray-400">
            รายได้แพลตฟอร์มคำนวณที่ {PLATFORM_FEE_RATE * 100}% ของยอดขายใน
            {granularity === "year" ? "แต่ละเดือน" : "แต่ละวัน"}
          </p>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
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
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={r.period}>
                    <th
                      scope="row"
                      className="px-5 py-3 text-left font-normal text-gray-700"
                    >
                      {i + 1}. {r.label}
                    </th>
                    <td className="px-5 py-3 text-right text-gray-900">
                      {r.orderUnavailable ? UNAVAILABLE : baht(r.gmv)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-900">
                      {r.orderUnavailable
                        ? UNAVAILABLE
                        : baht(r.platformRevenue)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-900">
                      {r.orderUnavailable
                        ? UNAVAILABLE
                        : r.completedOrders.toLocaleString("th-TH")}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-900">
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
    </>
  );
}

export default function ExecutiveReportsPage() {
  return (
    <ExecutiveShell title="รายงานผลการดำเนินงาน" activeTab="/executive/reports">
      <ReportsContent />
    </ExecutiveShell>
  );
}
