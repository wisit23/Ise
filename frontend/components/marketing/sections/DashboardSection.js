"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import KpiCard from "../../panel/ui/KpiCard";
import ChartCard from "../../panel/ui/ChartCard";
import DonutChart from "../../charts/DonutChart";

const DONUT_COLORS = {
  pending_approval: "#f59e0b",
  approved: "#0ea5e9",
  scheduled: "#6366f1",
  open: "#10b981",
  closed: "#94a3b8",
  rejected: "#ef4444",
  cancelled: "#cbd5e1",
};

const DONUT_LABEL = {
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  scheduled: "ตั้งเวลาแล้ว",
  open: "กำลังประมูล",
  closed: "ปิดแล้ว",
  rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิก",
};

// ─── Dashboard Section ──────────────────────────────────────────────────
// Auction-pipeline overview for Marketing: how many listings sit in each
// stage of draft -> pending_approval -> approved -> scheduled -> open ->
// closed, so Marketing can see at a glance what needs scheduling next.

export default function DashboardSection({ token, onNavigate }) {
  const [stats, setStats] = useState({
    pendingApproval: null,
    approved: null,
    scheduled: null,
    open: null,
  });
  const [statusData, setStatusData] = useState([]);

  useEffect(() => {
    const fc = (status) =>
      apiFetch(`/api/products/auctions?status=${status}&limit=1`, { token })
        .then((d) => d.total)
        .catch(() => null);

    fc("pending_approval").then((v) =>
      setStats((s) => ({ ...s, pendingApproval: v })),
    );
    fc("approved").then((v) => setStats((s) => ({ ...s, approved: v })));
    fc("scheduled").then((v) => setStats((s) => ({ ...s, scheduled: v })));
    fc("open").then((v) => setStats((s) => ({ ...s, open: v })));

    Promise.all(Object.keys(DONUT_LABEL).map((status) => fc(status))).then(
      (values) => {
        setStatusData(
          Object.keys(DONUT_LABEL).map((status, i) => ({
            label: DONUT_LABEL[status],
            value: values[i] || 0,
            color: DONUT_COLORS[status],
          })),
        );
      },
    );
  }, [token]);

  return (
    <div className="animate-fade-in-up">
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="รออนุมัติจาก Admin"
          value={stats.pendingApproval}
          icon="pending_actions"
          color="amber"
          onClick={() => onNavigate("auctions")}
          sub="ยังตั้งเวลาไม่ได้จนกว่าจะอนุมัติ"
        />
        <KpiCard
          label="อนุมัติแล้ว รอตั้งเวลา"
          value={stats.approved}
          icon="event_available"
          color="sky"
          onClick={() => onNavigate("auctions")}
          sub="พร้อมตั้งเวลาเปิดประมูล"
        />
        <KpiCard
          label="ตั้งเวลาแล้ว"
          value={stats.scheduled}
          icon="schedule"
          color="indigo"
          onClick={() => onNavigate("auctions")}
          sub="รอถึงเวลาเปิด"
        />
        <KpiCard
          label="กำลังประมูลอยู่ตอนนี้"
          value={stats.open}
          icon="gavel"
          color="emerald"
          onClick={() => onNavigate("auctions")}
          sub="เปิดให้ประมูลสด"
        />
      </div>

      <ChartCard title="สัดส่วนสถานะการประมูลทั้งหมด" icon="donut_small">
        <DonutChart data={statusData} size={170} strokeWidth={38} />
      </ChartCard>
    </div>
  );
}
