"use client";
import styles from "./CsatCell.module.css";

const SIDE_LABEL = { REQUESTER: "ผู้แจ้ง", BUYER: "ผู้ซื้อ", SELLER: "ร้านค้า" };

export function Stars({ value, size = "md" }) {
  return (
    <span className={`${styles.stars} ${styles[size]}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className={styles.star}>
            <span className={styles.starBase}>★</span>
            <span className={styles.starFill} style={{ width: `${fill * 100}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** CSAT for one closed case: average stars plus each respondent's score. */
export default function CsatCell({ ratings = [] }) {
  if (!ratings.length) {
    return (
      <span className={styles.empty}>
        <span aria-hidden="true" className="material-symbols-outlined">hourglass_empty</span>
        ยังไม่ได้ประเมิน
      </span>
    );
  }
  const average = ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length;
  const tone = average >= 4 ? styles.good : average >= 3 ? styles.mid : styles.low;
  return (
    <div className={styles.cell} aria-label={`คะแนนเฉลี่ย ${average.toFixed(1)} จาก 5 ดาว`}>
      <div className={styles.summary}>
        <span className={`${styles.score} ${tone}`}>{average.toFixed(1)}</span>
        <Stars value={average} />
      </div>
      {ratings.length > 1 || ratings[0].respondentSide !== "REQUESTER" ? (
        <ul className={styles.respondents}>
          {ratings.map((row) => (
            <li
              key={row.respondentSide}
              className={styles.chip}
              title={row.comment || undefined}
            >
              {SIDE_LABEL[row.respondentSide] || row.respondentSide}
              <span className={styles.chipScore}>★ {row.rating}</span>
              {row.comment && (
                <span aria-hidden="true" className={`material-symbols-outlined ${styles.commentIcon}`}>
                  chat_bubble
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {ratings.some((row) => row.comment) && (
        <p className={styles.comment} title={ratings.find((row) => row.comment).comment}>
          “{ratings.find((row) => row.comment).comment}”
        </p>
      )}
    </div>
  );
}
