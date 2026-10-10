"use client";
import styles from "./AgentOverview.module.css";
const GROUPS = [
  { code: "URGENT", label: "ด่วนที่สุด", color: "#be123c" },
  { code: "HIGH", label: "สูง", color: "#bd8034" },
  { code: "NORMAL", label: "ปานกลาง", color: "#047857" },
  { code: "LOW", label: "ต่ำ", color: "#a0aca7" },
];
export default function PersonalPriorityDonut({ rows, onSelect }) {
  const groups = [...GROUPS];
  if (rows.some((row) => row.label === "CRITICAL" && row.value > 0))
    groups.unshift({ code: "CRITICAL", label: "วิกฤต", color: "#881337" });
  const values = groups.map((group) =>
    rows
      .filter((row) => row.label === group.code)
      .reduce((sum, row) => sum + row.value, 0),
  );
  const total = values.reduce((sum, value) => sum + value, 0);
  const active = groups
    .map((group, index) => ({ ...group, value: values[index] }))
    .filter((group) => group.value > 0);
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
            stroke="#e9eeea"
            strokeWidth="10"
          />
          {active.length === 1 ? (
            <circle
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
      <div className={styles.slaDonutLegend}>
        {groups.map((group, index) => (
          <button
            type="button"
            key={group.code}
            className={styles.slaDonutGroup}
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
          </button>
        ))}
      </div>
      {!total && (
        <p className={styles.slaDonutNote}>ยังไม่มีงานที่คุณรับและยังไม่จบ</p>
      )}
    </div>
  );
}
