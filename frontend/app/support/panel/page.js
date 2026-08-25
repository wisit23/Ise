"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Pagination from "../../../components/Pagination";
import DonutChart from "../../../components/charts/DonutChart";
import TrendBarChart from "../../../components/charts/TrendBarChart";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

// ─── Constants ────────────────────────────────────────────────────────────────

const TICKET_STATUS_LABEL = {
  NEW: "ตั๋วใหม่",
  ASSIGNED: "มอบหมายแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  PENDING_USER: "รอลูกค้าตอบกลับ",
  RESOLVED: "แก้ไขสำเร็จ",
  CLOSED: "ปิดตั๋วแล้ว",
  ESCALATED: "ส่งเรื่องต่อ",
};

const TICKET_STATUS_STYLE = {
  NEW: "border border-emerald-400 text-emerald-700 bg-emerald-50",
  ASSIGNED: "border border-sky-400 text-sky-700 bg-sky-50",
  IN_PROGRESS: "border border-blue-400 text-blue-700 bg-blue-50",
  PENDING_USER: "border border-amber-400 text-amber-700 bg-amber-50",
  RESOLVED: "border border-green-400 text-green-700 bg-green-50",
  CLOSED: "border border-gray-300 text-gray-500 bg-gray-50",
  ESCALATED: "border border-red-400 text-red-700 bg-red-50",
};

const PRIORITY_LABEL = {
  LOW: "ต่ำ",
  NORMAL: "ปานกลาง",
  HIGH: "สูง",
  URGENT: "ด่วนที่สุด",
};

const PRIORITY_STYLE = {
  LOW: "border border-green-400 text-green-700 bg-green-50",
  NORMAL: "border border-amber-400 text-amber-700 bg-amber-50",
  HIGH: "border border-red-400 text-red-700 bg-red-50",
  URGENT: "bg-red-600 text-white border border-red-600",
};

// Agent-only next steps offered from each status (see ticketState.js).
const AGENT_NEXT_STATUS = {
  NEW: ["ESCALATED", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "ESCALATED", "CLOSED"],
  IN_PROGRESS: ["PENDING_USER", "RESOLVED", "ESCALATED"],
  PENDING_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  ESCALATED: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  CLOSED: [],
};

const DISPUTE_STATUS_LABEL = {
  OPEN: "รอตรวจสอบ",
  NEEDS_INFO: "รอข้อมูล",
  DECIDED: "ตัดสินแล้ว",
};

const DISPUTE_STATUS_STYLE = {
  OPEN: "border border-amber-400 text-amber-700 bg-amber-50",
  NEEDS_INFO: "border border-orange-400 text-orange-700 bg-orange-50",
  DECIDED: "border border-green-400 text-green-700 bg-green-50",
};

const ORDER_STATUS_LABEL = {
  pending: "รอชำระเงิน",
  confirmed: "ยืนยันแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
  disputed: "อยู่ระหว่างพิพาท",
  refunded: "คืนเงินแล้ว",
};

const HELP_CATEGORIES = [
  { value: "ORDER", label: "คำสั่งซื้อ" },
  { value: "PAYMENT", label: "การชำระเงิน" },
  { value: "ACCOUNT", label: "บัญชีผู้ใช้" },
  { value: "TECHNICAL", label: "ปัญหาการใช้งาน" },
  { value: "OTHER", label: "อื่นๆ" },
];

// UI Bakery emerald palette
const DONUT_PRIORITY_COLORS = {
  LOW: "#80c4be",
  NORMAL: "#f0c040",
  HIGH: "#e8846a",
  URGENT: "#e34948",
};

const DONUT_DISPUTE_COLORS = {
  OPEN: "#f0c040",
  NEEDS_INFO: "#eb6834",
  DECIDED: "#1baf7a",
};

const PAGE_SIZE = 15;

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Badge({ text, style }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium capitalize ${style}`}>
      {text}
    </span>
  );
}

function KpiCard({ label, value, sub, icon, color = "gray", onClick }) {
  const colors = {
    gray: "text-slate-400 bg-slate-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-500 bg-amber-50",
    red: "text-red-500 bg-red-50",
  };
  return (
    <div 
      onClick={onClick}
      className={`group rounded-xl border border-slate-200/60 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] hover:-translate-y-1 hover:shadow-[0_8px_20px_-6px_rgba(6,81,237,0.12)] transition-all duration-300 ease-out ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 group-hover:text-emerald-600 transition-colors cursor-default mb-1">
            {label}
          </p>
          <p className="text-3xl font-bold tracking-tight text-slate-900">{value ?? "…"}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colors[color]}`}>
          <span className="material-symbols-outlined text-[20px]">
            {icon}
          </span>
        </div>
      </div>
      {sub && (
        <p className="mt-3 text-[13px] font-semibold text-slate-500">{sub}</p>
      )}
    </div>
  );
}

function ChartCard({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] transition-shadow hover:shadow-[0_8px_20px_-6px_rgba(6,81,237,0.08)]">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span className="material-symbols-outlined text-[18px] text-emerald-600">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function DropdownFilter({ value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 shadow-sm outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 hover:border-slate-300"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
        expand_more
      </span>
    </div>
  );
}

// ─── Dashboard Section ────────────────────────────────────────────────────────

function DashboardSection({ token, onNavigate }) {
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
    fc("scope=all&status=ESCALATED").then((v) => setStats((s) => ({ ...s, escalated: v })));
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
        <KpiCard label="Urgent Tickets" value={stats.urgent} icon="priority_high" color="red"
          onClick={() => onNavigate("tickets", "ESCALATED")}
          sub={stats.escalated !== null ? `${stats.escalated} เกิน SLA` : null} />
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

// ─── Tickets Section ──────────────────────────────────────────────────────────

function TicketsSection({ token, statusFilter, setStatusFilter }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  function closeTicket() {
    setClosingTicket(true);
    setTimeout(() => { setSelectedTicket(null); setClosingTicket(false); setActionError(""); }, 280);
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: PAGE_SIZE, scope: "all" });
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    apiFetch(`/api/support/tickets/queue?${params}`, { token })
      .then((data) => { setItems(data.items || []); setTotalPages(data.totalPages || 1); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, q, statusFilter, priorityFilter, token, refreshKey]);

  function refreshAfterAction() {
    setRefreshKey((k) => k + 1);
    if (selectedTicket) {
      apiFetch(`/api/support/tickets/${selectedTicket.id}`, { token })
        .then(setSelectedTicket)
        .catch((err) => setActionError(err.message));
    }
  }

  async function handleAssign() {
    if (!selectedTicket) return;
    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/support/tickets/${selectedTicket.id}/assign`, {
        method: "POST",
        token,
      });
      refreshAfterAction();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStatusChange(status) {
    if (!selectedTicket) return;
    const reason =
      status === "ESCALATED"
        ? window.prompt("เหตุผลที่ยกระดับ (ไม่บังคับ)")
        : null;
    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/support/tickets/${selectedTicket.id}/status`, {
        method: "PATCH",
        token,
        body: { status, reason: reason || undefined },
      });
      refreshAfterAction();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <>
      <div className="animate-fade-in-up flex flex-col min-h-full">
        {/* Search & Filters */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => { e.preventDefault(); setQ(qInput); setPage(1); }}
          className="relative flex-1"
        >
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-400">
            search
          </span>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search tickets..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium outline-none shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 hover:border-slate-300"
          />
        </form>
        <DropdownFilter
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={[
            { value: "", label: "สถานะทั้งหมด" },
            { value: "NEW", label: "ตั๋วใหม่" },
            { value: "ASSIGNED", label: "มอบหมายแล้ว" },
            { value: "IN_PROGRESS", label: "กำลังดำเนินการ" },
            { value: "PENDING_USER", label: "รอลูกค้าตอบกลับ" },
            { value: "RESOLVED", label: "แก้ไขสำเร็จ" },
            { value: "CLOSED", label: "ปิดตั๋วแล้ว" },
            { value: "ESCALATED", label: "ส่งเรื่องต่อ" },
          ]}
        />
        <DropdownFilter
          value={priorityFilter}
          onChange={(v) => { setPriorityFilter(v); setPage(1); }}
          options={[
            { value: "", label: "ความสำคัญทั้งหมด" },
            { value: "LOW", label: "ต่ำ" },
            { value: "NORMAL", label: "ปานกลาง" },
            { value: "HIGH", label: "สูง" },
            { value: "URGENT", label: "ด่วนที่สุด" },
          ]}
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
        <table className="w-full min-w-[750px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-transparent text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-4">Ticket ID</th>
              <th className="px-5 py-4">
                รหัสลูกค้า (ID)
              </th>
              <th className="px-5 py-4">หัวข้อปัญหา</th>
              <th className="px-5 py-4">ความสำคัญ</th>
              <th className="px-5 py-4">สถานะ</th>
              <th className="px-5 py-4">
                ผู้รับผิดชอบ
              </th>
              <th className="px-5 py-4 text-center">
                จัดการ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-slate-400">
                  ไม่มีตั๋วในหมวดนี้
                </td>
              </tr>
            )}
            {items.map((t) => (
              <tr key={t.id} onClick={() => setSelectedTicket(t)} className="group hover:bg-slate-50/80 hover:shadow-sm transition-all duration-200 cursor-pointer">
                <td className="px-5 py-4 font-mono text-[11px] font-semibold tracking-tight text-slate-500">
                  {t.ticketNumber}
                </td>
                <td className="px-5 py-4 text-sm font-medium text-slate-700">
                  {t.requesterId?.slice(0, 8) ?? "—"}
                </td>
                <td className="max-w-[200px] truncate px-5 py-4 text-sm font-medium text-slate-900 group-hover:text-emerald-700 transition-colors">
                  {t.subject}
                </td>
                <td className="px-5 py-4">
                  <Badge
                    text={PRIORITY_LABEL[t.priority] || t.priority}
                    style={PRIORITY_STYLE[t.priority] || "bg-gray-100 text-gray-600"}
                  />
                </td>
                <td className="px-5 py-4">
                  <Badge
                    text={TICKET_STATUS_LABEL[t.status] || t.status}
                    style={TICKET_STATUS_STYLE[t.status] || "bg-slate-100 text-slate-600"}
                  />
                </td>
                <td className="px-5 py-4 text-xs font-medium text-slate-500">
                  {t.assigneeId ? t.assigneeId.slice(0, 8) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-5 py-4 text-xs font-medium text-slate-400">
                  {new Date(t.createdAt).toLocaleDateString("th-TH")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-right text-xs font-medium text-slate-400">
        คลิกที่แถวตั๋วเพื่อเปิดหน้าต่างแชท (Chat) เพื่อจัดการคำร้อง
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {selectedTicket && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeTicket()}
          className={`fixed inset-0 z-[100] flex justify-end bg-slate-900/50 backdrop-blur-sm ${
            closingTicket ? "animate-fade-out" : "animate-fade-in"
          }`}
        >
          <div className={`w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 ${
            closingTicket ? "animate-slide-out-right" : "animate-slide-in-right"
          }`}>

            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 bg-white px-7 py-5">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-mono text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">{selectedTicket.ticketNumber}</span>
                  <Badge text={TICKET_STATUS_LABEL[selectedTicket.status] || selectedTicket.status} style={TICKET_STATUS_STYLE[selectedTicket.status] || "bg-slate-100 text-slate-600"} />
                  <Badge text={PRIORITY_LABEL[selectedTicket.priority] || selectedTicket.priority} style={PRIORITY_STYLE[selectedTicket.priority] || "bg-slate-100 text-slate-600"} />
                </div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">{selectedTicket.subject}</h2>
              </div>
              <button
                onClick={closeTicket}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full aspect-square text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] leading-none block">close</span>
              </button>
            </div>

            {/* Info Strip */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/70">
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">ผู้แจ้ง (Requester)</p>
                <p className="font-mono text-xs font-semibold text-slate-700 truncate">{selectedTicket.requesterId?.slice(0, 14) ?? "—"}</p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">ผู้รับผิดชอบ (Agent)</p>
                <p className="font-mono text-xs font-semibold text-slate-700 truncate">
                  {selectedTicket.assigneeId ? selectedTicket.assigneeId.slice(0, 14) : <span className="italic text-slate-300">ยังไม่มอบหมาย</span>}
                </p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">วันที่เปิด</p>
                <p className="text-xs font-semibold text-slate-700">{new Date(selectedTicket.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</p>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 bg-slate-50/30">

              {/* Subject detail card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">info</span>
                  สาระคำร้อง
                </h3>
                <p className="text-sm text-slate-800 leading-relaxed font-medium">{selectedTicket.subject}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">รหัส: <span className="font-semibold text-slate-600">{selectedTicket.ticketNumber}</span></span>
                  <span className="text-xs text-slate-400">เปิด: <span className="font-semibold text-slate-600">{new Date(selectedTicket.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</span></span>
                </div>
              </div>

              {/* Requester card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">person</span>
                  ข้อมูลผู้แจ้ง
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-base shadow">
                    {selectedTicket.requesterId?.slice(0, 1).toUpperCase() ?? "U"}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">รหัส: {selectedTicket.requesterId?.slice(0, 16) ?? "—"}</p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{selectedTicket.requesterId}</p>
                  </div>
                </div>
              </div>

              {/* Agent assignment card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">support_agent</span>
                  เจ้าหน้าที่รับผิดชอบ
                </h3>
                {selectedTicket.assigneeId ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-base shadow">
                      <span className="material-symbols-outlined text-[20px]">support_agent</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">รหัส: {selectedTicket.assigneeId.slice(0, 16)}</p>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{selectedTicket.assigneeId}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-4 py-3">
                    <span className="material-symbols-outlined text-amber-400 text-[22px]">person_search</span>
                    <p className="text-sm text-amber-700 font-medium">ยังไม่ได้มอบหมายเจ้าหน้าที่</p>
                  </div>
                )}
              </div>

              {/* Chat placeholder - Coming Soon */}
              <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-500">
                  <span className="material-symbols-outlined text-[15px]">chat</span>
                  สนทนากับลูกค้า
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold shadow">
                    {selectedTicket.requesterId?.slice(0, 1).toUpperCase() ?? "U"}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">ผู้ใช้: #{selectedTicket.requesterId?.slice(0, 12)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">กำลังพัฒนาระบบแชท</p>
                  </div>
                  <button className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 opacity-50 cursor-not-allowed">
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    แชท (Soon)
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">build</span>
                  จัดการคำร้อง (Actions)
                </h3>
                {actionError && (
                  <p className="mb-3 text-xs font-semibold text-red-600">{actionError}</p>
                )}
                {(() => {
                  const nextStatuses = AGENT_NEXT_STATUS[selectedTicket.status] || [];
                  return (
                    <div className="flex gap-2">
                      {!selectedTicket.assigneeId && (
                        <button
                          onClick={handleAssign}
                          disabled={actionBusy}
                          className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          รับงาน (Assign)
                        </button>
                      )}
                      {nextStatuses.includes("CLOSED") && (
                        <button
                          onClick={() => handleStatusChange("CLOSED")}
                          disabled={actionBusy}
                          className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          ปิดงาน (Close)
                        </button>
                      )}
                      {nextStatuses.includes("ESCALATED") && (
                        <button
                          onClick={() => handleStatusChange("ESCALATED")}
                          disabled={actionBusy}
                          className="flex-1 rounded-lg bg-red-50 text-red-600 py-2.5 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          ส่งต่อ Admin
                        </button>
                      )}
                      {nextStatuses.length === 0 && selectedTicket.assigneeId && (
                        <p className="text-xs font-medium text-slate-400">ไม่มีการดำเนินการเพิ่มเติมสำหรับสถานะนี้</p>
                      )}
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Disputes Section ─────────────────────────────────────────────────────────

function DisputesSection({ token, status, setStatus }) {
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ total: null, open: null, decided: null });

  // Slide-over states
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [closingDispute, setClosingDispute] = useState(false);
  const [showDisputeChat, setShowDisputeChat] = useState(false);
  const [closingChat, setClosingChat] = useState(false);
  const [disputeDetails, setDisputeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [openingEvidenceId, setOpeningEvidenceId] = useState(null);

  function closeDispute() {
    if (showDisputeChat) {
      setClosingChat(true);
      setTimeout(() => {
        setShowDisputeChat(false);
        setClosingChat(false);
        setClosingDispute(true);
        setTimeout(() => { setSelectedDispute(null); setClosingDispute(false); }, 280);
      }, 200);
    } else {
      setClosingDispute(true);
      setTimeout(() => { setSelectedDispute(null); setClosingDispute(false); }, 280);
    }
  }

  function openDisputeChat() {
    setShowDisputeChat(true);
    setClosingChat(false);
  }

  function closeDisputeChat() {
    setClosingChat(true);
    setTimeout(() => { setShowDisputeChat(false); setClosingChat(false); }, 250);
  }

  async function loadDisputeDetails(orderId) {
    setDetailsLoading(true);
    try {
      const data = await apiFetch(`/api/orders/disputes/by-order/${orderId}`, { token });
      setDisputeDetails(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  }

  function handleOpenDispute(d) {
    setSelectedDispute(d);
    setDisputeDetails(null);
    setDecisionReason("");
    setShowDisputeChat(false);
    setClosingChat(false);
    loadDisputeDetails(d.orderId);
  }

  async function handleViewEvidence(ev) {
    setOpeningEvidenceId(ev.id);
    try {
      const objectUrl = await fetchAuthedBlobUrl(
        `/api/orders/disputes/${disputeDetails.id}/evidence/${ev.id}`
      );
      window.open(objectUrl, "_blank", "noreferrer");
    } catch (err) {
      alert("Failed to load evidence: " + err.message);
    } finally {
      setOpeningEvidenceId(null);
    }
  }

  async function handleDecision(decision) {
    if (!decisionReason.trim()) return;
    setDeciding(true);
    try {
      await apiFetch(`/api/orders/disputes/${disputeDetails.id}/decision`, {
        method: "POST",
        token,
        body: { decision, reason: decisionReason },
      });
      // Refresh details and list
      loadDisputeDetails(selectedDispute.orderId);
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      const data = await apiFetch(`/api/orders/disputes/queue?${params}`, { token });
      setItems(data.items || []);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setDeciding(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    apiFetch(`/api/orders/disputes/queue?${params}`, { token })
      .then((data) => { setItems(data.items || []); setTotalPages(data.totalPages || 1); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, status, q, token]);

  useEffect(() => {
    const fc = (p) =>
      apiFetch(`/api/orders/disputes/queue?${p}&limit=1`, { token })
        .then((d) => d.total).catch(() => null);
    fc("").then((v) => setStats((s) => ({ ...s, total: v })));
    fc("status=OPEN").then((v) => setStats((s) => ({ ...s, open: v })));
    fc("status=DECIDED").then((v) => setStats((s) => ({ ...s, decided: v })));
  }, [token]);

  return (
    <>
      <div className="animate-fade-in-up flex flex-col min-h-full">
        {/* Mini stat row */}
        <div className="mb-5 grid grid-cols-3 gap-4">
        <KpiCard label="ทั้งหมด" value={stats.total} icon="folder" color="gray" />
        <KpiCard label="รอตรวจสอบ" value={stats.open} icon="inbox" color="amber" />
        <KpiCard label="ตัดสินแล้ว" value={stats.decided} icon="check_circle" color="emerald" />
      </div>

      {/* Search & Filter */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => { e.preventDefault(); setQ(qInput); setPage(1); }}
          className="relative flex-1"
        >
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-400">
            search
          </span>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search disputes..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium outline-none shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 hover:border-slate-300"
          />
        </form>
          <DropdownFilter
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: "", label: "สถานะทั้งหมด" },
              { value: "OPEN", label: "รอตรวจสอบ" },
              { value: "NEEDS_INFO", label: "รอข้อมูล" },
              { value: "DECIDED", label: "ตัดสินแล้ว" },
            ]}
          />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
        <table className="w-full min-w-[700px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-transparent text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-4">Dispute ID</th>
              <th className="px-5 py-4">เหตุผล</th>
              <th className="px-5 py-4">Buyer → Seller</th>
              <th className="px-5 py-4">ยอดเงิน</th>
              <th className="px-5 py-4">สถานะ</th>
              <th className="px-5 py-4">วันที่เปิด</th>
              <th className="px-5 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-slate-400">กำลังโหลด...</td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-slate-400">ไม่มีข้อพิพาทในหมวดนี้</td>
              </tr>
            )}
            {items.map((d) => (
              <tr key={d.id} className="group hover:bg-slate-50/80 hover:shadow-sm transition-all duration-200">
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center font-mono text-[11px] font-semibold tracking-tight text-slate-800">
                      #{d.id.slice(0, 8).toUpperCase()}
                      <button
                        onClick={() => navigator.clipboard.writeText(d.id)}
                        className="ml-1 text-slate-300 hover:text-emerald-600 transition-colors"
                        title="Copy"
                      >
                        <span className="material-symbols-outlined text-[13px] align-middle">content_copy</span>
                      </button>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">
                      Ord #{d.orderId.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                </td>
                <td className="max-w-[180px] truncate px-5 py-4 text-sm font-medium text-slate-700">
                  {d.reason}
                </td>
                <td className="px-5 py-4">
                  {d.order ? (
                    <div className="text-xs text-gray-500 flex flex-col gap-0.5">
                      <span className="flex items-center group/b">
                        {d.order.buyerId.slice(0, 8)} (B)
                        <button onClick={() => navigator.clipboard.writeText(d.order.buyerId)} className="ml-1 opacity-0 group-hover/b:opacity-100 text-slate-300 hover:text-emerald-600 transition-all" title="Copy Full ID">
                          <span className="material-symbols-outlined text-[13px] align-middle">content_copy</span>
                        </button>
                      </span>
                      <span className="flex items-center group/s">
                        {d.order.sellerId.slice(0, 8)} (S)
                        <button onClick={() => navigator.clipboard.writeText(d.order.sellerId)} className="ml-1 opacity-0 group-hover/s:opacity-100 text-slate-300 hover:text-emerald-600 transition-all" title="Copy Full ID">
                          <span className="material-symbols-outlined text-[13px] align-middle">content_copy</span>
                        </button>
                      </span>
                    </div>
                  ) : "—"}
                </td>
                <td className="px-5 py-4 font-medium text-slate-700">
                  {d.order?.price ? `฿${d.order.price.toLocaleString("th-TH")}` : "—"}
                </td>
                <td className="px-5 py-4">
                  <Badge
                    text={DISPUTE_STATUS_LABEL[d.status] || d.status}
                    style={DISPUTE_STATUS_STYLE[d.status] || "bg-slate-100 text-slate-600"}
                  />
                </td>
                <td className="px-5 py-4 text-xs font-medium text-slate-400">
                  {new Date(d.createdAt).toLocaleDateString("th-TH")}
                </td>
                <td className="px-5 py-4 text-center">
                  <button
                    onClick={() => handleOpenDispute(d)}
                    className={`rounded-lg px-4 py-1.5 text-[11px] font-bold tracking-wide uppercase transition-all shadow-sm hover:shadow ${
                      d.status === "DECIDED"
                        ? "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 hover:-translate-y-0.5"
                    }`}
                  >
                    {d.status === "DECIDED" ? "ดูรายละเอียด" : "ตรวจสอบ"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {selectedDispute && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeDispute()}
          className={`fixed inset-0 z-[100] flex justify-end bg-slate-900/50 backdrop-blur-sm ${
            closingDispute ? "animate-fade-out" : "animate-fade-in"
          }`}
        >
          {/* Chat sub-panel - slides in from left of dispute panel */}
          {(showDisputeChat || closingChat) && (
            <div className={`flex w-full max-w-sm flex-col border-r border-slate-200 bg-white shadow-xl ${
              closingChat ? "animate-slide-out-left" : "animate-slide-in-left"
            }`}>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">แชทกับผู้ซื้อ</h3>
                  <p className="text-xs text-indigo-500 font-medium">Coming Soon</p>
                </div>
                <button
                  onClick={closeDisputeChat}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full aspect-square text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px] leading-none block">close</span>
                </button>
              </div>
              {/* Buyer info */}
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-xs font-bold">
                    {selectedDispute.order?.buyerId?.slice(0,1)?.toUpperCase() ?? "B"}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">ผู้ซื้อ</p>
                    <p className="font-mono text-[10px] text-slate-400">{(selectedDispute.order?.buyerId ?? "").slice(0, 16)}</p>
                  </div>
                </div>
              </div>
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50/40 flex flex-col gap-3">
                <div className="flex justify-center">
                  <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Today</span>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-[10px] font-bold">
                    {selectedDispute.order?.buyerId?.slice(0,1)?.toUpperCase() ?? "B"}
                  </div>
                  <div className="max-w-[80%]">
                    <p className="text-[10px] text-slate-400 mb-1 ml-1">ผู้ซื้อ</p>
                    <div className="rounded-2xl rounded-bl-sm bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm">
                      {selectedDispute.reason}
                    </div>
                  </div>
                </div>
                <div className="flex items-end gap-2 flex-row-reverse">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white">
                    <span className="material-symbols-outlined text-[14px]">support_agent</span>
                  </div>
                  <div className="max-w-[80%]">
                    <p className="text-[10px] text-slate-400 mb-1 mr-1 text-right">เจ้าหน้าที่</p>
                    <div className="rounded-2xl rounded-br-sm bg-emerald-600 px-3 py-2 text-xs text-white shadow-sm">
                      รับทราบครับ เรากำลังพิจารณาเคสของคุณ
                    </div>
                  </div>
                </div>
                {/* Coming soon note */}
                <div className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-3 text-center">
                  <p className="text-xs font-bold text-indigo-600">ระบบแชทเต็มรูปแบบ — Coming Soon</p>
                  <p className="text-[11px] text-indigo-400 mt-0.5">ฟีเจอร์นี้กำลังพัฒนาอยู่</p>
                </div>
              </div>
              {/* Input disabled */}
              <div className="border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 opacity-50 cursor-not-allowed">
                  <span className="material-symbols-outlined text-[18px] text-slate-400">attach_file</span>
                  <input disabled placeholder="ระบบแชทจะเปิดเร็วๆ นี้..." className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 cursor-not-allowed" />
                  <button disabled className="flex items-center justify-center rounded-lg bg-emerald-600 p-1.5 text-white opacity-50">
                    <span className="material-symbols-outlined text-[16px]">send</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Dispute Panel */}
          <div className={`flex w-full max-w-2xl flex-col bg-white shadow-2xl h-full border-l border-slate-200 ${
            closingDispute ? "animate-slide-out-right" : "animate-slide-in-right"
          }`}>

            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 bg-white px-7 py-5">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="material-symbols-outlined text-[18px] text-amber-500">gavel</span>
                  <h2 className="text-base font-bold text-slate-900">ข้อพิพาทคำสั่งซื้อ</h2>
                  <Badge
                    text={DISPUTE_STATUS_LABEL[selectedDispute.status] || selectedDispute.status}
                    style={DISPUTE_STATUS_STYLE[selectedDispute.status] || "bg-slate-100 text-slate-600"}
                  />
                </div>
                <p className="font-mono text-xs text-slate-400">Order ID: {selectedDispute.orderId}</p>
              </div>
              <button
                onClick={closeDispute}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full aspect-square text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] leading-none block">close</span>
              </button>
            </div>

            {/* Info Strip */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/70">
              <div className="px-6 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">ผู้ซื้อ (Buyer)</p>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                    {selectedDispute.order?.buyerId?.slice(0,1)?.toUpperCase() ?? "B"}
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-700 truncate">{selectedDispute.order?.buyerId ?? selectedDispute.buyerId ?? "—"}</span>
                </div>
              </div>
              <div className="px-6 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">ผู้ขาย (Seller)</p>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                    {selectedDispute.order?.sellerId?.slice(0,1)?.toUpperCase() ?? "S"}
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-700 truncate">{selectedDispute.order?.sellerId ?? selectedDispute.sellerId ?? "—"}</span>
                </div>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 bg-slate-50/30">

              {/* Reason */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">info</span>
                  เหตุผลที่เปิดเคส
                </h3>
                <p className="text-sm text-slate-800 leading-relaxed">{selectedDispute.reason}</p>
                <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">เปิดเคสเมื่อ: <span className="font-semibold text-slate-600">{new Date(selectedDispute.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</span></span>
                </div>
              </div>

              {/* Buyer Contact with Chat button */}
              <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-500">
                  <span className="material-symbols-outlined text-[15px]">person</span>
                  ช่องทางติดต่อผู้ซื้อ
                </h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white font-bold text-sm shadow">
                      {selectedDispute.order?.buyerId?.slice(0, 2)?.toUpperCase() ?? "B"}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">ผู้ซื้อ #{(selectedDispute.order?.buyerId ?? selectedDispute.buyerId ?? "").slice(0, 12)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">กดปุ่ม &quot;แชท&quot; เพื่อเปิดหน้าต่างสนทนา</p>
                    </div>
                  </div>
                  <button
                    onClick={openDisputeChat}
                    className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    แชท
                  </button>
                </div>
              </div>

              {/* Evidence */}
              {!disputeDetails && detailsLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white p-8 text-sm text-slate-400">
                  <span className="material-symbols-outlined text-[20px] text-emerald-500" style={{animation:'spin 1s linear infinite'}}>progress_activity</span>
                  กำลังโหลดข้อมูลเคส...
                </div>
              ) : disputeDetails ? (
                <>
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <span className="material-symbols-outlined text-[15px]">folder_open</span>
                      หลักฐานประกอบ ({disputeDetails.evidence?.length || 0} ไฟล์)
                    </h3>
                    {!disputeDetails.evidence?.length ? (
                      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-8 text-slate-400">
                        <span className="material-symbols-outlined text-[36px]">image_not_supported</span>
                        <p className="text-sm">ยังไม่มีหลักฐานแนบมา</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3">
                        {disputeDetails.evidence.map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => handleViewEvidence(ev)}
                            disabled={openingEvidenceId === ev.id}
                            className="group flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400 transition-all hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 hover:shadow-md disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[28px] transition-transform group-hover:scale-110">
                              {ev.fileType.startsWith("video/") ? "movie" : "image"}
                            </span>
                            <span className="text-[10px] font-bold">
                              {openingEvidenceId === ev.id ? "กำลังเปิด..." : (ev.fileType.startsWith("video/") ? "วิดีโอ" : "รูปภาพ")}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {disputeDetails.status === "DECIDED" ? (
                    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600">
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        ผลการตัดสิน
                      </h3>
                      <div className={`mb-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold ${
                        disputeDetails.decision === "APPROVE_REFUND"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {disputeDetails.decision === "APPROVE_REFUND" ? "payments" : "block"}
                        </span>
                        {disputeDetails.decision === "APPROVE_REFUND" ? "อนุมัติคืนเงิน" : "ปฏิเสธคำร้อง"}
                      </div>
                      <p className="mt-2 text-sm text-slate-700 leading-relaxed">{disputeDetails.decisionReason}</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <span className="material-symbols-outlined text-[15px]">edit_note</span>
                        บันทึกผลการพิจารณา
                      </h3>
                      <textarea
                        value={decisionReason}
                        onChange={(e) => setDecisionReason(e.target.value)}
                        rows={4}
                        placeholder="ระบุเหตุผลประกอบการตัดสิน (บังคับกรอก)..."
                        className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 resize-none"
                      />
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleDecision("APPROVE_REFUND")}
                            disabled={deciding || !decisionReason.trim()}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">payments</span>
                            อนุมัติคืนเงิน
                          </button>
                          <button
                            onClick={() => handleDecision("REJECT")}
                            disabled={deciding || !decisionReason.trim()}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3 text-sm font-bold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-40 transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">block</span>
                            ปฏิเสธคำร้อง
                          </button>
                        </div>
                        <button
                          onClick={() => handleDecision("ESCALATE")}
                          disabled={deciding || !decisionReason.trim()}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white py-2 text-sm font-bold text-amber-600 shadow-sm hover:bg-amber-50 disabled:opacity-40 transition-all"
                        >
                          <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                          ส่งเรื่องให้ Admin (Escalate)
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Orders Section ───────────────────────────────────────────────────────────

function OrdersSection({ token }) {
  const [searchType, setSearchType] = useState("orderId");
  const [showSearchType, setShowSearchType] = useState(false);
  const searchTypeLabels = {
    orderId: "รหัสคำสั่งซื้อ (Order)",
    buyerId: "รหัสผู้ซื้อ (Buyer)",
    sellerId: "รหัสผู้ขาย (Seller)"
  };
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams();
      params.set(searchType, query.trim());
      const data = await apiFetch(`/api/orders/support/search?${params}`, { token });
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`animate-fade-in-up flex flex-col ${!searched ? "items-center justify-center min-h-[40vh] pt-10 text-center" : ""}`}>
      
      {!searched && (
        <div className="mb-8 animate-in zoom-in-95 duration-500">
          <span className="material-symbols-outlined text-[64px] text-emerald-600 mb-2 drop-shadow-sm">manage_search</span>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">ศูนย์กลางค้นหาออเดอร์</h2>
          <p className="mt-2 text-sm font-medium text-slate-500">พิมพ์รหัส Order, Buyer, หรือ Seller เพื่อตรวจสอบประวัติการซื้อขาย</p>
        </div>
      )}

      <div className={`w-full transition-all duration-500 ease-out ${searched ? "max-w-4xl mb-6" : "max-w-2xl"}`}>
        <form
          onSubmit={handleSearch}
          className="relative flex w-full items-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.06)] transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 hover:border-slate-300"
        >
          <div className="relative border-r border-slate-200 bg-slate-50/50 rounded-l-lg">
            <button
              type="button"
              onClick={() => setShowSearchType(!showSearchType)}
              className="flex items-center justify-between w-48 bg-transparent py-2.5 pl-4 pr-3 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-100 transition-colors"
            >
              <span className="truncate">{searchTypeLabels[searchType]}</span>
              <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0">
                expand_more
              </span>
            </button>
            {showSearchType && (
              <div className="absolute top-full left-0 mt-2 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-20 animate-fade-in-up">
                {Object.entries(searchTypeLabels).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setSearchType(val); setShowSearchType(false); }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      searchType === val ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-1 items-center px-3">
            <span className="material-symbols-outlined mr-2 text-[20px] text-slate-400">search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์รหัสที่ต้องการค้นหา..."
              className="w-full border-0 bg-transparent py-2.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {searched && !loading && items.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <span className="material-symbols-outlined text-[40px] text-slate-300 mb-2">search_off</span>
          <p className="text-sm font-semibold text-slate-600">ไม่พบคำสั่งซื้อที่ตรงกับเงื่อนไข</p>
          <p className="mt-1 text-xs text-slate-400">หมายเหตุ: การค้นหา Buyer/Seller ต้องใช้รหัสเต็ม (Full ID) ไม่ใช่รหัสย่อ 8 ตัวแรก</p>
        </div>
      )}
      <ul className="flex flex-col gap-3 max-w-4xl">
        {items.map((o) => (
          <li key={o.id} className="group rounded-xl border border-slate-200/60 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)] hover:shadow-md hover:border-slate-300 transition-all duration-200">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">{o.productTitle}</p>
              <Badge
                text={ORDER_STATUS_LABEL[o.status] || o.status}
                style={o.status === "disputed" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium text-slate-500">
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-400">receipt_long</span> Order {o.id.slice(0, 8)}</span>
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-400">payments</span> ฿{o.price?.toLocaleString("th-TH")}</span>
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-400">person</span> Buyer {o.buyerId?.slice(0, 8)}</span>
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-400">storefront</span> Seller {o.sellerId?.slice(0, 8)}</span>
            </div>
            {o.status === "disputed" && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <Link
                  href={`/support/cases/${o.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold tracking-wide text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                  ดูข้อพิพาทของออเดอร์นี้
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── FAQ Section ──────────────────────────────────────────────────────────────

function FaqSection({ token }) {
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [closingForm, setClosingForm] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "OTHER" });
  const [submitting, setSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState(null);

  function closeForm() {
    setClosingForm(true);
    setTimeout(() => {
      setShowForm(false);
      setClosingForm(false);
    }, 280);
  }

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: 50 });
    if (status) params.set("status", status);
    apiFetch(`/api/support/help/manage?${params}`, { token })
      .then((data) => setItems(data.items || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [status, token]);

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/support/help", { method: "POST", token, body: form });
      setForm({ title: "", body: "", category: "OTHER" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(id) {
    setPublishingId(id);
    try {
      await apiFetch(`/api/support/help/${id}/publish`, { method: "PATCH", token });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <>
      <div className="animate-fade-in-up flex flex-col min-h-full">
        <div className="mb-5 flex items-center justify-between">
        <DropdownFilter
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "ทั้งหมด" },
            { value: "DRAFT", label: "ฉบับร่าง" },
            { value: "PUBLISHED", label: "เผยแพร่แล้ว" },
          ]}
        />
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          เขียนบทความใหม่
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-400">ยังไม่มีบทความในหมวดนี้</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((a) => (
          <li key={a.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="mb-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                  {a.category}
                </span>
                <p className="font-medium text-gray-900">{a.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{a.body}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  a.status === "PUBLISHED"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {a.status === "PUBLISHED" ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
              </span>
            </div>
            {a.status !== "PUBLISHED" && (
              <button
                onClick={() => handlePublish(a.id)}
                disabled={publishingId === a.id}
                className="mt-2 text-sm font-medium text-emerald-600 hover:underline disabled:opacity-50"
              >
                {publishingId === a.id ? "กำลังเผยแพร่..." : "เผยแพร่บทความนี้"}
              </button>
            )}
          </li>
        ))}
      </ul>
      </div>

      {/* FAQ Modal */}
      {(showForm || closingForm) && (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm ${closingForm ? "animate-fade-out" : "animate-fade-in"}`}>
          <div className={`w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ${closingForm ? "animate-fade-out" : "animate-fade-in-up"}`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">เขียนบทความใหม่ (New FAQ)</h2>
              <button onClick={closeForm} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full aspect-square text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <span className="material-symbols-outlined text-[20px] leading-none block">close</span>
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-5 p-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">หัวข้อบทความ</label>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="เช่น วิธีการคืนสินค้า..."
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>
                <div className="col-span-1 relative">
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">หมวดหมู่</label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none hover:border-slate-300 hover:bg-slate-50 transition-colors focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  >
                    <span className="truncate">
                      {HELP_CATEGORIES.find((c) => c.value === form.category)?.label || "เลือกหมวดหมู่"}
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0">
                      expand_more
                    </span>
                  </button>
                  {showCategoryDropdown && (
                    <div className="absolute top-full left-0 mt-2 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-20 animate-fade-in-up">
                      {HELP_CATEGORIES.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => { setForm({ ...form, category: c.value }); setShowCategoryDropdown(false); }}
                          className={`w-full text-left rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                            form.category === c.value ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">เนื้อหาบทความ</label>
                <textarea
                  required
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={8}
                  placeholder="เขียนอธิบายรายละเอียดที่นี่..."
                  className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition-colors hover:bg-emerald-700 hover:shadow-lg disabled:opacity-50"
                >
                  {submitting ? "กำลังบันทึก..." : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">save</span> บันทึกเป็นฉบับร่าง
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Panel Shell ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "tickets", label: "Tickets", icon: "confirmation_number" },
  { key: "disputes", label: "Disputes", icon: "gavel" },
  { key: "orders", label: "ค้นหาออเดอร์", icon: "search" },
  { key: "faq", label: "จัดการ FAQ", icon: "menu_book" },
];

export default function SupportPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [section, setSection] = useState("dashboard");
  const [ticketsFilter, setTicketsFilter] = useState("");
  const [disputesFilter, setDisputesFilter] = useState("");

  function navigateTo(tab, filter) {
    setSection(tab);
    if (tab === "tickets") setTicketsFilter(filter);
    if (tab === "disputes") setDisputesFilter(filter);
  }

  useEffect(() => {
    // Inject Material Symbols font
    if (!document.getElementById("material-symbols-font")) {
      const link = document.createElement("link");
      link.id = "material-symbols-font";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }
    setUser(getStoredUser());
  }, [router]);

  if (user === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-gray-500">กำลังโหลด...</p>
      </main>
    );
  }
  if (user?.role !== "SUPPORT" && user?.role !== "ADMIN") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะเจ้าหน้าที่ซัพพอร์ตเท่านั้น
        </p>
      </main>
    );
  }

  const token = getAccessToken();
  const activeSection = SECTIONS.find((s) => s.key === section);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <NavBar />
      <div className="flex flex-1">
        {/* ── Sidebar ── */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200/60 bg-white sm:flex shadow-[2px_0_10px_-3px_rgba(6,81,237,0.03)] z-10">
          {/* Brand */}
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <span className="material-symbols-outlined text-[22px]">headset_mic</span>
              </span>
              <div className="flex flex-col">
                <span className="text-[15px] font-extrabold tracking-tight text-slate-800">Re-loop panel</span>
                <span className="text-[10px] font-bold tracking-wider text-emerald-600 uppercase">
                  {user?.role === "ADMIN" ? "Administrator" : "Support Agent"}
                </span>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
            {SECTIONS.map((s) => {
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] transition-transform ${active ? "scale-110" : ""}`}>{s.icon}</span>
                  {s.label}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
            <Link
              href="/support/tickets"
              className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              ตั๋วซัพพอร์ตทั่วไป
            </Link>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Top bar */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-8 py-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)]">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <span className="material-symbols-outlined text-[18px]">{activeSection?.icon}</span>
              </span>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">{activeSection?.label}</h1>
            </div>
            {/* Mobile section switcher */}
            <div className="flex items-center gap-3 sm:hidden">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium shadow-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              >
                {SECTIONS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 max-w-7xl mx-auto">
            {section === "dashboard" && <DashboardSection token={token} onNavigate={navigateTo} />}
            {section === "tickets" && (
              <TicketsSection token={token} userId={user?.id} statusFilter={ticketsFilter} setStatusFilter={setTicketsFilter} />
            )}
            {section === "disputes" && <DisputesSection token={token} status={disputesFilter} setStatus={setDisputesFilter} />}
            {section === "orders" && <OrdersSection token={token} />}
            {section === "faq" && <FaqSection token={token} />}
          </div>
        </main>
      </div>
    </div>
  );
}
