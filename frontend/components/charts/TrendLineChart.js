"use client";

import { useState } from "react";
import { CHART_INK } from "./palette";

const LINE_COLOR = "#7c3aed";

function compactNumber(value) {
  return new Intl.NumberFormat("th-TH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

export default function TrendLineChart({ data, height = 190, formatValue }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const safeData = Array.isArray(data) ? data : [];
  const width = Math.max(safeData.length * 72, 320);
  const padding = { top: 24, right: 24, bottom: 34, left: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...safeData.map((item) => Number(item.value) || 0), 1);
  const valueLabel = formatValue || ((value) => value.toLocaleString("th-TH"));
  const points = safeData.map((item, index) => ({
    ...item,
    x:
      padding.left +
      (safeData.length === 1 ? plotWidth / 2 : (index / (safeData.length - 1)) * plotWidth),
    y: padding.top + plotHeight - ((Number(item.value) || 0) / maxValue) * plotHeight,
  }));

  return (
    <div className="overflow-x-auto pb-1">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-full"
        role="img"
        aria-label="กราฟเส้นแนวโน้มยอดขาย"
      >
        <line
          x1={padding.left}
          y1={padding.top + plotHeight}
          x2={width - padding.right}
          y2={padding.top + plotHeight}
          stroke={CHART_INK.baseline}
        />
        {points.length > 1 && (
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {points.map((point, index) => {
          const isActive = activeIndex === index;
          const showAxisLabel =
            index % Math.ceil(safeData.length / 7 || 1) === 0 ||
            index === safeData.length - 1;
          return (
            <g key={`${point.label}-${index}`}>
              <text
                x={point.x}
                y={Math.max(point.y - 10, 11)}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={CHART_INK.primary}
              >
                {compactNumber(point.value)}
              </text>
              <circle
                cx={point.x}
                cy={point.y}
                r={isActive ? 6 : 4.5}
                fill="white"
                stroke={LINE_COLOR}
                strokeWidth={isActive ? 4 : 3}
                tabIndex="0"
                role="button"
                aria-label={`${point.label}: ${valueLabel(point.value)}`}
                onPointerEnter={() => setActiveIndex(index)}
                onPointerLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                onClick={() => setActiveIndex(index)}
              />
              {showAxisLabel && (
                <text
                  x={point.x}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill={CHART_INK.muted}
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="h-5 text-xs text-slate-600" aria-live="polite">
        {activeIndex !== null && points[activeIndex] ? (
          <>
            <span className="font-medium text-slate-900">
              {points[activeIndex].label}
            </span>{" "}
            · {valueLabel(points[activeIndex].value)}
          </>
        ) : (
          <span className="text-slate-400">แตะหรือวางเมาส์บนจุดเพื่อดูค่า</span>
        )}
      </div>
    </div>
  );
}
