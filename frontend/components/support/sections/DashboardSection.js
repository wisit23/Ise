/* eslint-disable no-unused-vars */
"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import DonutChart from "../../charts/DonutChart";
import TrendBarChart from "../../charts/TrendBarChart";

import Badge from "../../panel/ui/Badge";
import KpiCard from "../../panel/ui/KpiCard";
import ChartCard from "../../panel/ui/ChartCard";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import {
  TICKET_STATUS_LABEL, TICKET_STATUS_STYLE, PRIORITY_LABEL, PRIORITY_STYLE,
  AGENT_NEXT_STATUS, DISPUTE_STATUS_LABEL, DISPUTE_STATUS_STYLE, ORDER_STATUS_LABEL,
  HELP_CATEGORIES, DONUT_PRIORITY_COLORS, DONUT_DISPUTE_COLORS, PAGE_SIZE
} from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";


export default // ─── Dashboard Section ────────────────────────────────────────────────────────

function DashboardSection({ token, userRole, onNavigate }) {
  const isAdmin = userRole === "ADMIN";
  const [stats, setStats] = useState({
    total: null, resolved: null, pending: null, urgent: null,
    escalated: null, open: null,
  });
  const [priorityData, setPriorityData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [disputeData, setDisputeData] = useState([]);
  const [ticketTrend, setTicketTrend] = useState([]);

  useEffect(() => {
    const fc = (params) =>
      apiFetch(`/api/support/tickets/queue?${params}&limit=1`, { token })
        .then((d) => d.total)
        .catch(() => null);

    // KPI counts
    fc("scope=all").then((v) => setStats((s) => ({ ...s, total: v })));
    fc("scope=all&status=RESOLVED").then((v) => setStats((s) => ({ ...s, resolved: v })));
    fc("scope=all&status=NEW").then((v) => setStats((s) => ({ ...s, pending: v })));
    // CS agents can never see ESCALATED tickets (they're handed off to Admin
    // — see ticketModel.listQueue's role check), so the backend always
    // returns 0 for this query under that role; skip the wasted request.
    if (isAdmin) {
      fc("scope=all&status=ESCALATED").then((v) => setStats((s) => ({ ...s, escalated: v })));
    }
    fc("scope=all&priority=URGENT").then((v) => setStats((s) => ({ ...s, urgent: v })));
    fc("scope=all&status=IN_PROGRESS").then((v) => setStats((s) => ({ ...s, open: v })));

    // Priority donut
    Promise.all([
      fc("scope=all&priority=LOW"),
      fc("scope=all&priority=NORMAL"),
      fc("scope=all&priority=HIGH"),
      fc("scope=all&priority=URGENT"),
    ]).then(([low, normal, high, urgent]) => {
      setPriorityData([
        { label: "Low", value: low || 0, color: DONUT_PRIORITY_COLORS.LOW },
        { label: "Medium", value: normal || 0, color: DONUT_PRIORITY_COLORS.NORMAL },
        { label: "High", value: high || 0, color: DONUT_PRIORITY_COLORS.HIGH },
        { label: "Urgent", value: urgent || 0, color: DONUT_PRIORITY_COLORS.URGENT },
      ]);
    });

    // Status bar chart
    Promise.all([
      fc("scope=all&status=NEW"),
      fc("scope=all&status=IN_PROGRESS"),
      fc("scope=all&status=PENDING_USER"),
      fc("scope=all&status=RESOLVED"),
      fc("scope=all&status=CLOSED"),
    ]).then(([n, ip, pu, r, c]) => {
      setStatusData([
        { label: "New", value: n || 0 },
        { label: "In Prog.", value: ip || 0 },
        { label: "Waiting", value: pu || 0 },
        { label: "Resolved", value: r || 0 },
        { label: "Closed", value: c || 0 },
      ]);
    });

    // Disputes donut
    const fd = (params) =>
      apiFetch(`/api/orders/disputes/queue?${params}&limit=1`, { token })
        .then((d) => d.total)
        .catch(() => null);
    Promise.all([fd("status=OPEN"), fd("status=NEEDS_INFO"), fd("status=DECIDED")]).then(
      ([op, ni, de]) => {
        setDisputeData([
          { label: "รอตรวจสอบ", value: op || 0, color: DONUT_DISPUTE_COLORS.OPEN },
          { label: "รอข้อมูล", value: ni || 0, color: DONUT_DISPUTE_COLORS.NEEDS_INFO },
          { label: "ตัดสินแล้ว", value: de || 0, color: DONUT_DISPUTE_COLORS.DECIDED },
        ]);
      }
    );

    // Ticket trend — fetch top page and map last 8 tickets by date
    apiFetch("/api/support/tickets/queue?scope=all&limit=50", { token })
      .then((d) => {
        const items = d.items || [];
        // Count by date (last 7 unique dates)
        const counts = {};
        items.forEach((t) => {
          const day = new Date(t.createdAt).toLocaleDateString("th-TH", {
            day: "2-digit", month: "short",
          });
          counts[day] = (counts[day] || 0) + 1;
        });
        const trend = Object.entries(counts)
          .slice(-8)
          .map(([label, value]) => ({ label, value }));
        setTicketTrend(trend);
      })
      .catch(() => {});
  }, [token]);

  return (
    <div className="animate-fade-in-up">
      {/* KPI Row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total Tickets" value={stats.total} icon="confirmation_number" color="emerald"
          onClick={() => onNavigate("tickets", "")}
          sub={stats.open !== null ? `${stats.open} กำลังดำเนินการ` : null} />
        <KpiCard label="Resolved Tickets" value={stats.resolved} icon="check_circle" color="emerald"
          onClick={() => onNavigate("tickets", "RESOLVED")}
          sub="แก้ไขแล้ว" />
        <KpiCard label="Pending Tickets" value={stats.pending} icon="pending" color="amber"
          onClick={() => onNavigate("tickets", "NEW")}
          sub="รอรับเรื่อง" />
        {isAdmin ? (
          <KpiCard label="Escalated Tickets" value={stats.escalated} icon="priority_high" color="red"
            onClick={() => onNavigate("admin_inbox", "")}
            sub="ดูที่เคสระดับแอดมิน" />
        ) : (
          <KpiCard label="Urgent Tickets" value={stats.urgent} icon="priority_high" color="red"
            onClick={() => onNavigate("tickets", "")}
            sub="ความสำคัญด่วนที่สุด" />
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <ChartCard title="Tickets by Priority" icon="bar_chart">
          <DonutChart data={priorityData} size={170} strokeWidth={38} />
        </ChartCard>

        <ChartCard title="Tickets by Status" icon="schedule">
          <TrendBarChart data={statusData.length ? statusData : [{ label: "...", value: 0 }]} height={200} />
        </ChartCard>

        <ChartCard title="Disputes by Status" icon="gavel">
          <DonutChart data={disputeData} size={170} strokeWidth={38} />
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Ticket Volume (ล่าสุด)" icon="trending_up">
          {ticketTrend.length > 0 ? (
            <TrendBarChart data={ticketTrend} height={160} />
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>
          )}
        </ChartCard>

        <ChartCard title="Priority Distribution" icon="donut_small">
          <div className="flex flex-col gap-3 mt-2">
            {priorityData.map((d) => {
              const total = priorityData.reduce((s, x) => s + x.value, 0) || 1;
              const pct = Math.round((d.value / total) * 100);
              return (
                <div key={d.label} className="group flex items-center gap-3">
                  <span className="w-14 text-right text-xs font-medium text-slate-500">{d.label}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2.5 shadow-inner">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${pct}%`, backgroundColor: d.color }}
                    />
                  </div>
                  <span className="w-8 text-xs font-semibold text-slate-700">{pct}%</span>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
