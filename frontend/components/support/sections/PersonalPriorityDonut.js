"use client";
import { useId, useState } from "react";
import styles from "./AgentOverview.module.css";
const GROUPS = [
  { code: "URGENT", label: "ด่วนที่สุด", color: "rgb(var(--color-danger))" },
  { code: "HIGH", label: "สูง", color: "rgb(var(--color-warning))" },
  { code: "NORMAL", label: "ปานกลาง", color: "rgb(var(--color-brand-600))" },
  { code: "LOW", label: "ต่ำ", color: "rgb(var(--color-ink-subtle))" },
];
export default function PersonalPriorityDonut({ rows, onSelect }) {
  const [hoverCode, setHoverCode] = useState(null);
  const tooltipId = useId();
  const groups = [...GROUPS];
  if (rows.some((row) => row.label === "CRITICAL" && row.value > 0))
    groups.unshift({
      code: "CRITICAL",
      label: "วิกฤต",
      color: "rgb(var(--color-danger))",
    });
  const values = groups.map((group) =>
    rows
      .filter((row) => row.label === group.code)
      .reduce((sum, row) => sum + row.value, 0),
  );
  const total = values.reduce((sum, value) => sum + value, 0);
  const active = groups
    .map((group, index) => ({ ...group, value: values[index] }))
    .filter((group) => group.value > 0);
  const hovered = groups.find((group) => group.code === hoverCode);
  const hoverValue = hovered ? values[groups.indexOf(hovered)] : 0;
  const hoverHandlers = (code) => ({
    onPointerEnter: () => setHoverCode(code),
    onPointerLeave: () => setHoverCode(null),
  });
  let angle = 0;
  const segments = active.map((group) => {
    const span = (group.value / total) * 360;
    const stroke = Math.min(10, ((span * Math.PI) / 180) * 50 * 0.65);
    const trim = Math.min(span * 0.8, ((stroke / 50) * 180) / Math.PI + 2.5);
    const start = angle + trim / 2,
      end = angle + span - trim / 2;
    angle += span;
    const point = (degrees) => ({
      x: 60 + 50 * Math.cos(((degrees - 90) * Math.PI) / 180),
      y: 60 + 50 * Math.sin(((degrees - 90) * Math.PI) / 180),
    });
    const from = point(start),
      to = point(end);
    return {
      ...group,
      stroke,
      path: `M${from.x},${from.y} A50,50 0 ${end - start > 180 ? 1 : 0} 1 ${to.x},${to.y}`,
    };
  });
  return (
    <div className={`${styles.slaDonutLayout} ${styles.priorityLayout}`}>
      <div
        role="img"
        className={`${styles.slaDonut} ${styles.priorityDonut}`}
        aria-label={
          total
            ? "ความสำคัญของงานฉัน " +
              total +
              " เคส: " +
              groups
                .map(
                  (group, index) => group.label + " " + values[index] + " เคส",
                )
                .join(", ")
            : "ไม่มีงานของฉันที่ยังไม่จบ"
        }
      >
        <svg
          className={styles.donutSvg}
          viewBox="0 0 120 120"
          aria-hidden="true"
        >
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="rgb(var(--color-line))"
            strokeWidth="10"
          />
          {active.length === 1 ? (
            <circle
              {...hoverHandlers(active[0].code)}
              data-priority={active[0].code}
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke={active[0].color}
              strokeWidth="10"
            />
          ) : (
            segments.map((segment) => (
              <path
                key={segment.code}
                {...hoverHandlers(segment.code)}
                data-priority={segment.code}
                d={segment.path}
                fill="none"
                stroke={segment.color}
                strokeWidth={segment.stroke}
                strokeLinecap="round"
              />
            ))
          )}
        </svg>
        <div className={styles.slaDonutCenter} aria-hidden="true">
          <strong>{total}</strong>
          <span>เคสของฉัน</span>
        </div>
      </div>
      <div className={styles.donutTooltipSlot}>
        {hovered && (
          <div id={tooltipId} role="tooltip" className={styles.donutTooltip}>
            <strong>{hovered.label}</strong>
            <span>
              {hoverValue} เคส{" "}
              <small>
                · {total ? Math.round((hoverValue / total) * 100) : 0}%
              </small>
            </span>
          </div>
        )}
      </div>
      <div className={styles.slaDonutLegend}>
        {groups.map((group, index) => (
          <button
            type="button"
            key={group.code}
            className={styles.slaDonutGroup}
            {...hoverHandlers(group.code)}
            onFocus={() => setHoverCode(group.code)}
            onBlur={() => setHoverCode(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setHoverCode(null);
            }}
            aria-describedby={hoverCode === group.code ? tooltipId : undefined}
            onClick={() => onSelect(group.code)}
            aria-label={group.label + " " + values[index] + " เคส ดูรายการ"}
          >
            <span
              className={styles.slaDonutDot}
              style={{ backgroundColor: group.color }}
              aria-hidden="true"
            />
            <span className={styles.slaDonutLabel}>{group.label}</span>
            <strong>
              {values[index]}
              <small> เคส</small>
            </strong>
            <span className={styles.priorityArrow} aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </div>
      {!total && (
        <p className={styles.slaDonutNote}>ยังไม่มีงานที่คุณรับและยังไม่จบ</p>
      )}
    </div>
  );
}
