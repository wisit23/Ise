"use client";

import { useState } from "react";
import { CHART_INK } from "../charts/palette";

/** Single-series period-over-period trend bar chart for the executive
 * dashboard. Periods a provider failed to report for render as a muted
 * stub bar rather than silently plotting a zero (see CEO-DEC-003). */
export default function TrendChart({
  data,
  color,
  height = 160,
  formatValue,
  label,
}) {
  const [hover, setHover] = useState(null);
  const width = Math.max(data.length * 48, 280);
  const available = data.filter((d) => !d.unavailable);
  const max = Math.max(...available.map((d) => d.value), 1);
  const barWidth = Math.min(32, width / data.length - 8);
  const chartHeight = height - 24;

  const fmt = formatValue || ((v) => v.toLocaleString("th-TH"));

  // The per-bar tooltip is pointer-only, so without this the whole series is
  // unreachable by keyboard/screen reader. role="img" + a spelled-out summary
  // gives non-visual users the same numbers the tooltip shows.
  const summary = data
    .map(
      (d) => `${d.label}: ${d.unavailable ? "ไม่พร้อมใช้งาน" : fmt(d.value)}`,
    )
    .join(", ");

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-full"
        role="img"
        aria-label={label ? `${label} — ${summary}` : summary}
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
          const barHeight = d.unavailable
            ? chartHeight * 0.12
            : (d.value / max) * (chartHeight - 8);
          const y = chartHeight - barHeight;
          const isHovered = hover === i;

          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx="4"
                fill={d.unavailable ? CHART_INK.grid : color}
                opacity={isHovered ? 1 : 0.85}
              />
              <rect
                x={x - 2}
                y="0"
                width={barWidth + 4}
                height={chartHeight}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
              <text
                x={x + barWidth / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize="10"
                fill={CHART_INK.muted}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="mt-1 text-xs text-gray-600">
          <span className="font-medium text-gray-900">{data[hover].label}</span>{" "}
          ·{" "}
          <span className="font-semibold">
            {data[hover].unavailable
              ? "ไม่พร้อมใช้งาน"
              : fmt(data[hover].value)}
          </span>
        </div>
      )}
    </div>
  );
}
