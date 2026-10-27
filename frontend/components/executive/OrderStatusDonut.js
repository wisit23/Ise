"use client";

import { useState } from "react";
import { CATEGORICAL, CHART_COLORS, CHART_INK } from "../charts/palette";
import { formatCount as count } from "../../lib/executive";

/** Executive reading of a paid order's status (see order-service's
 * orderStatusMetrics). The array order is the order the groups are drawn in. */
export const ORDER_STATUS_SLICES = [
  { key: "completed", label: "สำเร็จ", color: CATEGORICAL[5] },
  { key: "inProgress", label: "กำลังดำเนินการ", color: CATEGORICAL[0] },
  {
    key: "disputeRefund",
    label: "ข้อพิพาทและคืนเงิน",
    color: CATEGORICAL[3],
  },
];

const SIZE = 180;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Donut of paid orders by status with the total in the middle. The slices are
 * also listed with their counts and shares, so no figure rests on colour or
 * on hovering. `counts` is null when the order service did not answer, which
 * is shown as unavailable rather than as an empty ring (CEO-DEC-003).
 */
export default function OrderStatusDonut({ counts }) {
  const [hovered, setHovered] = useState(null);

  if (!counts) {
    return <p className="text-sm text-slate-500">ไม่พร้อมใช้งาน</p>;
  }
  if (!counts.total) {
    return (
      <p className="text-sm text-slate-500">
        ยังไม่มีคำสั่งซื้อที่ชำระเงินแล้วในช่วงนี้
      </p>
    );
  }

  const slices = ORDER_STATUS_SLICES.map((slice) => ({
    ...slice,
    value: counts[slice.key] || 0,
  }));
  const visible = slices.filter((s) => s.value > 0);
  // A gap between slices only makes sense when there is more than one.
  const gap = visible.length > 1 ? 2 : 0;

  let offset = 0;
  const arcs = visible.map((slice) => {
    const length = (slice.value / counts.total) * CIRCUMFERENCE;
    const arc = { ...slice, length, offset };
    offset += length;
    return arc;
  });

  const summary = `คำสั่งซื้อที่ชำระเงินแล้ว ${count(counts.total)} รายการ: ${slices
    .map((s) => `${s.label} ${count(s.value)}`)
    .join(", ")}`;

  return (
    <div className="flex flex-col items-center gap-3 xl:flex-row xl:gap-5">
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
          fontSize="28"
          fontWeight="700"
          fill={CHART_INK.primary}
        >
          {count(counts.total)}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 18}
          textAnchor="middle"
          fontSize="12"
          fill={CHART_INK.muted}
        >
          คำสั่งซื้อ
        </text>
      </svg>

      <ul className="w-full min-w-0 divide-y xl:flex-1 divide-slate-100 text-sm">
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
            <span className="flex-1 text-slate-700">{slice.label}</span>
            <span className="font-semibold text-slate-900">
              {count(slice.value)}
            </span>
            <span className="w-10 text-right text-xs text-slate-500">
              {Math.round((slice.value / counts.total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
