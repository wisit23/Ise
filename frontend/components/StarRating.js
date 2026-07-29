"use client";

import { useState } from "react";

/** Read-only star display. `value` can be fractional (e.g. 4.3 renders a partial 4th star). */
export function StarDisplay({ value, size = 16 }) {
  return (
    <span
      className="inline-flex items-center"
      aria-label={`${value.toFixed(1)} จาก 5 ดาว`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span
            key={n}
            className="relative inline-block"
            style={{ width: size, height: size }}
          >
            <span
              className="absolute inset-0 text-gray-200"
              style={{ fontSize: size }}
            >
              ★
            </span>
            <span
              className="absolute inset-0 overflow-hidden text-amber-400"
              style={{ width: `${fill * 100}%`, fontSize: size }}
            >
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Clickable 1-5 star input for writing a review. */
export function StarInput({ value, onChange, size = 28 }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  return (
    <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onClick={() => onChange(n)}
          aria-label={`ให้ ${n} ดาว`}
          className={n <= display ? "text-amber-400" : "text-gray-200"}
          style={{ fontSize: size, lineHeight: 1 }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
