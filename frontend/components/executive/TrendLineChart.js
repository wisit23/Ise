"use client";

import { useId, useState } from "react";

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

function getSmoothPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Modern SVG Line & Area Chart for Executive Trends with direct data labels
 * (กราฟเส้นแสดงแนวโน้ม มีตัวเลขกำกับทุกจุด เข้าใจง่ายใน 5 วินาที ไม่ต้องเอาเมาส์ชี้)
 */
export default function TrendLineChart({
  data = [],
  color = "#3b82f6",
  formatValue,
  label,
  height = 175,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const rawId = useId();
  const gradId = `line-grad-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fmt = formatValue || baht;

  const chartData = data.length > 6 ? data.slice(-6) : data;
  const available = chartData.filter((d) => !d.unavailable);
  const maxVal = Math.max(...available.map((d) => d.value || 0), 1);
  const minVal = 0;

  const summary = chartData
    .map(
      (d) =>
        `${d.label}: ${d.unavailable ? "ไม่พร้อมใช้งาน" : fmt(d.value || 0)}`,
    )
    .join(", ");

  const chartWidth = 520;
  const chartHeight = height - 25;
  const padLeft = 40;
  const padRight = 40;
  const padTop = 32;
  const baselineY = chartHeight - 24;
  const drawableHeight = baselineY - padTop;
  const count = Math.max(chartData.length, 1);
  const step = count > 1 ? (chartWidth - padLeft - padRight) / (count - 1) : 0;

  const points = chartData.map((d, i) => {
    const val = d.value || 0;
    const x = padLeft + i * step;
    const ratio = (val - minVal) / (maxVal * 1.15);
    const y = baselineY - ratio * drawableHeight;
    return { x, y, val, item: d, index: i };
  });

  const lineD = getSmoothPath(points);
  const areaD =
    points.length > 1
      ? `${lineD} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
      : "";

  return (
    <div
      role="img"
      aria-label={label ? `${label} — ${summary}` : summary}
      className="flex flex-col gap-1.5"
    >
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto min-w-[340px]"
          style={{ maxHeight: `${height}px` }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Light Grid Lines */}
          <line
            x1={padLeft - 10}
            y1={baselineY}
            x2={chartWidth - padRight + 10}
            y2={baselineY}
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />
          <line
            x1={padLeft - 10}
            y1={baselineY - drawableHeight / 2}
            x2={chartWidth - padRight + 10}
            y2={baselineY - drawableHeight / 2}
            stroke="#f1f5f9"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Gradient Fill Area */}
          {areaD && <path d={areaD} fill={`url(#${gradId})`} />}

          {/* Smooth Stroke Line */}
          {lineD && (
            <path
              d={lineD}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Points & Direct Labels */}
          {points.map((pt) => {
            const isHovered = hoveredIdx === pt.index;
            const isUnavail = pt.item.unavailable;

            return (
              <g
                key={pt.item.label}
                onMouseEnter={() => setHoveredIdx(pt.index)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                {/* Vertical hover guide line */}
                {isHovered && (
                  <line
                    x1={pt.x}
                    y1={padTop}
                    x2={pt.x}
                    y2={baselineY}
                    stroke={color}
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    opacity="0.6"
                  />
                )}

                {/* Outer Ring & Circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "6.5" : "4.5"}
                  fill="#ffffff"
                  stroke={isUnavail ? "#94a3b8" : color}
                  strokeWidth={isHovered ? "3.5" : "2.5"}
                  className="transition-all duration-200"
                />

                {/* Direct In-Chart Data Value (Above Point) */}
                <text
                  x={pt.x}
                  y={pt.y - 9}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={isUnavail ? "#94a3b8" : isHovered ? color : "#1e293b"}
                  className="select-none transition-colors"
                >
                  {isUnavail ? "ไม่พร้อมใช้งาน" : fmt(pt.val)}
                </text>

                {/* Month Label (Below Baseline) */}
                <text
                  x={pt.x}
                  y={baselineY + 16}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill={isHovered ? "#0f172a" : "#64748b"}
                  className="select-none transition-colors"
                >
                  {pt.item.shortLabel || pt.item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
