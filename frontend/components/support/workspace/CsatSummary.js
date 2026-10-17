"use client";
import { Stars } from "./CsatCell";
import styles from "./CsatSummary.module.css";

const RING = 2 * Math.PI * 26;

/** CSAT recap for the closed-cases table (rows on the current page). */
export default function CsatSummary({ rows = [] }) {
  const scores = rows.flatMap((row) => (row.csat || []).map((r) => r.rating));
  const rated = rows.filter((row) => row.csat?.length).length;
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const responseRate = rows.length ? rated / rows.length : 0;
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: scores.filter((score) => score === star).length,
  }));

  return (
    <section aria-label="สรุปความพึงพอใจของเคสในหน้านี้" className={styles.card}>
      <div className={styles.score}>
        <p className={styles.eyebrow}>คะแนนเฉลี่ย</p>
        {scores.length ? (
          <>
            <p className={styles.big}>
              {average.toFixed(1)}
              <span className={styles.outOf}>/5</span>
            </p>
            <Stars value={average} size="lg" />
            <p className={styles.caption}>จาก {scores.length} คะแนน</p>
          </>
        ) : (
          <p className={styles.none}>ยังไม่มีคะแนน</p>
        )}
      </div>

      <div className={styles.distribution}>
        <p className={styles.eyebrow}>การกระจายคะแนน</p>
        <ul className={styles.bars}>
          {counts.map(({ star, count }) => (
            <li key={star} className={styles.barRow}>
              <span className={styles.barLabel}>
                {star}
                <span aria-hidden="true" className={styles.barStar}>★</span>
              </span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${scores.length ? (count / scores.length) * 100 : 0}%` }} />
              </span>
              <span className={styles.barCount}>
                {count}
                <span className="sr-only"> คะแนนที่ {star} ดาว</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.response}>
        <p className={styles.eyebrow}>ตอบแบบประเมิน</p>
        <div className={styles.ringWrap}>
          <svg viewBox="0 0 64 64" className={styles.ring} aria-hidden="true">
            <circle cx="32" cy="32" r="26" className={styles.ringTrack} />
            <circle
              cx="32"
              cy="32"
              r="26"
              className={styles.ringFill}
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - responseRate)}
            />
          </svg>
          <span className={styles.ringValue}>{Math.round(responseRate * 100)}%</span>
        </div>
        <p className={styles.caption}>
          {rated} จาก {rows.length} เคสในหน้านี้
        </p>
      </div>
    </section>
  );
}
