"use client";
import { useId, useState } from "react";
import styles from "./AgentDashboard.module.css";
import { CASE_COLORS } from "./agentDashboardPalette";

const fmt = (value) => Number(value).toLocaleString("th-TH");

export default function TotalCaseBars({ rows, label, compact = false }) {
  const detailId = useId();
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);
  const [pinned, setPinned] = useState(null);
  const activeLabel = pinned || focused || hovered;
  // Resolve selection against fresh data after polling; don't retain old counts.
  const active = rows.find((row) => row.label === activeLabel);
  const maximum = Math.max(1, ...rows.map((row) => row.tickets + row.disputes));
  if (!rows.length)
    return (
      <p role="status" className={styles.totalEmpty}>
        ไม่มีเคสเปิดในขอบเขตนี้
      </p>
    );
  return (
    <div
      className={`${styles.totalChart} ${compact ? styles.compactTotalChart : ""}`}
      role="group"
      aria-label={label}
    >
      <div className={styles.totalBarRows}>
        {rows.map((row) => {
          const total = row.tickets + row.disputes;
          return (
            <button
              key={row.label}
              type="button"
              className={styles.totalBarRow}
              aria-label={`${row.label} รวม ${fmt(total)} เคส ดูแยก Ticket และ Dispute`}
              aria-expanded={active?.label === row.label}
              aria-controls={detailId}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") setHovered(row.label);
              }}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setFocused(row.label)}
              onBlur={() => setFocused(null)}
              onClick={() =>
                setPinned((current) =>
                  current === row.label ? null : row.label,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setPinned(null);
                  setFocused(null);
                  setHovered(null);
                }
              }}
            >
              <span className={styles.totalBarLabel} title={row.label}>
                {row.label}
              </span>
              <span className={styles.totalBarTrack} aria-hidden="true">
                <span
                  className={styles.totalBarFill}
                  style={{ width: `${(total / maximum) * 100}%` }}
                >
                  <span
                    className={styles.totalBarTicket}
                    data-case-type="tickets"
                    style={{
                      width: `${total ? (row.tickets / total) * 100 : 0}%`,
                      backgroundColor: CASE_COLORS.tickets,
                      boxShadow:
                        row.tickets && row.disputes
                          ? "inset -1px 0 0 white"
                          : undefined,
                    }}
                  />
                  <span
                    className={styles.totalBarDispute}
                    data-case-type="disputes"
                    style={{
                      width: `${total ? (row.disputes / total) * 100 : 0}%`,
                      backgroundColor: CASE_COLORS.disputes,
                    }}
                  />
                </span>
              </span>
              <strong className={styles.totalBarValue}>
                {fmt(total)}
                <small> เคส</small>
              </strong>
            </button>
          );
        })}
      </div>
      <p
        id={detailId}
        className={styles.totalBreakdown}
        role="status"
        aria-live="polite"
      >
        {active ? (
          <>
            <strong>{active.label}</strong>
            <span className={styles.totalBarLegend}>
              <i
                style={{ backgroundColor: CASE_COLORS.tickets }}
                aria-hidden="true"
              />
              Ticket {fmt(active.tickets)} ·{" "}
              <i
                className={styles.disputeSwatch}
                style={{ backgroundColor: CASE_COLORS.disputes }}
                aria-hidden="true"
              />
              Dispute {fmt(active.disputes)}
            </span>
          </>
        ) : (
          <>
            <span className={styles.totalBarLegend}>
              <i
                style={{ backgroundColor: CASE_COLORS.tickets }}
                aria-hidden="true"
              />
              Ticket{" "}
              <i
                className={styles.disputeSwatch}
                style={{ backgroundColor: CASE_COLORS.disputes }}
                aria-hidden="true"
              />
              Dispute
            </span>
            {!compact && <span>ชี้หรือกดแถบเพื่อดูจำนวน</span>}
          </>
        )}
      </p>
    </div>
  );
}
