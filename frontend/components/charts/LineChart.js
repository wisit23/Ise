"use client";

import { useState } from "react";
import { CHART_INK } from "./palette";

/**
 * LineChart — SVG line chart (optionally area-filled), multi-series or single.
 * series: Array<{ label: string, color: string, data: Array<{ x: string, y: number }> }>
 * height: number (px)
 */
export default function LineChart({
  series = [],
  height = 160,
  fillArea = false,
  gridLines = 4,
}) {
  const [hover, setHover] = useState(null); // { seriesIdx, pointIdx }

  if (!series.length || !series[0]?.data?.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        ไม่มีข้อมูล
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.data.map((d) => d.y));
  const maxY = Math.max(...allValues, 1);
  const minY = 0;
  const labels = series[0].data.map((d) => d.x);
  const n = labels.length;

  const padLeft = 32;
  const padRight = 8;
  const padTop = 10;
  const padBottom = 24;
  const W = 300;
  const H = height;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  function xPos(i) {
    return padLeft + (i / Math.max(n - 1, 1)) * chartW;
  }
  function yPos(v) {
    return padTop + chartH - ((v - minY) / (maxY - minY)) * chartH;
  }

  function buildPath(data) {
    return data
      .map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yPos(d.y)}`)
      .join(" ");
  }
  function buildArea(data) {
    const line = buildPath(data);
    const last = `L${xPos(data.length - 1)},${yPos(0)} L${xPos(0)},${yPos(0)} Z`;
    return `${line} ${last}`;
  }

  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxY / gridLines) * i)
  );

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padLeft}
              y1={yPos(tick)}
              x2={W - padRight}
              y2={yPos(tick)}
              stroke={CHART_INK.grid}
              strokeWidth="1"
              strokeDasharray="4 2"
            />
            <text
              x={padLeft - 4}
              y={yPos(tick) + 3}
              textAnchor="end"
              fontSize="8"
              fill={CHART_INK.muted}
            >
              {tick}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {labels.map((label, i) => {
          const step = Math.ceil(n / 5);
          if (i % step !== 0 && i !== n - 1) return null;
          return (
            <text
              key={label}
              x={xPos(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize="8"
              fill={CHART_INK.muted}
            >
              {label}
            </text>
          );
        })}

        {/* Series */}
        {series.map((s, si) => (
          <g key={s.label}>
            {fillArea && (
              <path
                d={buildArea(s.data)}
                fill={s.color}
                fillOpacity="0.12"
              />
            )}
            <path
              d={buildPath(s.data)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Data points */}
            {s.data.map((d, i) => {
              const isHov = hover?.si === si && hover?.i === i;
              return (
                <circle
                  key={i}
                  cx={xPos(i)}
                  cy={yPos(d.y)}
                  r={isHov ? 4 : 3}
                  fill="white"
                  stroke={s.color}
                  strokeWidth="2"
                  className="cursor-pointer transition-all"
                  onPointerEnter={() => setHover({ si, i })}
                  onPointerLeave={() => setHover(null)}
                />
              );
            })}
          </g>
        ))}

        {/* Hover tooltip */}
        {hover && (() => {
          const s = series[hover.si];
          const d = s.data[hover.i];
          const tx = Math.min(Math.max(xPos(hover.i), 40), W - 40);
          const ty = Math.max(yPos(d.y) - 20, padTop + 5);
          return (
            <g>
              <rect
                x={tx - 28}
                y={ty - 12}
                width={56}
                height={18}
                rx="4"
                fill="#1f2937"
                fillOpacity="0.88"
              />
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                fontSize="9"
                fill="white"
                fontWeight="600"
              >
                {d.x}: {d.y}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Legend */}
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-0.5">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1 text-[10px] text-gray-500">
              <span
                className="inline-block h-2 w-5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
