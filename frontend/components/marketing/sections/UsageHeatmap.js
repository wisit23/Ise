"use client";

import { MARKETING_TIME_ZONE } from "../marketingConstants";

import { useMemo, useState } from "react";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_LABELS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

export function buildWeekdayHourHeatmap(hourlyUsage = []) {
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const item of hourlyUsage) {
    const instant = new Date(item.hour);
    if (Number.isNaN(instant.getTime())) continue;
    const bangkok = new Date(instant.getTime() + BANGKOK_OFFSET_MS);
    const dayIndex = (bangkok.getUTCDay() + 6) % 7;
    matrix[dayIndex][bangkok.getUTCHours()] += Number(item.usageCount) || 0;
  }
  return matrix;
}

function intensityClass(value, maxValue) {
  if (!value || !maxValue) return "bg-slate-100 text-slate-400";
  const ratio = value / maxValue;
  if (ratio >= 0.8) return "bg-violet-700 text-white";
  if (ratio >= 0.6) return "bg-violet-500 text-white";
  if (ratio >= 0.4) return "bg-violet-300 text-violet-950";
  if (ratio >= 0.2) return "bg-violet-200 text-violet-900";
  return "bg-violet-100 text-violet-800";
}

export default function UsageHeatmap({ hourlyUsage = [] }) {
  const [activeCell, setActiveCell] = useState(null);
  const matrix = useMemo(
    () => buildWeekdayHourHeatmap(hourlyUsage),
    [hourlyUsage],
  );
  const maxValue = Math.max(...matrix.flat(), 0);
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
                    onPointerEnter={() => setActiveCell(label)}
                    onFocus={() => setActiveCell(label)}
                    onClick={() => setActiveCell(label)}
                    className={`h-7 rounded-sm outline-none ring-violet-500 transition hover:ring-2 focus:ring-2 ${intensityClass(value, maxValue)}`}
                  >
                    <span className="sr-only">{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
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
              <div className="text-[10px] font-semibold text-violet-600">
                อันดับ {index + 1}
              </div>
              <div className="text-xs font-semibold text-slate-800">
                {new Date(item.hour).toLocaleString("th-TH", {
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
