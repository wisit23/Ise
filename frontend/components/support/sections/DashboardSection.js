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
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  AGENT_NEXT_STATUS,
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_STYLE,
  ORDER_STATUS_LABEL,
  HELP_CATEGORIES,
  DONUT_PRIORITY_COLORS,
  DONUT_DISPUTE_COLORS,
  PAGE_SIZE,
} from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";

export default // ─── Dashboard Section ────────────────────────────────────────────────────────

function DashboardSection({ token, userRole, onNavigate }) {
  const isSafety = userRole === "ADMIN" || userRole === "TRUST_AND_SAFETY";
  const [stats, setStats] = useState({
    total: null,
    resolved: null,
    pending: null,
    urgent: null,
    escalated: null,
    open: null,
  });
  const [priorityData, setPriorityData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [disputeData, setDisputeData] = useState([]);
  const [ticketTrend, setTicketTrend] = useState([]);
  const [ownerStats, setOwnerStats] = useState({
    pendingKyc: null,
    openReports: null,
    activeTrustSafetyHolds: null,
  });
  const [sourceErrors, setSourceErrors] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setSourceErrors({});
    apiFetch("/api/support/tickets/dashboard?days=8", { token })
      .then((data) => {
        if (!active) return;
        const status = data.status || {};
        const priority = data.priority || {};
        setStats({
          total: data.total,
          resolved: status.RESOLVED || 0,
          pending: status.NEW || 0,
          urgent: priority.URGENT || 0,
          escalated: status.ESCALATED || 0,
          open: status.IN_PROGRESS || 0,
        });
      setPriorityData([
          { label: "Low", value: priority.LOW || 0, color: DONUT_PRIORITY_COLORS.LOW },
        {
          label: "Medium",
            value: priority.NORMAL || 0,
          color: DONUT_PRIORITY_COLORS.NORMAL,
        },
          { label: "High", value: priority.HIGH || 0, color: DONUT_PRIORITY_COLORS.HIGH },
        {
          label: "Urgent",
            value: priority.URGENT || 0,
          color: DONUT_PRIORITY_COLORS.URGENT,
        },
      ]);
      setStatusData([
          { label: "New", value: status.NEW || 0 },
          { label: "In Prog.", value: status.IN_PROGRESS || 0 },
          { label: "Waiting", value: status.PENDING_USER || 0 },
          { label: "Resolved", value: status.RESOLVED || 0 },
          { label: "Closed", value: status.CLOSED || 0 },
      ]);
        setTicketTrend(
          (data.trend || []).map(({ date, count }) => ({
            label: new Date(`${date}T00:00:00Z`).toLocaleDateString("th-TH", {
              day: "2-digit",
              month: "short",
              timeZone: "UTC",
            }),
            value: count,
          })),
        );
      })
      .catch((err) => {
        if (active) setSourceErrors((current) => ({ ...current, support: err.message }));
      });

    apiFetch("/api/orders/disputes/dashboard", { token })
      .then((data) => {
        if (!active) return;
        const dispute = data.disputesByStatus || {};
        setDisputeData([
          { label: "รอตรวจสอบ", value: dispute.OPEN || 0, color: DONUT_DISPUTE_COLORS.OPEN },
          { label: "รอข้อมูล", value: dispute.NEEDS_INFO || 0, color: DONUT_DISPUTE_COLORS.NEEDS_INFO },
          { label: "ตัดสินแล้ว", value: dispute.DECIDED || 0, color: DONUT_DISPUTE_COLORS.DECIDED },
        ]);
      })
      .catch((err) => {
        if (active) setSourceErrors((current) => ({ ...current, dispute: err.message }));
      });

    if (isSafety) {
      apiFetch("/api/orders/admin/dashboard-summary", { token })
        .then((data) => {
          if (!active) return;
          setOwnerStats((current) => ({
            ...current,
            activeTrustSafetyHolds: data.activeTrustSafetyHolds,
          }));
        })
        .catch((err) => {
          if (active) setSourceErrors((current) => ({ ...current, order: err.message }));
        });

      apiFetch("/api/auth/admin/dashboard-summary", { token })
        .then((data) => {
          if (!active) return;
          setOwnerStats((current) => ({
            ...current,
            pendingKyc: data.pendingKyc,
            openReports: data.openReports,
          }));
        })
        .catch((err) => {
          if (active) setSourceErrors((current) => ({ ...current, auth: err.message }));
        });
    }
    return () => {
      active = false;
    };
  }, [token, isSafety, refreshKey]);

  return (
    <div className="animate-fade-in-up">
      {/* KPI Row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Total Tickets"
          value={stats.total}
          icon="confirmation_number"
          color="emerald"
          onClick={() => onNavigate("tickets", "")}
          sub={stats.open !== null ? `${stats.open} กำลังดำเนินการ` : null}
        />
        <KpiCard
          label="Resolved Tickets"
          value={stats.resolved}
          icon="check_circle"
          color="emerald"
          onClick={() => onNavigate("tickets", "RESOLVED")}
          sub="แก้ไขแล้ว"
        />
        <KpiCard
          label="Pending Tickets"
          value={stats.pending}
          icon="pending"
          color="amber"
          onClick={() => onNavigate("tickets", "NEW")}
          sub="รอรับเรื่อง"
        />
        {isSafety ? (
          <KpiCard
            label="Escalated Tickets"
            value={stats.escalated}
            icon="priority_high"
            color="red"
            onClick={() => onNavigate("admin_inbox", "")}
            sub="ดูที่คิว Trust & Safety"
          />
        ) : (
          <KpiCard
            label="Urgent Tickets"
            value={stats.urgent}
            icon="priority_high"
            color="red"
            onClick={() => onNavigate("tickets", "")}
            sub="ความสำคัญด่วนที่สุด"
          />
        )}
      </div>

      {isSafety && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Pending KYC"
            value={sourceErrors.auth ? "Unavailable" : ownerStats.pendingKyc}
            icon="how_to_reg"
            color="amber"
            onClick={() => onNavigate("kyc", "")}
            sub={sourceErrors.auth ? "Auth API ไม่พร้อมใช้งาน" : "รอตรวจสอบ"}
          />
          <KpiCard
            label="Open Reports"
            value={sourceErrors.auth ? "Unavailable" : ownerStats.openReports}
            icon="report"
            color="red"
            onClick={() => onNavigate("admin_inbox", "")}
            sub={sourceErrors.auth ? "Auth API ไม่พร้อมใช้งาน" : "เปิดอยู่หรือกำลังตรวจ"}
          />
          <KpiCard
            label="Active T&S Holds"
            value={sourceErrors.order ? "Unavailable" : ownerStats.activeTrustSafetyHolds}
            icon="lock"
            color="violet"
            onClick={() => onNavigate("disputes", "")}
            sub={sourceErrors.order ? "Order API ไม่พร้อมใช้งาน" : "สถานะพักเงินที่ยัง active"}
          />
        </div>
      )}

      {Object.keys(sourceErrors).length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <span>ข้อมูลบางส่วนไม่พร้อมใช้งาน แยกจากค่า 0 เพื่อไม่ให้ตีความผิด</span>
          <button type="button" className="font-bold underline" onClick={() => setRefreshKey((key) => key + 1)}>
            ลองใหม่
          </button>
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <ChartCard title="Tickets by Priority" icon="bar_chart">
          <DonutChart data={priorityData} size={170} strokeWidth={38} />
        </ChartCard>

        <ChartCard title="Tickets by Status" icon="schedule">
          <TrendBarChart
            data={statusData.length ? statusData : [{ label: "...", value: 0 }]}
            height={200}
          />
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
            <div className="flex h-32 items-center justify-center text-sm text-gray-500">
              กำลังโหลด...
            </div>
          )}
        </ChartCard>

        <ChartCard title="Priority Distribution" icon="donut_small">
          <div className="flex flex-col gap-3 mt-2">
            {priorityData.map((d) => {
              const total = priorityData.reduce((s, x) => s + x.value, 0) || 1;
              const pct = Math.round((d.value / total) * 100);
              return (
                <div key={d.label} className="group flex items-center gap-3">
                  <span className="w-14 text-right text-xs font-medium text-slate-500">
                    {d.label}
                  </span>
                  <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2.5 shadow-inner">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${pct}%`, backgroundColor: d.color }}
                    />
                  </div>
                  <span className="w-8 text-xs font-semibold text-slate-700">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
