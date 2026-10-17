"use client";

import { useState } from "react";
import {
  CATEGORICAL,
  CATEGORICAL_TINTS,
  CHART_COLORS,
  CHART_INK,
} from "../charts/palette";
import { categoryName } from "../../lib/executive";

// Collapsed, the top five categories are named; expanded, the top ten. Every
// other category is one grey "other" slice.
export const COLLAPSED_SLICES = 5;
export const EXPANDED_SLICES = 10;
const SLICE_COLORS = [...CATEGORICAL, ...CATEGORICAL_TINTS];
const OTHER_COLOR = CHART_INK.baseline;
export const OTHER_LABEL = "หมวดหมู่อื่น ๆ";

const SIZE = 180;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const baht = (n) => `฿${n.toLocaleString("th-TH")}`;

/**
 * The slices to draw: the top categories by what buyers paid, then one "other"
 * slice for the rest of the sales. `total` is everything sold, so the shares
 * are shares of all sales, not of the ranked rows; without it the rows
 * themselves are the whole.
 */
export function buildCategorySlices(rows, total, max = COLLAPSED_SLICES) {
  const named = rows.slice(0, max).map((row, i) => ({
    key: row.id,
    label: categoryName(row),
    gmv: row.gmv,
    color: SLICE_COLORS[i],
  }));
  const whole =
    typeof total?.gmv === "number"
      ? total.gmv
      : rows.reduce((sum, r) => sum + r.gmv, 0);
  const rest =
    Math.round((whole - named.reduce((s, r) => s + r.gmv, 0)) * 100) / 100;
  if (rest > 0) {
    named.push({
      key: "__other",
      label: OTHER_LABEL,
      gmv: rest,
      color: OTHER_COLOR,
    });
  }
  return { slices: named, whole };
}

/**
 * Donut of sales by category with the total paid in the middle. Every slice is
 * also listed with its amount and share, so no figure rests on colour or on
 * hovering. `rows` is null when the product service did not answer, shown as
 * unavailable rather than an empty ring (CEO-DEC-003).
 */
export default function CategoryDonut({ rows, total, expanded = false }) {
  const [hovered, setHovered] = useState(null);

  if (!rows) {
    return <p className="text-sm text-slate-500">ไม่พร้อมใช้งาน</p>;
  }
  const { slices, whole } = buildCategorySlices(
    rows,
    total,
    expanded ? EXPANDED_SLICES : COLLAPSED_SLICES,
  );
  if (slices.length === 0 || !(whole > 0)) {
    return (
      <p className="text-sm text-slate-500">ยังไม่มีสินค้าที่ขายได้ในช่วงนี้</p>
    );
  }

  const gap = slices.length > 1 ? 2 : 0;
  let offset = 0;
  const arcs = slices.map((slice) => {
    const length = (slice.gmv / whole) * CIRCUMFERENCE;
    const arc = { ...slice, length, offset };
    offset += length;
    return arc;
  });

  const summary = `ยอดขายตามหมวดหมู่ รวม ${baht(whole)}: ${slices
    .map((s) => `${s.label} ${baht(s.gmv)}`)
    .join(", ")}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-[132px] w-[132px] shrink-0"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={CHART_COLORS.track}
          strokeWidth={STROKE}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            data-slice={arc.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeDasharray={`${Math.max(arc.length - gap, 0.1)} ${CIRCUMFERENCE}`}
            strokeDashoffset={-arc.offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            opacity={hovered === null || hovered === arc.key ? 1 : 0.35}
            className="cursor-pointer transition-opacity duration-150"
            onPointerEnter={() => setHovered(arc.key)}
            onPointerLeave={() => setHovered(null)}
          />
        ))}
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 2}
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill={CHART_INK.primary}
        >
          {baht(whole)}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 18}
          textAnchor="middle"
          fontSize="12"
          fill={CHART_INK.muted}
        >
          ยอดขายรวม
        </text>
      </svg>

      <ul className="w-full min-w-0 divide-y divide-slate-100 text-sm">
        {slices.map((slice) => (
          <li
            key={slice.key}
            className={`flex items-center gap-2 py-2 ${
              hovered === slice.key ? "font-semibold" : ""
            }`}
            onPointerEnter={() => setHovered(slice.key)}
            onPointerLeave={() => setHovered(null)}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-700">
              {slice.label}
            </span>
            <span className="font-semibold text-slate-900">
              {baht(slice.gmv)}
            </span>
            <span className="w-10 text-right text-xs text-slate-500">
              {Math.round((slice.gmv / whole) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
