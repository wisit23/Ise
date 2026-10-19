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
  formatValue,
}) {
  const [hover, setHover] = useState(null); // { si, i }
  const [selected, setSelected] = useState(() => {
    if (!series[0]?.data) return null;
    const valid = series[0].data
      .map((d, i) => ({ ...d, i, si: 0 }))
      .filter((d) => d.y !== null && d.y !== undefined);
    if (!valid.length) return null;
    return { si: 0, i: valid[valid.length - 1].i };
  });

  const active = hover || selected;
  const activeSeries = active ? series[active.si] : null;
  const activeData = activeSeries?.data?.[active.i] || null;

  const fmt =
    formatValue ||
    ((v) => (v !== undefined && v !== null ? `฿${Math.round(v).toLocaleString("th-TH")}` : ""));

  if (!series.length || !series[0]?.data?.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-500">
        ไม่มีข้อมูล
      </div>
    );
  }

  const allValues = series.flatMap((s) =>
    s.data
      .filter((d) => d.y !== null && d.y !== undefined)
      .map((d) => d.y),
  );
  const maxY = Math.max(...allValues, 1);
  const minY = 0;
  const labels = series[0].data.map((d) => d.x);
  const n = labels.length;
  const xLabelCount = Math.min(5, n);
  const xLabelIndexes = new Set(
    Array.from({ length: xLabelCount }, (_, index) =>
      xLabelCount === 1
        ? 0
        : Math.round((index * (n - 1)) / (xLabelCount - 1)),
    ),
  );

  const padLeft = 44;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 26;
  const W = 320;
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
    const valid = data
      .map((d, i) => ({ ...d, i }))
      .filter((d) => d.y !== null && d.y !== undefined);
    if (!valid.length) return "";
    return valid
      .map((d, idx) => `${idx === 0 ? "M" : "L"}${xPos(d.i)},${yPos(d.y)}`)
      .join(" ");
  }
  function buildArea(data) {
    const valid = data
      .map((d, i) => ({ ...d, i }))
      .filter((d) => d.y !== null && d.y !== undefined);
    if (!valid.length) return "";
    const line = buildPath(data);
    const firstI = valid[0].i;
    const lastI = valid[valid.length - 1].i;
    const last = `L${xPos(lastI)},${yPos(0)} L${xPos(firstI)},${yPos(0)} Z`;
    return `${line} ${last}`;
  }

  const yTicks = [
    ...new Set(
      Array.from({ length: gridLines + 1 }, (_, i) =>
        Math.round((maxY / gridLines) * i),
      ),
    ),
  ];


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
              x={padLeft - 5}
              y={yPos(tick) + 3}
              textAnchor="end"
              fontSize="8"
              fill={CHART_INK.muted}
            >
              {fmt(tick)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {labels.map((label, i) => {
          if (!xLabelIndexes.has(i)) return null;
          return (
            <text
              key={label}
              x={xPos(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
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
              <path d={buildArea(s.data)} fill={s.color} fillOpacity="0.12" />
            )}
            <path
              d={buildPath(s.data)}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Data points */}
            {s.data.map((d, i) => {
              if (d.y === null || d.y === undefined) return null;
              const isSelected = selected?.si === si && selected?.i === i;
              const isHov = hover?.si === si && hover?.i === i;
              const isActive = isSelected || isHov;
              return (
                <g key={i}>
                  {/* Invisible hit target for easy clicking and hovering */}
                  <circle
                    cx={xPos(i)}
                    cy={yPos(d.y)}
                    r="12"
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => setSelected({ si, i })}
                    onPointerEnter={() => setHover({ si, i })}
                    onPointerLeave={() => setHover(null)}
                  />
                  {/* Halo ring for active/selected point */}
                  {isActive && (
                    <circle
                      cx={xPos(i)}
                      cy={yPos(d.y)}
                      r="6.5"
                      fill={s.color}
                      fillOpacity="0.25"
                      className="pointer-events-none"
                    />
                  )}
                  {/* Core data point */}
                  <circle
                    cx={xPos(i)}
                    cy={yPos(d.y)}
                    r={isActive ? 4.5 : 3}
                    fill={isActive ? s.color : "white"}
                    stroke={s.color}
                    strokeWidth="2"
                    className="cursor-pointer transition-all pointer-events-none"
                  />
                </g>
              );
            })}

          </g>
        ))}
      </svg>

      {/* Detail / Summary below chart: shows month and revenue earned from that month when pressing point */}
      <div className="mt-1 flex items-center text-xs text-slate-600 min-h-5 px-0.5">
        {activeData && (
          <div className="flex items-center gap-1">
            <span className="font-semibold text-slate-900">
              {(activeData.monthFull || activeData.monthLabel || activeData.x)}:
            </span>
            <span className="font-bold text-emerald-700">
              {fmt(activeData.monthValue !== undefined ? activeData.monthValue : activeData.y)}
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-0.5">
          {series.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-1 text-[10px] text-gray-500"
            >
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
