"use client";
import { useEffect, useMemo, useState } from "react";
import { toCsv, downloadCsv } from "../../../lib/csv";
import RadioSelect from "../../ui/RadioSelect";
import {
  baht,
  buddhistYear,
  formatCount,
  roundMoney,
  currentYearMonth,
  dayLabel,
  fetchFirstSaleYear,
  fetchMetricsSeries,
  monthLabel,
  monthWindow,
  MONTH_NAMES,
  feePercent,
  reportYears,
  yearWindow,
  recordReportExport,
} from "../../../lib/executive";

const UNAVAILABLE = "ไม่พร้อมใช้งาน";

/** Builds the [{period,label,gmv,platformRevenue,completedOrders,activeUsers}]
 * rows the table and the CSV both render from. Backbone comes from whichever
 * provider actually answered — if only one did, its periods still drive the
 * row list and the other provider's column reads "ไม่พร้อมใช้งาน" per row
 * (CEO-DEC-003: a provider outage must never render as a silent zero). */
function buildRows({ order, auth }, granularity) {
  const periods = [
    ...new Set([...(order || []), ...(auth || [])].map((row) => row.period)),
  ].sort();
  const orderByPeriod = new Map((order || []).map((r) => [r.period, r]));
  const authByPeriod = new Map((auth || []).map((r) => [r.period, r]));
  const labelFor = granularity === "month" ? monthLabel : dayLabel;

  return periods.map((period) => {
    const o = orderByPeriod.get(period);
    const a = authByPeriod.get(period);
    return {
      period,
      label: labelFor(period),
      gmv: o?.gmv,
      platformRevenue: o?.platformRevenue,
      completedOrders: o?.completedOrders,
      activeUsers: a?.activeUsers,
      orderUnavailable: !o,
      authUnavailable: !a,
    };
  });
}

// ─── Reports Section ─────────────────────────────────────────────────────
// Month/year performance breakdown with CSV export.

export default function ReportsSection({ token }) {
  const now = currentYearMonth();
  const [granularity, setGranularity] = useState("month");
  const [year, setYear] = useState(now.year);
  const [monthIndex, setMonthIndex] = useState(now.monthIndex);
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // The export is recorded in the audit log before the file is handed over.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  // Undefined until the order service has said when the first sale was.
  const [firstSaleYear, setFirstSaleYear] = useState(undefined);
  const years = useMemo(() => reportYears(firstSaleYear), [firstSaleYear]);

  useEffect(() => {
    let cancelled = false;
    fetchFirstSaleYear(token).then((first) => {
      if (cancelled) return;
      setFirstSaleYear(first);
      // A year picked from the stand-in list may predate the first sale.
      setYear((picked) => Math.max(picked, reportYears(first).at(-1)));
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const seriesGranularity = granularity === "year" ? "month" : "day";
  const periodLabel =
    granularity === "year"
      ? `ปี ${buddhistYear(year)}`
      : `${MONTH_NAMES[monthIndex]} ${buddhistYear(year)}`;

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

  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    const hasOrderUnavailable = rows.some((r) => r.orderUnavailable);
    const hasAuthUnavailable = rows.some((r) => r.authUnavailable);
    return {
      gmv: hasOrderUnavailable
        ? null
        : roundMoney(rows.reduce((sum, r) => sum + (r.gmv || 0), 0)),
      platformRevenue: hasOrderUnavailable
        ? null
        : roundMoney(
            rows.reduce((sum, r) => sum + (r.platformRevenue || 0), 0),
          ),
      completedOrders: hasOrderUnavailable
        ? null
        : rows.reduce((sum, r) => sum + (r.completedOrders || 0), 0),
      // Web usage adds up bucket by bucket: someone who comes on three days
      // counts three times (CEO-DEC-007).
      activeUsers: hasAuthUnavailable
        ? null
        : rows.reduce((sum, r) => sum + (r.activeUsers || 0), 0),
      orderUnavailable: hasOrderUnavailable,
      authUnavailable: hasAuthUnavailable,
    };
  }, [rows]);

  const bothUnavailable = series && !series.order && !series.auth;

  async function handleDownload() {
    if (rows.length === 0 || exporting) return;

    const columns = [
      { key: "label", label: "ช่วงเวลา" },
      { key: "gmv", label: "ยอดขาย (บาท)" },
      { key: "platformRevenue", label: "รายได้แพลตฟอร์ม (บาท)" },
      { key: "completedOrders", label: "คำสั่งซื้อ (รายการ)" },
      { key: "activeUsers", label: "ผู้ใช้งานเว็บ (คน)" },
    ];

    const csvRows = rows.map((r) => ({
      label: r.label,
      gmv: r.orderUnavailable ? UNAVAILABLE : r.gmv,
      platformRevenue: r.orderUnavailable ? UNAVAILABLE : r.platformRevenue,
      completedOrders: r.orderUnavailable ? UNAVAILABLE : r.completedOrders,
      activeUsers: r.authUnavailable ? UNAVAILABLE : r.activeUsers,
    }));

    if (totals) {
      csvRows.push({
        label: "รวมทั้งหมด",
        gmv: totals.orderUnavailable ? UNAVAILABLE : totals.gmv,
        platformRevenue: totals.orderUnavailable
          ? UNAVAILABLE
          : totals.platformRevenue,
        completedOrders: totals.orderUnavailable
          ? UNAVAILABLE
          : totals.completedOrders,
        activeUsers: totals.authUnavailable ? UNAVAILABLE : totals.activeUsers,
      });
    }

    const csv = toCsv(columns, csvRows);
    const slug =
      granularity === "year"
        ? `${year}`
        : `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

    // No record, no file: an export the audit log cannot vouch for is not
    // handed over (CEO-DEC-016).
    setExporting(true);
    setExportError("");
    try {
      await recordReportExport(
        { granularity, year, monthIndex, rowCount: rows.length, slug },
        token,
      );
    } catch {
      setExportError(
        "บันทึกประวัติการส่งออกไม่สำเร็จ จึงยังไม่ดาวน์โหลดไฟล์ กรุณาลองใหม่",
      );
      return;
    } finally {
      setExporting(false);
    }
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
            options={years.map((y) => ({
              value: y,
              label: String(buddhistYear(y)),
            }))}
            size="sm"
            variant="panel"
          />
        </div>

        <button
          onClick={handleDownload}
          disabled={loading || exporting || rows.length === 0}
          className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {exporting ? "กำลังเตรียมไฟล์..." : "⬇ ดาวน์โหลด CSV"}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {exportError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {exportError}
        </p>
      )}

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
            {feePercent(series?.feeRate) === null
              ? "รายได้แพลตฟอร์มคำนวณจากยอดขาย"
              : `รายได้แพลตฟอร์มคำนวณที่ ${feePercent(series.feeRate)}% ของยอดขาย`}
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th scope="col" className="px-5 py-3 text-left font-medium">
                    ช่วงเวลา
                  </th>
                  <th scope="col" className="px-5 py-3 text-center font-medium">
                    ยอดขาย
                  </th>
                  <th scope="col" className="px-5 py-3 text-center font-medium">
                    รายได้แพลตฟอร์ม
                  </th>
                  <th scope="col" className="px-5 py-3 text-center font-medium">
                    คำสั่งซื้อ
                  </th>
                  <th scope="col" className="px-5 py-3 text-center font-medium">
                    ผู้ใช้งานเว็บ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.period}>
                    <th
                      scope="row"
                      className="px-5 py-3 text-left font-normal text-slate-700"
                    >
                      {r.label}
                    </th>
                    <td className="px-5 py-3 text-center text-slate-900">
                      {r.orderUnavailable ? UNAVAILABLE : baht(r.gmv)}
                    </td>
                    <td className="px-5 py-3 text-center text-slate-900">
                      {r.orderUnavailable
                        ? UNAVAILABLE
                        : baht(r.platformRevenue)}
                    </td>
                    <td className="px-5 py-3 text-center text-slate-900">
                      {r.orderUnavailable
                        ? UNAVAILABLE
                        : formatCount(r.completedOrders)}
                    </td>
                    <td className="px-5 py-3 text-center text-slate-900">
                      {r.authUnavailable
                        ? UNAVAILABLE
                        : formatCount(r.activeUsers)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50/80 font-bold text-slate-900">
                  <tr>
                    <th
                      scope="row"
                      className="px-5 py-3.5 text-left font-bold text-slate-900"
                    >
                      รวมทั้งหมด
                    </th>
                    <td className="px-5 py-3.5 text-center font-bold text-slate-900">
                      {totals.orderUnavailable ? UNAVAILABLE : baht(totals.gmv)}
                    </td>
                    <td className="px-5 py-3.5 text-center font-bold text-slate-900">
                      {totals.orderUnavailable
                        ? UNAVAILABLE
                        : baht(totals.platformRevenue)}
                    </td>
                    <td className="px-5 py-3.5 text-center font-bold text-slate-900">
                      {totals.orderUnavailable
                        ? UNAVAILABLE
                        : formatCount(totals.completedOrders)}
                    </td>
                    <td className="px-5 py-3.5 text-center font-bold text-slate-900">
                      {totals.authUnavailable
                        ? UNAVAILABLE
                        : formatCount(totals.activeUsers)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {`ผู้ใช้งานเว็บนับจากผู้ซื้อและผู้ขายที่ล็อกอิน · นับเป็นรายวัน คนที่กลับมาใช้ซ้ำนับทุกวัน แถวรวมคือผลรวมของทุกวันในช่วง`}
          </p>
        </>
      )}
    </div>
  );
}
