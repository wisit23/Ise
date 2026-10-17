"use client";

import { useState } from "react";
import { CHART_INK } from "./palette";

/**
 * DonutChart — SVG pie/donut chart with hover tooltip and detailed legend.
 * data: Array<{ label: string, value: number, count?: number, revenue?: number, color: string }>
 */
export default function DonutChart({
  data = [],
  size = 160,
  strokeWidth = 36,
  formatValue,
}) {
  const [hover, setHover] = useState(null);

  const fmt =
    formatValue ||
    ((v) => (v !== undefined && v !== null ? `฿${Math.round(v).toLocaleString("th-TH")}` : ""));

  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const totalRevenue = data.reduce((s, d) => s + (d.revenue || 0), 0);

  if (!total) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-500">
        ไม่มีข้อมูล
      </div>
    );
  }

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  // Build slices
  let cumulative = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = d.value / total;
      const offset = circumference - fraction * circumference;
      const rotation = cumulative * 360 - 90; // start from top
      cumulative += fraction;
      return { ...d, fraction, offset, rotation };
    });

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          {slices.map((slice, i) => (
            <circle
              key={slice.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth - 2}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={slice.offset}
              strokeLinecap="round"
              style={{
                transform: `rotate(${slice.rotation}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
              }}
              opacity={hover === null || hover === i ? 1 : 0.35}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              className="transition-opacity duration-150 cursor-pointer"
            />
          ))}

          {/* Centre label */}
          {hovered ? (
            <>
              <text
                x={cx}
                y={hovered.revenue ? cy - 10 : cy - 5}
                textAnchor="middle"
                fontSize="17"
                fontWeight="700"
                fill={CHART_INK.primary}
              >
                {((hovered.value / total) * 100).toFixed(0)}%
              </text>
              <text
                x={cx}
                y={hovered.revenue ? cy + 6 : cy + 11}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={CHART_INK.muted}
              >
                {hovered.label}
              </text>
              {hovered.revenue !== undefined && hovered.revenue > 0 && (
                <text
                  x={cx}
                  y={cy + 20}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#059669"
                >
                  {fmt(hovered.revenue)}
                </text>
              )}
            </>
          ) : (
            <>
              <text
                x={cx}
                y={totalRevenue > 0 ? cy - 6 : cy - 3}
                textAnchor="middle"
                fontSize="20"
                fontWeight="700"
                fill={CHART_INK.primary}
              >
                {total} ชิ้น
              </text>
              {totalRevenue > 0 ? (
                <text
                  x={cx}
                  y={cy + 12}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill="#059669"
                >
                  {fmt(totalRevenue)}
                </text>
              ) : (
                <text
                  x={cx}
                  y={cy + 13}
                  textAnchor="middle"
                  fontSize="9"
                  fill={CHART_INK.muted}
                >
                  รวมทั้งหมด
                </text>
              )}
            </>
          )}
        </svg>
      </div>

      {/* Detailed category list below donut */}
      <div className="w-full space-y-1.5 pt-1 border-t border-slate-100">
        {data.map((d, i) => {
          const percent = total > 0 ? Math.round((d.value / total) * 100) : 0;
          const isHov = hover === i;
          return (
            <div
              key={d.label}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition-colors cursor-pointer ${
                isHov
                  ? "bg-emerald-50/80 font-semibold text-emerald-900"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <span className="truncate">{d.label}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-slate-700">
                <span className="text-[11px] text-slate-500">
                  {d.count || d.value} ชิ้น ({percent}%)
                </span>
                {d.revenue !== undefined && d.revenue > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="font-bold text-emerald-700">
                      {fmt(d.revenue)}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
