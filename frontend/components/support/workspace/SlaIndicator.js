"use client";
import config from "../../../lib/customerServiceConfig";

import { useSyncExternalStore } from "react";

let currentTime = Date.now();
let clockTimer;
const listeners = new Set();
function subscribe(listener) {
  listeners.add(listener);
  if (!clockTimer) {
    currentTime = Date.now();
    clockTimer = setInterval(() => {
      currentTime = Date.now();
      listeners.forEach((notify) => notify());
    }, config.timing.slaClockMs);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
const snapshot = () => currentTime;
const serverSnapshot = () => null;

export function formatSla(sla, now = Date.now()) {
  if (!sla || sla.state === "none") return "ยังไม่กำหนด";
  if (sla.state === "complete") return "จบแล้ว";
  const due = Date.parse(sla.dueAt);
  if (!Number.isFinite(due)) return "ยังไม่กำหนด";
  const minutes = Math.ceil(Math.abs(due - now) / 60000);
  const duration =
    minutes >= 1440
      ? `${Math.floor(minutes / 1440)} วัน ${Math.floor((minutes % 1440) / 60)} ชม.`
      : minutes >= 60
        ? `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`
        : `${minutes} นาที`;
  return `${due < now ? "เกินกำหนด" : "เหลือ"} ${duration}`;
}
export default function SlaIndicator({ sla }) {
  const now = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const label =
    sla?.metric === "FIRST_RESPONSE"
      ? "ตอบครั้งแรก"
      : sla?.metric === "RESOLUTION"
        ? "แก้ไข"
        : sla?.metric === "FIRST_REVIEW"
          ? "เริ่มตรวจ"
          : sla?.metric === "DECISION"
            ? "ตัดสิน"
            : "ดำเนินการ";
  return (
    <span
      className={`text-xs ${sla?.state === "active" && Date.parse(sla.dueAt) < now ? "text-red-700" : "text-slate-600"}`}
      title={
        sla?.dueAt ? new Date(sla.dueAt).toLocaleString("th-TH") : undefined
      }
    >
      {sla?.state === "active" ? `${label}: ` : ""}
      {now === null &&
      sla?.state === "active" &&
      Number.isFinite(Date.parse(sla.dueAt))
        ? `กำหนด ${new Date(sla.dueAt).toLocaleString("th-TH", { timeZone: config.dashboard.timeZone })}`
        : formatSla(sla, now ?? Date.now())}
    </span>
  );
}
