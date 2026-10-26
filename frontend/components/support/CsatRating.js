"use client";
import Icon from "../ui/Icon";


import { useEffect, useId, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import styles from "./CsatRating.module.css";
import useCustomerServiceConfig from "./hooks/useCustomerServiceConfig";

const LABELS = ["ไม่พอใจมาก", "ไม่พอใจ", "ปานกลาง", "พอใจ", "พอใจมาก"];

export default function CsatRating({ endpoint, caseLabel = "เรื่องนี้" }) {
  const { timing } = useCustomerServiceConfig();
  const headingId = useId();
  const [survey, setSurvey] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setSurvey(null);
    setRating(0);
    setComment("");
    setError("");
    apiFetch(endpoint, {
      token: getAccessToken(),
      signal: controller.signal,
      timeoutMs: timing.requestTimeoutMs,
    })
      .then((data) => {
        if (active) setSurvey(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [endpoint, attempt, timing.requestTimeoutMs]);

  async function submit(event) {
    event.preventDefault();
    if (!rating || sending) return;
    setSending(true);
    setError("");
    try {
      setSurvey(
        await apiFetch(endpoint, {
          method: "POST",
          token: getAccessToken(),
          body: { rating, comment },
          timeoutMs: timing.requestTimeoutMs,
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <p className={styles.eyebrow}>CSAT · ความพึงพอใจต่อบริการ</p>
      <h2 id={headingId}>เจ้าหน้าที่ช่วยเหลือคุณเป็นอย่างไรบ้าง?</h2>
      {loading ? (
        <p role="status">กำลังโหลดแบบประเมิน…</p>
      ) : survey?.response ? (
        <div role="status" className={styles.success}>
          <span aria-hidden="true" className={styles.savedStars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Icon key={star} name="star" filled={star <= survey.response.rating} />
            ))}
          </span>
          <strong>ขอบคุณสำหรับคะแนน {survey.response.rating}/5 ดาว</strong>
          <p>บันทึกความคิดเห็นของคุณแล้ว</p>
          {survey.response.comment && (
            <p className={styles.comment}>{survey.response.comment}</p>
          )}
        </div>
      ) : survey?.eligible ? (
        <form onSubmit={submit}>
          <p>ประเมินการดูแล{caseLabel}ของทีม CS เพื่อช่วยปรับปรุงบริการ</p>
          <fieldset disabled={sending}>
            <legend>เลือกคะแนนความพึงพอใจ 1–5 ดาว</legend>
            <div className={styles.stars}>
              {LABELS.map((label, index) => (
                <label key={label} className={styles.star}>
                  <input
                    type="radio"
                    name={headingId}
                    value={index + 1}
                    checked={rating === index + 1}
                    onChange={() => setRating(index + 1)}
                    aria-label={`${index + 1} ดาว · ${label}`}
                  />
                  <span
                    aria-hidden="true"
                    className={index < rating ? styles.selected : ""}
                  >
                    <Icon name="star" filled />
                  </span>
                </label>
              ))}
            </div>
            <p className={styles.ratingLabel} aria-live="polite">
              {rating
                ? `${rating}/5 · ${LABELS[rating - 1]}`
                : "ยังไม่ได้เลือกคะแนน"}
            </p>
            <label
              className={styles.commentLabel}
              htmlFor={`${headingId}-comment`}
            >
              ความคิดเห็นเพิ่มเติม (ไม่บังคับ)
            </label>
            <textarea
              id={`${headingId}-comment`}
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="บอกเราว่ามีอะไรที่ทำได้ดี หรืออยากให้ปรับปรุง"
            />
            <small>{comment.length}/1,000 · ส่งได้หนึ่งครั้งต่อเรื่อง</small>
            <button type="submit" disabled={!rating || sending}>
              {sending ? "กำลังบันทึก…" : "ส่งคะแนนความพึงพอใจ"}
            </button>
          </fieldset>
        </form>
      ) : survey ? (
        <p>แบบประเมินจะเปิดเมื่อเรื่องได้รับการแก้ไขหรือปิดแล้ว</p>
      ) : null}
      {error && (
        <div role="alert" className={styles.error}>
          {error}
          {!survey && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              ลองโหลดแบบประเมินอีกครั้ง
            </button>
          )}
        </div>
      )}
    </section>
  );
}
