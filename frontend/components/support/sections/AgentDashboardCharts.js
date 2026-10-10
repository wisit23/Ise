"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  CASE_COLORS,
  CASE_SERIES,
  CASE_TEXT_COLORS,
} from "./agentDashboardPalette";

function useCompactChart() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

const fmt = (value) => Number(value).toLocaleString("th-TH");

function SeriesSwatch({ series, visible = true }) {
  const color = visible ? series.color : "rgb(var(--color-line-strong))";
  return (
    <svg
      width="30"
      height="16"
      viewBox="0 0 30 16"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M1 8H29"
        stroke={series.outline || color}
        strokeWidth={series.key === "disputes" ? 3.5 : 2.5}
        strokeDasharray={series.key === "disputes" ? "8 5" : undefined}
        strokeLinecap="round"
      />
      {series.key === "disputes" ? (
        <>
          <path
            d="M1 8H29"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="8 5"
            strokeLinecap="round"
          />
          <path
            d="M15 4 19 8 15 12 11 8Z"
            fill={color}
            stroke={series.outline}
            strokeWidth="1"
          />
        </>
      ) : (
        <circle
          cx="15"
          cy="8"
          r="3"
          fill="white"
          stroke={color}
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

export function ChartLegend({
  rows,
  visible = { tickets: true, disputes: true },
  onToggle,
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-2" aria-label="เส้นข้อมูล">
      {CASE_SERIES.map((series) =>
        onToggle ? (
          <button
            key={series.key}
            type="button"
            aria-pressed={visible[series.key]}
            title={`${visible[series.key] ? "ซ่อน" : "แสดง"}เส้น ${series.label}`}
            onClick={() => onToggle(series.key)}
            className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs focus-visible:ring-2 focus-visible:ring-emerald-600 ${visible[series.key] ? "border-slate-200 text-slate-700" : "border-transparent text-slate-400"}`}
          >
            <span
              className="agent-series-check"
              data-checked={visible[series.key]}
              aria-hidden="true"
            >
              {visible[series.key] && (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="m2.5 6 2.2 2.2 4.8-4.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <SeriesSwatch series={series} visible={visible[series.key]} />
            {series.label}
            <strong>
              {fmt(rows.reduce((sum, row) => sum + row[series.key], 0))}
            </strong>
          </button>
        ) : (
          <span
            key={series.key}
            className="flex items-center gap-2 text-xs text-slate-500"
          >
            <SeriesSwatch series={series} />
            {series.label}
          </span>
        ),
      )}
    </div>
  );
}

export function smoothLinePath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  const slopes = points
    .slice(1)
    .map((point, i) => (point.y - points[i].y) / (point.x - points[i].x));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === points.length - 1) return slopes.at(-1);
    const before = slopes[i - 1],
      after = slopes[i];
    return before * after <= 0
      ? 0
      : Math.sign(before) *
          Math.min(
            Math.abs((before + after) / 2),
            3 * Math.min(Math.abs(before), Math.abs(after)),
          );
  });
  return points.slice(1).reduce((path, point, i) => {
    const from = points[i],
      dx = (point.x - from.x) / 3;
    return (
      path +
      ` C${from.x + dx},${from.y + tangents[i] * dx} ${point.x - dx},${point.y - tangents[i + 1] * dx} ${point.x},${point.y}`
    );
  }, `M${points[0].x},${points[0].y}`);
}

export function ComparisonChart({
  rows,
  kind,
  visible = { tickets: true, disputes: true },
  onToggle,
  hideLegend = false,
  singleSeriesRows = false,
  stackedRows = false,
}) {
  const compact = useCompactChart();
  const descriptionId = useId();
  const svgRef = useRef(null);
  const chartRef = useRef(null);
  const tooltipId = useId();
  const [size, setSize] = useState({ width: 640, height: 185 });
  useEffect(() => {
    if (!svgRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0)
        setSize((current) =>
          Math.abs(current.width - rect.width) < 0.5 &&
          Math.abs(current.height - rect.height) < 0.5
            ? current
            : { width: rect.width, height: rect.height },
        );
    });
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);
  const width = size.width;
  const height = size.height;
  const [hover, setHover] = useState(null);
  const shown = CASE_SERIES.filter((series) => visible[series.key]);
  const maximum = Math.max(
    1,
    ...rows.flatMap((row) =>
      stackedRows
        ? [row.tickets + row.disputes]
        : shown.map((series) => row[series.key]),
    ),
  );
  const ticks = Math.min(maximum, height < 90 ? 1 : height < 125 ? 2 : 4);
  const steps = Math.max(1, Math.ceil(maximum / ticks));
  const top = steps * ticks;
  const x = (i) => 42 + (i / Math.max(1, rows.length - 1)) * (width - 65);
  const y = (value) => height - 30 - (value / top) * Math.max(15, height - 55);
  const seriesPath = (series) =>
    smoothLinePath(rows.map((row, i) => ({ x: x(i), y: y(row[series.key]) })));
  const hoverIndex = rows.findIndex((row) => row.label === hover?.label);
  const hovered = hoverIndex >= 0 && shown.length ? rows[hoverIndex] : null;
  const svgBox = svgRef.current?.getBoundingClientRect();
  const chartBox = chartRef.current?.getBoundingClientRect();
  const hoverY = hovered
    ? Math.min(...shown.map((series) => y(hovered[series.key])))
    : 0;
  const below = hoverY < 100;
  const tooltipLeft =
    Math.max(86, Math.min(width - 86, x(hoverIndex))) *
      ((svgBox?.width || width) / width) +
    ((svgBox?.left || 0) - (chartBox?.left || 0));
  const tooltipTop =
    hoverY * ((svgBox?.height || height) / height) +
    ((svgBox?.top || 0) - (chartBox?.top || 0)) +
    (below ? 14 : -14);
  const hitStep = (width - 65) / Math.max(1, rows.length - 1);
  const barMax = Math.max(2, Math.ceil(maximum / 2) * 2);
  const plotStart = kind === "bar" ? Math.min(140, width * 0.43) : 42;
  const plotWidth =
    width - plotStart - (stackedRows ? 128 : singleSeriesRows ? 38 : 72);
  const rowHeight = Math.max(
    10,
    (height - (stackedRows ? 44 : 36)) / Math.max(1, rows.length),
  );
  const barThickness = Math.min(9, Math.max(3, (rowHeight - 4) / 2));
  return (
    <div className="agent-chart" ref={chartRef}>
      {!hideLegend && (
        <ChartLegend rows={rows} visible={visible} onToggle={onToggle} />
      )}
      <svg
        ref={svgRef}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-describedby={descriptionId}
        aria-label={`${kind === "line" ? "แนวโน้มรับงาน" : "เปรียบเทียบเคส"} ${shown.map((series) => series.label).join(" และ ")}`}
        viewBox={`0 0 ${width} ${height}`}
        className="agent-chart-plot"
      >
        <desc id={descriptionId}>
          {rows
            .map(
              (row) =>
                `${kind === "line" ? dayLabel(row.label) : row.label}: ${shown.map((series) => `${series.label} ${fmt(row[series.key])} เคส`).join(", ")}`,
            )
            .join("; ")}
        </desc>
        {kind === "line" ? (
          <>
            <defs>
              {CASE_SERIES.map((series) => (
                <linearGradient
                  key={series.key}
                  id={`${descriptionId}-${series.key}-fill`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={series.color}
                    stopOpacity="0.12"
                  />
                  <stop
                    offset="100%"
                    stopColor={series.color}
                    stopOpacity="0"
                  />
                </linearGradient>
              ))}
            </defs>
            {Array.from({ length: ticks + 1 }, (_, i) => i).map((i) => (
              <g key={i}>
                <line
                  x1="42"
                  x2={width - 23}
                  y1={y(i * steps)}
                  y2={y(i * steps)}
                  stroke="rgb(var(--color-line))"
                  strokeDasharray="3 4"
                />
                <text
                  x="33"
                  y={y(i * steps) + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="rgb(var(--color-ink-subtle))"
                >
                  {i * steps}
                </text>
              </g>
            ))}
            <text
              x="42"
              y="15"
              fontSize="12"
              fill="rgb(var(--color-ink-subtle))"
            >
              เคส / วัน
            </text>
            {shown.map((series) => (
              <g key={series.key}>
                <path
                  d={`${seriesPath(series)} L${x(rows.length - 1)},${y(0)} L${x(0)},${y(0)} Z`}
                  fill={`url(#${descriptionId}-${series.key}-fill)`}
                />
                {series.outline && (
                  <path
                    d={seriesPath(series)}
                    fill="none"
                    stroke="white"
                    strokeWidth="7"
                    strokeDasharray="10 8"
                    strokeLinecap="round"
                  />
                )}
                {series.outline && (
                  <path
                    d={seriesPath(series)}
                    fill="none"
                    stroke={series.outline}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="10 8"
                  />
                )}
                <path
                  d={seriesPath(series)}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={series.key === "tickets" ? 3 : 2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={
                    series.key === "disputes" ? "10 8" : undefined
                  }
                />
                {rows.map((row, i) =>
                  series.key === "tickets" ? (
                    <circle
                      key={row.label}
                      data-series="tickets"
                      cx={x(i)}
                      cy={y(row.tickets)}
                      r="4.6"
                      fill="white"
                      stroke={series.color}
                      strokeWidth="1.8"
                    ></circle>
                  ) : (
                    <path
                      key={row.label}
                      data-series="disputes"
                      d={`M${x(i)},${y(row.disputes) - 3.4} L${x(i) + 3.4},${y(row.disputes)} L${x(i)},${y(row.disputes) + 3.4} L${x(i) - 3.4},${y(row.disputes)} Z`}
                      fill={series.color}
                      stroke={series.outline}
                      strokeWidth="1.2"
                    ></path>
                  ),
                )}
              </g>
            ))}
            {hovered && (
              <g aria-hidden="true" pointerEvents="none">
                <line
                  x1={x(hoverIndex)}
                  x2={x(hoverIndex)}
                  y1="25"
                  y2={height - 30}
                  stroke="rgb(var(--color-brand-300))"
                  strokeDasharray="3 5"
                />
                {shown.map((series) => (
                  <circle
                    key={series.key}
                    cx={x(hoverIndex)}
                    cy={y(hovered[series.key])}
                    r="6"
                    fill="white"
                    stroke={series.outline || series.color}
                    strokeWidth="2.5"
                  />
                ))}
              </g>
            )}
            {rows.map((row, i) => (
              <g key={row.label}>
                {(i % Math.ceil(rows.length / (compact ? 3 : 6)) === 0 ||
                  i === rows.length - 1) && (
                  <text
                    x={x(i)}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize="12"
                    fill="rgb(var(--color-ink-subtle))"
                  >
                    {dayLabel(row.label)}
                  </text>
                )}
                <rect
                  tabIndex="0"
                  aria-label={`${dayLabel(row.label)} Ticket ${row.tickets}, Dispute ${row.disputes}`}
                  aria-describedby={
                    hovered?.label === row.label ? tooltipId : undefined
                  }
                  x={Math.max(42, x(i) - hitStep / 2)}
                  y="25"
                  width={Math.max(
                    1,
                    Math.min(width - 23, x(i) + hitStep / 2) -
                      Math.max(42, x(i) - hitStep / 2),
                  )}
                  height={Math.max(20, height - 48)}
                  fill="transparent"
                  onFocus={() => setHover(row)}
                  onBlur={() => setHover(null)}
                  onPointerEnter={() => setHover(row)}
                  onClick={() => setHover(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setHover(null);
                  }}
                />
              </g>
            ))}
          </>
        ) : (
          <>
            {stackedRows && (
              <>
                <text
                  x={plotStart}
                  y="13"
                  fontSize="12"
                  fill="rgb(var(--color-ink-subtle))"
                >
                  รวมเคส
                </text>
                <text
                  x={width - 90}
                  y="13"
                  textAnchor="middle"
                  fontSize="12"
                  fill={CASE_TEXT_COLORS.tickets}
                >
                  Ticket
                </text>
                <text
                  x={width - 29}
                  y="13"
                  textAnchor="middle"
                  fontSize="12"
                  fill={CASE_TEXT_COLORS.disputes}
                >
                  Dispute
                </text>
              </>
            )}
            {[0, 0.5, 1].map((r) => (
              <g key={r}>
                <line
                  x1={plotStart + r * plotWidth}
                  x2={plotStart + r * plotWidth}
                  y1={stackedRows ? 23 : 3}
                  y2={height - 28}
                  stroke="rgb(var(--color-line))"
                  strokeDasharray="3 4"
                />
                <text
                  x={plotStart + r * plotWidth}
                  y={height - 8}
                  fontSize="12"
                  textAnchor="middle"
                  fill="rgb(var(--color-ink-subtle))"
                >
                  {fmt(barMax * r)}
                </text>
              </g>
            ))}
            {rows.map((row, i) => (
              <g key={row.label}>
                <text
                  x={plotStart - 10}
                  y={(stackedRows ? 22 : 8) + i * rowHeight + rowHeight / 2 + 4}
                  textAnchor="end"
                  fontSize={stackedRows ? 13 : 12}
                  fill="rgb(var(--color-ink-muted))"
                >
                  <title>{row.label}</title>
                  {row.label.length > Math.floor((plotStart - 15) / 6)
                    ? row.label.slice(0, Math.floor((plotStart - 15) / 6) - 1) +
                      "…"
                    : row.label}
                </text>
                {stackedRows ? (
                  <>
                    <rect
                      x={plotStart}
                      y={
                        22 +
                        i * rowHeight +
                        rowHeight / 2 -
                        Math.min(16, rowHeight - 5) / 2
                      }
                      width={plotWidth}
                      height={Math.min(16, rowHeight - 5)}
                      rx="4"
                      fill="rgb(var(--color-surface-subtle))"
                    />
                    <rect
                      x={plotStart}
                      y={
                        22 +
                        i * rowHeight +
                        rowHeight / 2 -
                        Math.min(16, rowHeight - 5) / 2
                      }
                      width={(row.tickets / barMax) * plotWidth}
                      height={Math.min(16, rowHeight - 5)}
                      fill={CASE_COLORS.tickets}
                    >
                      <title>Ticket {fmt(row.tickets)} เคส</title>
                    </rect>
                    <rect
                      x={plotStart + (row.tickets / barMax) * plotWidth}
                      y={
                        22 +
                        i * rowHeight +
                        rowHeight / 2 -
                        Math.min(16, rowHeight - 5) / 2
                      }
                      width={(row.disputes / barMax) * plotWidth}
                      height={Math.min(16, rowHeight - 5)}
                      fill={CASE_COLORS.disputes}
                    >
                      <title>Dispute {fmt(row.disputes)} เคส</title>
                    </rect>
                    <text
                      x={width - 90}
                      y={22 + i * rowHeight + rowHeight / 2 + 5}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="600"
                      fill={
                        row.tickets
                          ? CASE_TEXT_COLORS.tickets
                          : "rgb(var(--color-ink-subtle))"
                      }
                    >
                      {fmt(row.tickets)}
                    </text>
                    <text
                      x={width - 29}
                      y={22 + i * rowHeight + rowHeight / 2 + 5}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="600"
                      fill={
                        row.disputes
                          ? CASE_TEXT_COLORS.disputes
                          : "rgb(var(--color-ink-subtle))"
                      }
                    >
                      {fmt(row.disputes)}
                    </text>
                  </>
                ) : (
                  CASE_SERIES.map((series, j) => (
                    <g key={series.key}>
                      <rect
                        x={plotStart}
                        y={
                          8 +
                          i * rowHeight +
                          rowHeight / 2 -
                          barThickness -
                          1 +
                          j * (barThickness + 2)
                        }
                        width={(row[series.key] / barMax) * plotWidth}
                        height={barThickness}
                        rx="2"
                        fill={series.color}
                        stroke={
                          row[series.key] > 0 ? series.outline : undefined
                        }
                        strokeWidth="1"
                      />
                    </g>
                  ))
                )}
                {!stackedRows && (
                  <text
                    x={width - 4}
                    y={8 + i * rowHeight + rowHeight / 2 + 4}
                    textAnchor="end"
                    fontSize="12"
                  >
                    {singleSeriesRows ? (
                      <tspan
                        fill={
                          row.tickets
                            ? CASE_TEXT_COLORS.tickets
                            : CASE_TEXT_COLORS.disputes
                        }
                      >
                        {fmt(row.tickets + row.disputes)}
                      </tspan>
                    ) : (
                      <>
                        <tspan fill={CASE_TEXT_COLORS.tickets}>
                          {fmt(row.tickets)}
                        </tspan>
                        <tspan fill="rgb(var(--color-ink-subtle))"> / </tspan>
                        <tspan fill={CASE_TEXT_COLORS.disputes}>
                          {fmt(row.disputes)}
                        </tspan>
                      </>
                    )}
                  </text>
                )}
              </g>
            ))}
          </>
        )}
      </svg>
      {kind === "line" && !shown.length && (
        <div
          className="agent-chart-empty"
          role="status"
          aria-label="การแสดงเส้นแนวโน้ม"
        >
          เลือก Ticket หรือ Dispute เพื่อแสดงเส้น
        </div>
      )}
      {kind === "line" &&
        shown.length > 0 &&
        !rows.some((row) => shown.some((series) => row[series.key] > 0)) && (
          <div className="agent-chart-empty" role="status">
            ยังไม่มีการรับงานในช่วงนี้
          </div>
        )}
      {kind === "line" && hovered && (
        <div
          id={tooltipId}
          className="agent-chart-tooltip"
          role="tooltip"
          data-placement={below ? "below" : "above"}
          style={{
            left: tooltipLeft,
            top: tooltipTop,
            transform: below ? "translate(-50%,0)" : "translate(-50%,-100%)",
          }}
        >
          <strong className="agent-tooltip-date">
            {dayLabel(hovered.label)}
          </strong>
          {shown.map((series) => (
            <div className="agent-tooltip-row" key={series.key}>
              <span>{series.label}</span>
              <strong>
                {fmt(hovered[series.key])}
                <small> เคส</small>
              </strong>
            </div>
          ))}
        </div>
      )}
      {kind === "line" && (
        <p className="min-h-4 text-xs text-slate-500" aria-live="polite">
          {!shown.length
            ? "เลือก Ticket หรือ Dispute เพื่อแสดงเส้น"
            : hover
              ? `${dayLabel(hover.label)} · Ticket ${hover.tickets} · Dispute ${hover.disputes}`
              : "ชี้หรือกด Tab เพื่อดูรายวัน · วันนี้นับถึงเวลาอัปเดต"}
        </p>
      )}
      {kind === "bar" && !rows.length && (
        <div className="agent-chart-empty" role="status">
          ไม่มีเคสเปิดในขอบเขตนี้
        </div>
      )}
    </div>
  );
}
const dayLabel = (date) =>
  // A calendar date already belongs to the server's reporting timezone;
  // format it without converting it into a different calendar day.
  new Date(`${date}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
