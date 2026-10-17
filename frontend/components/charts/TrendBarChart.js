"use client";

import { useState } from "react";
import { SEQUENTIAL_BLUE, CHART_INK } from "./palette";

/** Single-series "trend over time" bar chart (see choosing-a-form: trend job,
 * one categorical hue). Per-bar hover tooltip, no legend needed (one series —
 * the title already names it). */
export default function TrendBarChart({ data = [], height = 160, formatValue }) {
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(() => {
    if (!data || data.length === 0) return null;
    return data.length - 1;
  });

  const width = Math.max(data.length * 28, 280);
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.min(24, (data.length > 0 ? width / data.length : width) - 4);
  const chartHeight = height - 28; // leave room for x-axis labels

  const fmt =
    formatValue ||
    ((v) => (v !== undefined && v !== null ? `฿${Math.round(v).toLocaleString("th-TH")}` : ""));

  const activeIndex =
    hover !== null
      ? hover
      : selected !== null && selected >= 0 && selected < data.length
        ? selected
        : data.length > 0
          ? data.length - 1
          : null;

  const activeData = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-full"
      >
        <line
          x1="0"
          y1={chartHeight}
          x2={width}
          y2={chartHeight}
          stroke={CHART_INK.baseline}
          strokeWidth="1"
        />
        {data.map((d, i) => {
          const slot = width / data.length;
          const x = i * slot + (slot - barWidth) / 2;
          const barHeight = (d.value / max) * (chartHeight - 18);
          const y = chartHeight - barHeight;
          const isActive = activeIndex === i;

          return (
            <g key={d.label}>
              {/* Value label directly above bars that have sales */}
              {d.value > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(y - 4, 10)}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="#1e293b"
                >
                  {fmt(d.value)}
                </text>
              )}

              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx="4"
                fill={SEQUENTIAL_BLUE}
                opacity={isActive ? 1 : 0.75}
              />
              {/* transparent hit target, taller than the bar for easy hover & click */}
              <rect
                x={x - 2}
                y="0"
                width={barWidth + 4}
                height={chartHeight}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => setSelected(i)}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
              {i % Math.ceil(data.length / 7 || 1) === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isActive ? "700" : "400"}
                  fill={isActive ? "#0f172a" : CHART_INK.muted}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Detail / Summary below chart: shows month/date and revenue earned, matching LineChart */}
      <div className="mt-1 flex items-center text-xs text-slate-600 min-h-5 px-0.5">
        {activeData && (
          <div className="flex items-center gap-1">
            <span className="font-semibold text-slate-900">
              {(activeData.fullLabel || activeData.label)}:
            </span>
            <span className="font-bold text-emerald-700">
              {fmt(activeData.value)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
