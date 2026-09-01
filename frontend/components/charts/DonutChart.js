"use client";

import { useState } from "react";
import { CHART_INK } from "./palette";

/**
 * DonutChart — SVG pie/donut chart with hover tooltip and legend.
 * data: Array<{ label: string, value: number, color: string }>
 */
export default function DonutChart({
  data = [],
  size = 160,
  strokeWidth = 36,
}) {
  const [hover, setHover] = useState(null);

  const total = data.reduce((s, d) => s + d.value, 0);
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
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#f3f4f6"
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
                y={cy - 6}
                textAnchor="middle"
                fontSize="18"
                fontWeight="700"
                fill={CHART_INK.primary}
              >
                {((hovered.value / total) * 100).toFixed(0)}%
              </text>
              <text
                x={cx}
                y={cy + 12}
                textAnchor="middle"
                fontSize="9"
                fill={CHART_INK.muted}
              >
                {hovered.label}
              </text>
            </>
          ) : (
            <>
              <text
                x={cx}
                y={cy - 4}
                textAnchor="middle"
                fontSize="22"
                fontWeight="700"
                fill={CHART_INK.primary}
              >
                {total}
              </text>
              <text
                x={cx}
                y={cy + 12}
                textAnchor="middle"
                fontSize="9"
                fill={CHART_INK.muted}
              >
                total
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((d, i) => (
          <div
            key={d.label}
            className="flex items-center gap-1.5 text-xs cursor-pointer"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span
              className={
                hover === i ? "font-semibold text-gray-900" : "text-gray-500"
              }
            >
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
