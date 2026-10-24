"use client";

import { useId, useState } from "react";
import { CHART_COLORS } from "../charts/palette";
import { baht, formatCount, roundMoney } from "../../lib/executive";

/** The line through the points: straight segments, so a rise or a fall shows
 * as a sharp angle and a run of equal values is exactly flat. */
export function getLinePath(points) {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

/**
 * The text for one amount on the left axis: plain numbers up to the
 * hundreds of thousands, then millions ("1.2 ล้าน") so a big total never
 * outgrows the room beside the lines.
 */
export function formatAxisTick(value) {
  if (Math.abs(value) < 1_000_000) return formatCount(value);
  return `${formatCount(roundMoney(value / 1_000_000))} ล้าน`;
}

// How much room to leave above the biggest value, so its point never sits on
// the top line and the amount shown over it has space.
const AXIS_HEADROOM = 1.1;
// Round step sizes, as multiples of a power of ten, fine enough that the top
// line stays close to the data instead of jumping to the next 1, 2 or 5.
const STEP_MULTIPLES = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * The scale for the left axis: four lines, 0 and three equal steps. The top
 * line is the biggest value plus a little headroom, rounded up to the nearest
 * round step, so ฿1,678 gets 0, 800, 1,600, 2,400 and not 0 to 3,000.
 */
export function niceAxis(maxValue) {
  // A step is never under one baht: a ฿0.50 line means nothing here.
  const target = Math.max((maxValue * AXIS_HEADROOM) / 3, 1);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step =
    STEP_MULTIPLES.map((m) => m * magnitude).find((s) => s >= target) ??
    10 * magnitude;
  return { step, max: step * 3, ticks: [0, 1, 2, 3].map((i) => i * step) };
}

/**
 * Modern SVG Line & Area Chart for Executive Trends with direct data labels
 * (กราฟเส้นแสดงแนวโน้ม มีตัวเลขกำกับทุกจุด เข้าใจง่ายใน 5 วินาที ไม่ต้องเอาเมาส์ชี้)
 */
export default function TrendLineChart({
  data = [],
  color = CHART_COLORS.series,
  formatValue,
  label,
  height = 175,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const rawId = useId();
  const gradId = `line-grad-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fmt = formatValue || baht;

  const chartData = data;
  const available = chartData.filter((d) => !d.unavailable);
  const maxVal = Math.max(...available.map((d) => d.value || 0), 1);
  const axis = niceAxis(maxVal);

  const summary = chartData
    .map(
      (d) =>
        `${d.label}: ${d.unavailable ? "ไม่พร้อมใช้งาน" : fmt(d.value || 0)}${
          d.detail ? ` (${d.detail})` : ""
        }`,
    )
    .join(", ");
  const hasSubLabels = chartData.some((d) => d.subLabel);
  // Many points sit close together, so their axis names get smaller type.
  const crowded = chartData.length > 10;
  const hasDetails = chartData.some((d) => d.detail);

  const chartWidth = 520;
  const chartHeight = height - 25;
  // Room on the left for the amounts that label the four lines.
  const axisLabelX = 52;
  const padLeft = 70;
  const padRight = 30;
  const padTop = 32;
  const baselineY = chartHeight - (hasSubLabels ? 38 : 24);
  const drawableHeight = baselineY - padTop;
  const count = Math.max(chartData.length, 1);
  const step = count > 1 ? (chartWidth - padLeft - padRight) / (count - 1) : 0;

  const points = chartData.map((d, i) => {
    const val = d.value || 0;
    // A lone point (a year with one year of data) sits in the middle.
    const x = count > 1 ? padLeft + i * step : chartWidth / 2;
    const ratio = val / axis.max;
    const y = baselineY - ratio * drawableHeight;
    return { x, y, val, item: d, index: i };
  });

  const lineD = getLinePath(points);
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
          className="w-full h-auto"
          style={{ maxHeight: `${height}px` }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Four lines with their amounts on the left; the bottom one is the
              baseline. */}
          {axis.ticks.map((tick, i) => {
            const y = baselineY - (tick / axis.max) * drawableHeight;
            return (
              <g key={tick}>
                <line
                  x1={axisLabelX + 6}
                  y1={y}
                  x2={chartWidth - padRight + 10}
                  y2={y}
                  stroke={i === 0 ? CHART_COLORS.axisLine : CHART_COLORS.track}
                  strokeWidth={i === 0 ? "1.5" : "1"}
                  strokeDasharray={i === 0 ? undefined : "4 4"}
                />
                <text
                  data-axis-label
                  x={axisLabelX}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill={CHART_COLORS.axisText}
                  className="select-none"
                >
                  {/* Plain numbers: the unit is on the amounts you point at. */}
                  {formatAxisTick(tick)}
                </text>
              </g>
            );
          })}

          {/* Gradient Fill Area */}
          {areaD && <path d={areaD} fill={`url(#${gradId})`} />}

          {/* Stroke Line */}
          {lineD && (
            <path
              d={lineD}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="miter"
            />
          )}

          {/* Points */}
          {points.map((pt) => {
            const isHovered = hoveredIdx === pt.index;
            const isUnavail = pt.item.unavailable;

            return (
              <g
                key={pt.index}
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
                  r={isHovered ? "4.5" : "3"}
                  fill={CHART_COLORS.pointFill}
                  stroke={isUnavail ? CHART_COLORS.unavailable : color}
                  strokeWidth={isHovered ? "2.5" : "2"}
                  className="transition-all duration-200"
                />

                {/* The amount shows when the point is pointed at; an
                    unavailable one always says so, never reads as zero. */}
                {(isUnavail || isHovered) && (
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill={isUnavail ? CHART_COLORS.unavailable : color}
                    className="select-none"
                  >
                    {isUnavail ? "ไม่พร้อมใช้งาน" : fmt(pt.val)}
                  </text>
                )}

                {/* Month Label (Below Baseline) */}
                <text
                  x={pt.x}
                  y={baselineY + 16}
                  textAnchor="middle"
                  fontSize={crowded ? "9" : "11"}
                  fontWeight="600"
                  fill={
                    isHovered ? CHART_COLORS.labelActive : CHART_COLORS.label
                  }
                  className="select-none transition-colors"
                >
                  {pt.item.axisLabel ?? (pt.item.shortLabel || pt.item.label)}
                </text>

                {/* Second line under the label, e.g. "(ถึง 14)" for a period still in progress */}
                {pt.item.subLabel && (
                  <text
                    x={pt.x}
                    y={baselineY + 29}
                    textAnchor="middle"
                    fontSize="10"
                    fill={CHART_COLORS.axisText}
                    className="select-none"
                  >
                    {pt.item.subLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {hasDetails && (
        <div
          aria-hidden="true"
          className="h-[3.25rem] overflow-hidden text-xs leading-snug text-slate-500"
        >
          {points[hoveredIdx] ? (
            <>
              <p>
                {points[hoveredIdx].item.fullLabel ||
                  points[hoveredIdx].item.label}
              </p>
              <p className="font-semibold text-slate-800">
                {points[hoveredIdx].item.detail}
              </p>
            </>
          ) : (
            <p>ชี้ที่จุดเพื่อดูยอดขายและรายได้แพลตฟอร์ม</p>
          )}
        </div>
      )}
    </div>
  );
}
