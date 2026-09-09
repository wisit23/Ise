"use client";

import { useState } from "react";

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

/**
 * Compact Paired Vertical Bar Chart (กราฟแท่งสี่เหลี่ยมคู่กัน 12 เดือน กะทัดรัด จบในหน้าเดียว)
 * showing GMV and Platform Revenue side-by-side with direct values and balanced scaling.
 */
export default function DualTrendChart({
  data = [],
  formatValue,
  label = "แนวโน้มยอดขายรวม (GMV) และรายได้แพลตฟอร์ม",
  height = 190,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const fmt = formatValue || baht;
  const available = data.filter((d) => !d.unavailable);
  const maxGmv = Math.max(...available.map((d) => d.gmv || 0), 1);
  const maxRev = Math.max(...available.map((d) => d.platformRevenue || 0), 1);

  const summary = data
    .map(
      (d) =>
        `${d.label}: GMV ${d.unavailable ? "ไม่พร้อมใช้งาน" : fmt(d.gmv || 0)}, รายได้ ${
          d.unavailable ? "ไม่พร้อมใช้งาน" : fmt(d.platformRevenue || 0)
        }`,
    )
    .join(", ");

  const chartWidth = 920;
  const chartHeight = height - 40;
  const baselineY = chartHeight - 24;
  const maxBarHeight = baselineY - 26;
  const slotWidth = chartWidth / Math.max(data.length, 1);
  const barWidth = 14;
  const barGap = 2;
  const pairWidth = barWidth * 2 + barGap;

  return (
    <div
      role="img"
      aria-label={`${label} — ${summary}`}
      className="flex flex-col gap-2"
    >
      {/* Legend & Subtitle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2 text-xs">
        <span className="text-[11px] text-slate-500">
          แท่งสี่เหลี่ยมคู่กัน (ยอดขายและรายได้) 12 เดือน จัดอัตราส่วนให้เหมาะสม ดูเข้าใจง่าย
        </span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#3b82f6]" />
            <span className="font-semibold text-slate-700">ยอดขายรวม (GMV)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#10b981]" />
            <span className="font-semibold text-slate-700">รายได้แพลตฟอร์ม</span>
          </div>
        </div>
      </div>

      {/* SVG Paired Bar Chart */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto min-w-[680px]"
          style={{ maxHeight: `${height}px` }}
        >
          {/* Baseline */}
          <line
            x1="0"
            y1={baselineY}
            x2={chartWidth}
            y2={baselineY}
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />

          {data.map((d, i) => {
            const slotX = i * slotWidth;
            const pairX = slotX + (slotWidth - pairWidth) / 2;
            const x1 = pairX;
            const x2 = pairX + barWidth + barGap;

            const gmvVal = d.gmv || 0;
            const revVal = d.platformRevenue || 0;

            const h1 = d.unavailable
              ? 8
              : gmvVal === 0
              ? 2
              : Math.max((gmvVal / maxGmv) * maxBarHeight, 4);

            const h2 = d.unavailable
              ? 8
              : revVal === 0
              ? 2
              : Math.max((revVal / maxRev) * maxBarHeight, 4);

            const y1 = baselineY - h1;
            const y2 = baselineY - h2;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={d.label}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                {/* Hover Background */}
                <rect
                  x={slotX + 2}
                  y={4}
                  width={slotWidth - 4}
                  height={baselineY - 4}
                  fill="#f8fafc"
                  rx="4"
                  opacity={isHovered ? 1 : 0}
                  className="transition-opacity"
                />

                {/* 1. GMV Bar (Blue, Rectangular) */}
                <rect
                  x={x1}
                  y={y1}
                  width={barWidth}
                  height={h1}
                  rx="1.5"
                  fill={d.unavailable ? "#cbd5e1" : "#3b82f6"}
                  opacity={hoveredIdx !== null && !isHovered ? 0.6 : 1}
                  className="transition-all"
                />

                {/* 2. Platform Revenue Bar (Green, Rectangular) */}
                <rect
                  x={x2}
                  y={y2}
                  width={barWidth}
                  height={h2}
                  rx="1.5"
                  fill={d.unavailable ? "#e2e8f0" : "#10b981"}
                  opacity={hoveredIdx !== null && !isHovered ? 0.6 : 1}
                  className="transition-all"
                />

                {/* Month Label below baseline */}
                <text
                  x={pairX + pairWidth / 2}
                  y={baselineY + 16}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#475569"
                >
                  {d.shortLabel || d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Value badges / labels directly visible below chart without hovering */}
        <div className="grid grid-cols-6 md:grid-cols-12 gap-1 pt-1 border-t border-slate-100 text-center">
          {data.map((d) => (
            <div
              key={d.label}
              className="flex flex-col items-center py-1 px-0.5 rounded hover:bg-slate-50 transition-colors"
            >
              <span className="text-[10px] font-semibold text-slate-500 truncate w-full">
                <span className="hidden md:inline">{d.fullLabel}</span>
                <span className="md:hidden">{d.shortLabel || d.label}</span>
              </span>
              {d.unavailable ? (
                <span className="text-[9px] font-medium text-slate-400">
                  ไม่พร้อมใช้งาน
                </span>
              ) : (
                <>
                  <span className="text-[10px] font-bold text-blue-700 whitespace-nowrap">
                    {fmt(d.gmv || 0)}
                  </span>
                  <span className="text-[9px] font-semibold text-emerald-700 whitespace-nowrap">
                    {fmt(d.platformRevenue || 0)}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
