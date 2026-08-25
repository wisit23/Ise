"use client";

import { useState } from "react";
import { SEQUENTIAL_BLUE, CHART_INK } from "./palette";

/** Single-series "trend over time" bar chart (see choosing-a-form: trend job,
 * one categorical hue). Per-bar hover tooltip, no legend needed (one series —
 * the title already names it). */
export default function TrendBarChart({ data, height = 160, formatValue }) {
  const [hover, setHover] = useState(null);
  const width = Math.max(data.length * 28, 280);
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.min(24, width / data.length - 4);
  const chartHeight = height - 24; // leave room for x-axis labels

  const fmt = formatValue || ((v) => v.toLocaleString("th-TH"));

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
          const barHeight = (d.value / max) * (chartHeight - 8);
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
                fill={SEQUENTIAL_BLUE}
                opacity={isHovered ? 1 : 0.85}
              />
              {/* transparent hit target, taller than the bar for easy hover */}
              <rect
                x={x - 2}
                y="0"
                width={barWidth + 4}
                height={chartHeight}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
              {i % Math.ceil(data.length / 7 || 1) === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill={CHART_INK.muted}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className={`mt-1 h-5 text-xs text-gray-600 transition-opacity duration-200 ${hover !== null ? "opacity-100" : "opacity-0"}`}>
        {hover !== null && (
          <>
            <span className="font-medium text-gray-900">{data[hover].label}</span>{" "}
            · <span className="font-semibold">{fmt(data[hover].value)}</span>
          </>
        )}
      </div>
    </div>
  );
}
