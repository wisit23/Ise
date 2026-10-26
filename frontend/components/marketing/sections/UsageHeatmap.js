"use client";

import { useMemo, useState } from "react";
import { MARKETING_TIME_ZONE } from "../marketingConstants";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_LABELS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

function bangkokParts(value) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const shifted = new Date(instant.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekday: (shifted.getUTCDay() + 6) % 7,
  };
}

function dateKey({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey({ year, month }) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function inclusiveDayCount(fromDate, toDate) {
  const from = parseCalendarDate(fromDate);
  const to = parseCalendarDate(toDate);
  if (!from || !to || to < from) return null;
  return Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
}

export function resolveUsageHeatmapMode({ preset, fromDate, toDate } = {}) {
  if (preset === "day") return "hour";
  if (preset === "week") return "weekday-hour";
  if (preset === "month") return "day";
  if (preset === "year") return "month";

  const days = inclusiveDayCount(fromDate, toDate);
  if (days === null || days <= 1) return "hour";
  if (days <= 7) return "weekday-hour";
  if (days <= 31) return "day";
  return "month";
}

export function getUsageHeatmapTitle(mode) {
  return (
    {
      hour: "24 ชั่วโมง",
      "weekday-hour": "7 วัน × 24 ชั่วโมง",
      day: "รายวัน",
      month: "รายเดือน",
    }[mode] || "24 ชั่วโมง"
  );
}

export function buildWeekdayHourHeatmap(hourlyUsage = []) {
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const item of hourlyUsage) {
    const parts = bangkokParts(item.hour);
    if (!parts) continue;
    matrix[parts.weekday][parts.hour] += Number(item.usageCount) || 0;
  }
  return matrix;
}

export function buildHourlyHeatmap(hourlyUsage = []) {
  const values = Array(24).fill(0);
  for (const item of hourlyUsage) {
    const parts = bangkokParts(item.hour);
    if (!parts) continue;
    values[parts.hour] += Number(item.usageCount) || 0;
  }
  return values.map((value, hour) => ({
    key: String(hour),
    label: `${String(hour).padStart(2, "0")}:00`,
    value,
  }));
}

function calendarKeys(fromDate, toDate, unit) {
  const from = parseCalendarDate(fromDate);
  const to = parseCalendarDate(toDate);
  if (!from || !to || to < from) return [];
  const keys = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const parts = {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
    };
    const key = unit === "month" ? monthKey(parts) : dateKey(parts);
    if (keys[keys.length - 1] !== key) keys.push(key);
    if (unit === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function buildCalendarHeatmap(
  hourlyUsage = [],
  { mode = "day", fromDate, toDate } = {},
) {
  const unit = mode === "month" ? "month" : "day";
  const totals = new Map(
    calendarKeys(fromDate, toDate, unit).map((key) => [key, 0]),
  );
  for (const item of hourlyUsage) {
    const parts = bangkokParts(item.hour);
    if (!parts) continue;
    const key = unit === "month" ? monthKey(parts) : dateKey(parts);
    if (!totals.has(key)) continue;
    totals.set(key, totals.get(key) + (Number(item.usageCount) || 0));
  }
  return Array.from(totals, ([key, value]) => ({
    key,
    label: new Date(
      `${key}${unit === "month" ? "-01" : ""}T00:00:00+07:00`,
    ).toLocaleDateString(
      "th-TH-u-ca-gregory",
      unit === "month"
        ? { timeZone: MARKETING_TIME_ZONE, month: "short", year: "numeric" }
        : { timeZone: MARKETING_TIME_ZONE, day: "numeric", month: "short" },
    ),
    value,
  }));
}

function intensityClass(value, maxValue) {
  if (!value || !maxValue) return "bg-slate-100 text-slate-400";
  const ratio = value / maxValue;
  if (ratio >= 0.8) return "bg-emerald-700 text-white";
  if (ratio >= 0.6) return "bg-emerald-500 text-white";
  if (ratio >= 0.4) return "bg-emerald-300 text-emerald-950";
  if (ratio >= 0.2) return "bg-emerald-200 text-emerald-900";
  return "bg-emerald-100 text-emerald-800";
}

function LinearHeatmap({ buckets, mode, onActivate }) {
  const maxValue = Math.max(...buckets.map((bucket) => bucket.value), 0);
  const isHourly = mode === "hour";
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className={`grid gap-1 ${isHourly ? "min-w-[720px]" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12"}`}
        style={
          isHourly
            ? { gridTemplateColumns: "repeat(24, minmax(24px, 1fr))" }
            : undefined
        }
        role="grid"
        aria-label={`Heatmap จำนวนผู้ใช้งาน${getUsageHeatmapTitle(mode)}`}
      >
        {buckets.map((bucket) => {
          const label = `${bucket.label} · ${bucket.value.toLocaleString("th-TH")} คน`;
          return (
            <button
              type="button"
              key={bucket.key}
              role="gridcell"
              aria-label={label}
              title={label}
              onPointerEnter={() => onActivate(label)}
              onFocus={() => onActivate(label)}
              onClick={() => onActivate(label)}
              className={`min-h-12 rounded-md px-1 py-2 text-[10px] font-semibold outline-none ring-emerald-500 transition hover:ring-2 focus:ring-2 ${intensityClass(bucket.value, maxValue)}`}
            >
              {bucket.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekdayHourHeatmap({ matrix, onActivate }) {
  const maxValue = Math.max(...matrix.flat(), 0);
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid min-w-[720px] gap-1"
        style={{ gridTemplateColumns: "52px repeat(24, minmax(20px, 1fr))" }}
        role="grid"
        aria-label="Heatmap จำนวนผู้ใช้งานแยกตามวันในสัปดาห์และชั่วโมง"
      >
        <div />
        {Array.from({ length: 24 }, (_, hour) => (
          <div
            key={hour}
            className="text-center text-[9px] text-slate-400"
            aria-hidden="true"
          >
            {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
          </div>
        ))}
        {matrix.map((hours, dayIndex) => (
          <div key={DAY_LABELS[dayIndex]} className="contents" role="row">
            <div className="flex items-center text-[11px] font-semibold text-slate-600">
              {DAY_LABELS[dayIndex]}
            </div>
            {hours.map((value, hour) => {
              const label = `${DAY_LABELS[dayIndex]} ${String(hour).padStart(2, "0")}:00 น. · ${value.toLocaleString("th-TH")} คน`;
              return (
                <button
                  type="button"
                  key={hour}
                  role="gridcell"
                  aria-label={label}
                  title={label}
                  onPointerEnter={() => onActivate(label)}
                  onFocus={() => onActivate(label)}
                  onClick={() => onActivate(label)}
                  className={`h-7 rounded-sm outline-none ring-emerald-500 transition hover:ring-2 focus:ring-2 ${intensityClass(value, maxValue)}`}
                >
                  <span className="sr-only">{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UsageHeatmap({
  hourlyUsage = [],
  mode = "weekday-hour",
  fromDate,
  toDate,
}) {
  const [activeCell, setActiveCell] = useState(null);
  const matrix = useMemo(
    () => buildWeekdayHourHeatmap(hourlyUsage),
    [hourlyUsage],
  );
  const buckets = useMemo(() => {
    if (mode === "hour") return buildHourlyHeatmap(hourlyUsage);
    if (mode === "day" || mode === "month") {
      return buildCalendarHeatmap(hourlyUsage, { mode, fromDate, toDate });
    }
    return [];
  }, [fromDate, hourlyUsage, mode, toDate]);
  const topPeriods = useMemo(
    () =>
      hourlyUsage
        .filter((item) => Number(item.usageCount) > 0)
        .slice()
        .sort((a, b) => Number(b.usageCount) - Number(a.usageCount))
        .slice(0, 3),
    [hourlyUsage],
  );

  return (
    <div className="space-y-3">
      {mode === "weekday-hour" ? (
        <WeekdayHourHeatmap matrix={matrix} onActivate={setActiveCell} />
      ) : (
        <LinearHeatmap
          buckets={buckets}
          mode={mode}
          onActivate={setActiveCell}
        />
      )}
      <div className="flex flex-col gap-2 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span aria-live="polite">
          {activeCell || "แตะหรือวางเมาส์บนช่องสีเพื่อดูจำนวนผู้ใช้งาน"}
        </span>
        <span className="shrink-0">สีอ่อน = น้อย · สีเข้ม = มาก</span>
      </div>
      {topPeriods.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {topPeriods.map((item, index) => (
            <div
              key={item.hour}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="text-[10px] font-semibold text-emerald-600">
                อันดับ {index + 1}
              </div>
              <div className="text-xs font-semibold text-slate-800">
                {new Date(item.hour).toLocaleString("th-TH-u-ca-gregory", {
                  timeZone: MARKETING_TIME_ZONE,
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}{" "}
                น.
              </div>
              <div className="text-[11px] text-slate-500">
                {Number(item.usageCount).toLocaleString("th-TH")} คน
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
