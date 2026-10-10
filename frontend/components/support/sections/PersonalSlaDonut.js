"use client";
import styles from "./AgentDashboard.module.css";

export const SLA_GROUPS = [
  { key: "mine_overdue", label: "เกินกำหนด", color: "#be123c" },
  { key: "mine_soon", label: "ใกล้ครบกำหนด", color: "#d97706" },
  {
    key: "mine_safe",
    label: "ยังมีเวลา",
    listLabel: "งานฉันที่ยังมีเวลา",
    color: "#059669",
  },
  {
    key: "mine_no_deadline",
    label: "ไม่มีกำหนด SLA",
    listLabel: "งานฉันที่ไม่มีกำหนด SLA",
    color: "#64748b",
  },
];
const fmt = (value) => Number(value).toLocaleString("th-TH");

export default function PersonalSlaDonut({
  total,
  overdue,
  soon,
  withoutDeadline,
  warningMinutes,
  onSelect,
}) {
  const values = [
    overdue,
    soon,
    total - overdue - soon - withoutDeadline,
    withoutDeadline,
  ];
  let position = 0;
  const stops = SLA_GROUPS.flatMap((group, index) => {
    if (!values[index] || !total) return [];
    const start = position;
    position += (values[index] / total) * 100;
    return `${group.color} ${start}% ${position}%`;
  });
  return (
    <div className={styles.slaDonutLayout}>
      <div
        className={styles.slaDonut}
        role="img"
        aria-label={
          total
            ? `งานของฉันที่ยังไม่จบ ${fmt(total)} เคส: ${SLA_GROUPS.map((group, index) => `${group.label} ${fmt(values[index])} เคส`).join(", ")}`
            : "ไม่มีงานของฉันที่ยังไม่จบ"
        }
        style={{
          background: total ? `conic-gradient(${stops.join(",")})` : "#e2e8f0",
        }}
      >
        <div className={styles.slaDonutCenter} aria-hidden="true">
          <strong>{fmt(total)}</strong>
          <span>งานที่ยังไม่จบ</span>
          <small>เคสของฉัน</small>
        </div>
      </div>
      <div className={styles.slaDonutLegend}>
        {SLA_GROUPS.map((group, index) => (
          <button
            type="button"
            key={group.key}
            onClick={() => onSelect(group.key)}
            aria-label={`${group.label} ${fmt(values[index])} เคส ดูรายการ`}
            className={styles.slaDonutGroup}
          >
            <span
              className={styles.slaDonutDot}
              style={{ backgroundColor: group.color }}
              aria-hidden="true"
            />
            <span>
              <span className={styles.slaDonutLabel}>{group.label}</span>
              <small>
                {index === 1
                  ? `ภายใน ${warningMinutes} นาที`
                  : index === 2
                    ? `เหลือมากกว่า ${warningMinutes} นาที`
                    : index === 3
                      ? "แยกจากงานที่ยังมีเวลา"
                      : "ถึงหรือเลยเวลาที่กำหนด"}
              </small>
            </span>
            <strong>
              {fmt(values[index])}
              <small> เคส</small>
            </strong>
          </button>
        ))}
      </div>
      <p className={styles.slaDonutNote}>
        {total
          ? "กดกลุ่มเพื่อดูเคส · นับกำหนดของขั้นตอนที่ยังไม่เสร็จ"
          : "ยังไม่มีงานที่คุณรับและยังไม่จบ"}
      </p>
    </div>
  );
}
