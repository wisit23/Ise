"use client";

import { useState } from "react";
import { CATEGORICAL, CHART_INK } from "./palette";

/** Horizontal "compare magnitude across categories" bar chart. Each bar
 * carries its category name as a direct label, so identity never rests on
 * color alone — no separate legend box needed (see marks-and-anatomy). Folds
 * anything past the 8-slot categorical palette into "อื่นๆ". */
export default function CategoryBarChart({ data, formatValue }) {
  const [hover, setHover] = useState(null);
  const fmt = formatValue || ((v) => v.toLocaleString("th-TH"));

  const capped =
    data.length <= CATEGORICAL.length
      ? data
      : [
          ...data.slice(0, CATEGORICAL.length - 1),
          {
            label: "อื่นๆ",
            value: data
              .slice(CATEGORICAL.length - 1)
              .reduce((sum, d) => sum + d.value, 0),
          },
        ];

  const max = Math.max(...capped.map((d) => d.value), 1);

  if (capped.length === 0) {
    return <p className="text-sm text-gray-400">ไม่มีข้อมูล</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {capped.map((d, i) => {
        const pct = (d.value / max) * 100;
        const isHovered = hover === i;
        return (
          <li
            key={d.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-gray-700">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: CATEGORICAL[i] }}
                />
                {d.label}
              </span>
              <span
                className="font-semibold"
                style={{ color: CHART_INK.primary }}
              >
                {fmt(d.value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(pct, 3)}%`,
                  backgroundColor: CATEGORICAL[i],
                  opacity: isHovered ? 1 : 0.85,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
