"use client";
import styles from "./CsatGauge.module.css";
import AnimatedNumber from "./AnimatedNumber";

export function combineCsat(sources) {
  if (
    sources.some(
      (source) =>
        !source ||
        !Number.isInteger(source.total) ||
        !Number.isInteger(source.satisfied) ||
        !Number.isInteger(source.scoreSum) ||
        source.total < 0 ||
        source.satisfied < 0 ||
        source.satisfied > source.total ||
        source.scoreSum < source.total ||
        source.scoreSum > source.total * 5,
    )
  )
    return null;
  const total = sources.reduce((sum, source) => sum + source.total, 0);
  const satisfied = sources.reduce((sum, source) => sum + source.satisfied, 0);
  const scoreSum = sources.reduce((sum, source) => sum + source.scoreSum, 0);
  return {
    total,
    satisfied,
    percent: total ? Math.round((satisfied / total) * 100) : null,
    average: total ? (scoreSum / total).toFixed(1) : null,
  };
}

export default function CsatGauge({
  tickets,
  disputes,
  days,
  className = "",
  headerClassName = "",
  entering = false,
  paused = false,
  compact = false,
}) {
  const data = combineCsat([tickets, disputes]);
  const percent = data?.percent;
  const animateNumber =
    entering &&
    !paused &&
    !(
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );
  const angle = Math.PI - ((percent ?? 0) / 100) * Math.PI;
  const x = 120 + 70 * Math.cos(angle),
    y = 112 - 70 * Math.sin(angle);
  return (
    <section
      className={`${styles.card} ${className} ${compact ? styles.compact : ""} ${entering ? styles.entering : ""} ${paused ? styles.paused : ""}`}
      style={{
        "--csat-percent": percent ?? 0,
        "--needle-from": `${-(percent ?? 0) * 1.8}deg`,
      }}
      aria-label="CSAT ความพึงพอใจต่องานของฉัน"
    >
      <div className={`${styles.heading} ${headerClassName}`}>
        <h2>ความพึงพอใจ</h2>
        <span className={styles.subtitle}>
          CSAT · {days === 1 ? "วันนี้" : `${days} วันล่าสุด`}
        </span>
      </div>
      <div className={styles.chart}>
        <div className={styles.chartInner}>
          <svg
            viewBox="0 0 240 158"
            className={styles.gauge}
            role="img"
            aria-label={
              percent === null || percent === undefined
                ? "ยังไม่มีคะแนน CSAT"
                : `CSAT ${percent}%`
            }
          >
            <path
              d="M 30 112 A 90 90 0 0 1 210 112"
              fill="none"
              stroke="rgb(var(--color-brand-600) / 0.11)"
              strokeWidth="18"
              strokeLinecap="round"
            />
            {percent > 0 && (
              <path
                className={styles.arc}
                d="M 30 112 A 90 90 0 0 1 210 112"
                fill="none"
                stroke="rgb(var(--color-brand-600))"
                strokeWidth="18"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray={`${percent ?? 0} 100`}
              />
            )}
            {percent !== null && percent !== undefined && (
              <>
                <line
                  className={styles.needle}
                  x1="120"
                  y1="112"
                  x2={x}
                  y2={y}
                  stroke="rgb(var(--color-brand-800))"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <circle
                  cx="120"
                  cy="112"
                  r="11"
                  fill="rgb(var(--color-brand-600) / 0.12)"
                />
                <circle
                  cx="120"
                  cy="112"
                  r="6"
                  fill="rgb(var(--color-brand-800))"
                />
              </>
            )}
            <text
              x="20"
              y="140"
              fill="rgb(var(--color-ink-muted))"
              fontSize="11"
            >
              0%
            </text>
            <text
              x="220"
              y="140"
              textAnchor="end"
              fill="rgb(var(--color-ink-muted))"
              fontSize="11"
            >
              100%
            </text>
          </svg>
          <p
            className={styles.value}
            aria-label={percent == null ? "ยังไม่มีคะแนน" : `${percent}%`}
          >
            {percent == null ? (
              "—"
            ) : (
              <>
                <AnimatedNumber value={percent} animate={animateNumber} />%
              </>
            )}
          </p>
          <p className={styles.chartCaption}>ความพึงพอใจต่อบริการ</p>
        </div>
      </div>
      {data?.total ? (
        <dl className={styles.stats}>
          <div title="คะแนน 4–5 ดาว ÷ คะแนนทั้งหมด × 100">
            <dt>
              <span className={styles.dot} />
              พึงพอใจ <small>(4–5 ดาว)</small>
            </dt>
            <dd>
              <span>{data.satisfied}</span>
              <small> / </small>
              <small>{data.total}</small>
            </dd>
          </div>
          <div>
            <dt>
              <span className={styles.averageDot} />
              คะแนนเฉลี่ย
            </dt>
            <dd>
              <span>{data.average}</span>
              <small> / </small>
              <small>5</small>
            </dd>
          </div>
        </dl>
      ) : (
        <p className={styles.empty}>
          {data ? "ยังไม่มีผู้ประเมินในช่วงนี้" : "ยังโหลดคะแนนไม่ได้"}
        </p>
      )}
      {data && (
        <div
          className={styles.sources}
          aria-label={`คำตอบทั้งหมด ${data.total} คำตอบ`}
        >
          <span>
            <i className={styles.ticketDot} aria-hidden="true" />
            Ticket <strong>{tickets.total}</strong>
          </span>
          <span>
            <i className={styles.disputeDot} aria-hidden="true" />
            Dispute <strong>{disputes.total}</strong>
          </span>
        </div>
      )}
    </section>
  );
}
