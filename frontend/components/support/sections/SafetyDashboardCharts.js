"use client";
import { useId, useState, useRef, useEffect } from "react";
import styles from "./SafetyDashboard.module.css";

const fmt = (value) => value.toLocaleString("th-TH");

function ChartState({ loading, error, empty }) {
  return (
    <p
      role="status"
      className="flex min-h-40 items-center justify-center text-sm text-slate-500"
    >
      {error
        ? "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"
        : loading
          ? "กำลังโหลดข้อมูล…"
          : empty
            ? "ยังไม่มีเคสในข้อมูลชุดนี้"
            : ""}
    </p>
  );
}

export function CategoryBars({ data, loading, error }) {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...data.map((row) => row.value));
  if (error || loading) return <ChartState loading={loading} error={error} />;
  return (
    <div>
      <p className={styles.categoryHeader}>
        <span>
          <strong>{fmt(total)}</strong> เคสทั้งหมด
        </span>
        <span>จำนวน / สัดส่วน</span>
      </p>
      <ul className="space-y-4" aria-label="จำนวนเคสแยกตามกลุ่ม">
        {data.map((row) => (
          <li key={row.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-700">{row.label}</span>
              <span className="shrink-0 tabular-nums">
                <strong className="text-slate-900">{fmt(row.value)}</strong>
                <span className="ml-2 text-xs text-slate-500">
                  {total ? Math.round((row.value / total) * 100) : 0}%
                </span>
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-2.5 overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  backgroundColor: row.color || "#15966b",
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {!total && (
        <p className="mt-4 text-xs text-slate-500">ยังไม่มีเคสในข้อมูลชุดนี้</p>
      )}
    </div>
  );
}

export function DailyVolume({ data, loading, error, hourly = false }) {
  const gradientId = useId().replace(/:/g, "");
  const [selected, setSelected] = useState(null);
  const chartRef = useRef(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const element = chartRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, error, data.length]);
  if (error || loading || !data.length)
    return <ChartState loading={loading} error={error} empty={!data.length} />;
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const peak = Math.max(...data.map((row) => row.value));
  const step = Math.max(1, Math.ceil(peak / 3));
  const ceiling = step * 3;
  const left = 58,
    right = width - 26,
    top = 35,
    bottom = 200;
  const points = data.map((row, index) => ({
    ...row,
    x:
      data.length === 1
        ? (left + right) / 2
        : left + (index * (right - left)) / (data.length - 1),
    y: bottom - (row.value / ceiling) * (bottom - top),
  }));
  const line = points
    .map((p, i) => (i ? "L" : "M") + p.x + "," + p.y)
    .join(" ");
  const active = points[selected ?? points.length - 1];
  const tooltipX = Math.max(64, Math.min(width - 64, active.x));
  const tooltipY = Math.max(0, active.y - 60);
  const labelEvery = Math.max(
    1,
    Math.ceil((points.length - 1) / (width < 500 ? 3 : 6)),
  );
  return (
    <div ref={chartRef} className={styles.chart}>
      <dl className={styles.chartSummary}>
        <div>
          <dt>เคสใหม่ในช่วงที่เลือก</dt>
          <dd>
            {fmt(total)}
            <span>เคส</span>
          </dd>
        </div>
        <div>
          <dt>{hourly ? "เฉลี่ยต่อชั่วโมง" : "เฉลี่ยต่อวัน"}</dt>
          <dd>
            {(total / data.length).toLocaleString("th-TH", {
              maximumFractionDigits: 1,
            })}
            <span>เคส</span>
          </dd>
        </div>
        <div>
          <dt>{hourly ? "สูงสุดต่อชั่วโมง" : "สูงสุดต่อวัน"}</dt>
          <dd>
            {fmt(peak)}
            <span>เคส</span>
          </dd>
        </div>
      </dl>
      <svg
        viewBox={`0 0 ${width} 240`}
        role="group"
        aria-label={
          hourly
            ? "กราฟแนวโน้มจำนวนเคสใหม่รายชั่วโมง"
            : "กราฟแนวโน้มจำนวนเคสใหม่รายวัน"
        }
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15966b" stopOpacity=".24" />
            <stop offset="100%" stopColor="#15966b" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const y = bottom - (i / 3) * (bottom - top);
          return (
            <g key={i}>
              <line
                x1={left}
                y1={y}
                x2={right}
                y2={y}
                stroke="#dce2ea"
                strokeDasharray="6 6"
              />
              <text
                x={left - 12}
                y={y + 4}
                textAnchor="end"
                fill="#718096"
                fontSize="12"
              >
                {fmt(i * step)}
              </text>
            </g>
          );
        })}
        {points.length > 1 && (
          <>
            <path
              d={
                line +
                " L" +
                right +
                "," +
                bottom +
                " L" +
                left +
                "," +
                bottom +
                " Z"
              }
              fill={"url(#" + gradientId + ")"}
            />
            <path
              d={line}
              fill="none"
              stroke="#15966b"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </>
        )}
        {points.map((p, i) => (
          <g key={p.label}>
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text
                x={p.x}
                y="227"
                textAnchor="middle"
                fill="#718096"
                fontSize="11"
              >
                {p.label}
              </text>
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={selected === i ? 6 : 4}
              fill={selected === i ? "white" : "#15966b"}
              stroke="#15966b"
              strokeWidth="2"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r="12"
              fill="transparent"
              tabIndex="0"
              role="button"
              aria-label={p.label + ": " + fmt(p.value) + " เคส"}
              onPointerEnter={() => setSelected(i)}
              onPointerLeave={() => setSelected(null)}
              onFocus={() => setSelected(i)}
              onBlur={() => setSelected(null)}
              onClick={() => setSelected(i)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(i);
                }
              }}
            >
              <title>
                {p.label}: {fmt(p.value)} เคส
              </title>
            </circle>
          </g>
        ))}
        {selected !== null && (
          <g pointerEvents="none" aria-hidden="true">
            <rect
              x={tooltipX - 52}
              y={tooltipY}
              width="104"
              height="48"
              rx="8"
              fill="#253044"
            />
            <text
              x={tooltipX}
              y={tooltipY + 17}
              textAnchor="middle"
              fill="#a7f3d0"
              fontSize="11"
            >
              {active.label}
            </text>
            <text
              x={tooltipX}
              y={tooltipY + 35}
              textAnchor="middle"
              fill="white"
              fontSize="13"
              fontWeight="700"
            >
              {fmt(active.value)} เคส
            </text>
          </g>
        )}
      </svg>
      <div className={styles.chartReadout} aria-live="polite">
        <span>{active.label}</span>
        <strong>{fmt(active.value)} เคส</strong>
      </div>
      {peak === 0 && (
        <p className="mt-2 text-center text-xs text-slate-500">
          ไม่มีเคสใหม่ในช่วงเวลานี้
        </p>
      )}
    </div>
  );
}
