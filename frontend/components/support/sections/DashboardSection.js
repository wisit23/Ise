"use client";
import Icon from "../../ui/Icon";

import AgentDashboard from "./AgentDashboard";
import { useState, useEffect } from "react";
import styles from "./SafetyDashboard.module.css";
import ChartCard from "../../panel/ui/ChartCard";
import {
  DONUT_PRIORITY_COLORS,
  DONUT_DISPUTE_COLORS,
} from "../../../lib/supportConstants";
import { apiFetch } from "../../../lib/api";
import { CategoryBars, DailyVolume } from "./SafetyDashboardCharts";

function KpiCard({ label, value, sub, icon, color, onClick }) {
  const content = (
    <>
      <div className={styles.metricTop}>
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={"material-symbols-outlined " + styles.metricIcon}
          data-color={color}
        >
          {icon}
        </span>
      </div>
      <strong className={styles.metricValue}>
        {typeof value === "number"
          ? value.toLocaleString("th-TH")
          : (value ?? "…")}
      </strong>
      <span className={styles.metricHint}>
        {sub}
        {onClick && <span aria-hidden="true"> <Icon name="open_in_new" /></span>}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={styles.metric} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={styles.metric}>{content}</div>
  );
}

function SafetyDashboardSection({ token, userRole, onNavigate }) {
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
  const [hourlyTrend, setHourlyTrend] = useState([]);
  const [ownerStats, setOwnerStats] = useState({
    pendingKyc: null,
    openReports: null,
    activeTrustSafetyHolds: null,
  });
  const [sourceErrors, setSourceErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [days, setDays] = useState(7);

  useEffect(() => {
    let active = true;
    setSourceErrors({});
    setLoading(true);
    apiFetch("/api/support/tickets/dashboard?days=30", { token })
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
          {
            label: "ต่ำ",
            value: priority.LOW || 0,
            color: DONUT_PRIORITY_COLORS.LOW,
          },
          {
            label: "ปกติ",
            value: priority.NORMAL || 0,
            color: DONUT_PRIORITY_COLORS.NORMAL,
          },
          {
            label: "สูง",
            value: priority.HIGH || 0,
            color: DONUT_PRIORITY_COLORS.HIGH,
          },
          {
            label: "เร่งด่วน",
            value: priority.URGENT || 0,
            color: DONUT_PRIORITY_COLORS.URGENT,
          },
        ]);
        setStatusData([
          { label: "ใหม่", value: status.NEW || 0 },
          { label: "กำลังดำเนินการ", value: status.IN_PROGRESS || 0 },
          { label: "รอผู้ใช้ตอบ", value: status.PENDING_USER || 0 },
          { label: "แก้ไขแล้ว", value: status.RESOLVED || 0 },
          { label: "ปิดแล้ว", value: status.CLOSED || 0 },
          { label: "ส่งต่อ T&S", value: status.ESCALATED || 0 },
        ]);
        setHourlyTrend(
          (data.hourlyTrend || []).map(({ hour, count }) => ({
            label: hour,
            value: count,
          })),
        );
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
        if (active)
          setSourceErrors((current) => ({ ...current, support: err.message }));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    apiFetch("/api/orders/disputes/dashboard", { token })
      .then((data) => {
        if (!active) return;
        const dispute = data.disputesByStatus || {};
        setDisputeData([
          {
            label: "รอตรวจสอบ",
            value: dispute.OPEN || 0,
            color: DONUT_DISPUTE_COLORS.OPEN,
          },
          {
            label: "รอข้อมูล",
            value: dispute.NEEDS_INFO || 0,
            color: DONUT_DISPUTE_COLORS.NEEDS_INFO,
          },
          {
            label: "ตัดสินแล้ว",
            value: dispute.DECIDED || 0,
            color: DONUT_DISPUTE_COLORS.DECIDED,
          },
        ]);
      })
      .catch((err) => {
        if (active)
          setSourceErrors((current) => ({ ...current, dispute: err.message }));
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
          if (active)
            setSourceErrors((current) => ({ ...current, order: err.message }));
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
          if (active)
            setSourceErrors((current) => ({ ...current, auth: err.message }));
        });
    }
    return () => {
      active = false;
    };
  }, [token, isSafety, refreshKey]);

  const visibleTrend = days === 1 ? hourlyTrend : ticketTrend.slice(-days);

  return (
    <div className={styles.dashboard}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">
          ภาพรวม Trust & Safety
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          ติดตามงานรอตรวจสอบ สถานะเคส และจำนวนเรื่องที่เข้ามา
        </p>
      </div>
      <div className={styles.sectionHeading}>
        <h3>ภาพรวมเคส</h3>
        <span>สถานะปัจจุบัน · ทุกช่วงเวลา</span>
      </div>
      <div className={styles.metrics}>
        <KpiCard
          label="เคสทั้งหมด"
          value={
            sourceErrors.support
              ? "ไม่พร้อมใช้งาน"
              : loading
                ? null
                : stats.total
          }
          icon="confirmation_number"
          color="emerald"
          sub={
            !sourceErrors.support && !loading && stats.open !== null
              ? `${stats.open.toLocaleString("th-TH")} กำลังดำเนินการ`
              : "รวมทุกสถานะ"
          }
        />
        <KpiCard
          label="เคสที่แก้ไขแล้ว"
          value={
            sourceErrors.support
              ? "ไม่พร้อมใช้งาน"
              : loading
                ? null
                : stats.resolved
          }
          icon="check_circle"
          color="emerald"
          sub="แก้ไขแล้ว"
        />
        <KpiCard
          label="เคสรอรับเรื่อง"
          value={
            sourceErrors.support
              ? "ไม่พร้อมใช้งาน"
              : loading
                ? null
                : stats.pending
          }
          icon="pending"
          color="amber"
          sub="รอรับเรื่อง"
        />
        {isSafety ? (
          <KpiCard
            label="เคสส่งต่อ T&S"
            value={
              sourceErrors.support
                ? "ไม่พร้อมใช้งาน"
                : loading
                  ? null
                  : stats.escalated
            }
            icon="priority_high"
            color="red"
            onClick={() => onNavigate("admin_inbox", "")}
            sub="ดูที่คิว Trust & Safety"
          />
        ) : (
          <KpiCard
            label="เคสเร่งด่วน"
            value={
              sourceErrors.support
                ? "ไม่พร้อมใช้งาน"
                : loading
                  ? null
                  : stats.urgent
            }
            icon="priority_high"
            color="red"
            onClick={() => onNavigate("tickets", "")}
            sub="ความสำคัญด่วนที่สุด"
          />
        )}
      </div>

      {isSafety && (
        <section className={styles.queueSection}>
          <div className={styles.sectionHeading}>
            <h3>งานที่ต้องติดตาม</h3>
            <span>เลือกการ์ดเพื่อเปิดคิวงาน</span>
          </div>
          <div className={styles.queues}>
            <KpiCard
              label="ยืนยันตัวตนรอตรวจ"
              value={
                sourceErrors.auth ? "ไม่พร้อมใช้งาน" : ownerStats.pendingKyc
              }
              icon="how_to_reg"
              color="amber"
              onClick={() => onNavigate("kyc", "")}
              sub={sourceErrors.auth ? "โหลดข้อมูลไม่สำเร็จ" : "รอตรวจสอบ"}
            />
            <KpiCard
              label="รายงานรอตรวจสอบ"
              value={
                sourceErrors.auth ? "ไม่พร้อมใช้งาน" : ownerStats.openReports
              }
              icon="report"
              color="red"
              onClick={() => onNavigate("reports", "")}
              sub={
                sourceErrors.auth
                  ? "โหลดข้อมูลไม่สำเร็จ"
                  : "เปิดอยู่หรือกำลังตรวจ"
              }
            />
            <KpiCard
              label="รายการพักเงิน"
              value={
                sourceErrors.order
                  ? "ไม่พร้อมใช้งาน"
                  : ownerStats.activeTrustSafetyHolds
              }
              icon="lock"
              color="violet"
              onClick={() => onNavigate("admin_inbox", "")}
              sub={
                sourceErrors.order
                  ? "โหลดข้อมูลไม่สำเร็จ"
                  : "รายการที่ยังระงับการจ่ายเงิน"
              }
            />
          </div>
        </section>
      )}

      {Object.keys(sourceErrors).length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <span>โหลดข้อมูลบางส่วนไม่สำเร็จ กรุณาลองอีกครั้ง</span>
          <button
            type="button"
            className="font-bold underline"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            ลองใหม่
          </button>
        </div>
      )}

      <section
        className={styles.trendCard}
        aria-labelledby="safety-trend-title"
      >
        <div className={styles.trendHeader}>
          <div>
            <h3 id="safety-trend-title">แนวโน้มเคสใหม่</h3>
            <p>
              จำนวนเรื่องที่เข้ามาในแต่ละ
              {days === 1 ? "ชั่วโมงของวันนี้" : "วัน"} · หน่วย: เคส · เวลา UTC
            </p>
          </div>
          <div
            className={styles.filters}
            role="group"
            aria-label="ช่วงเวลากราฟเคสใหม่"
          >
            {[1, 7, 14, 30].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={days === value}
                onClick={() => setDays(value)}
              >
                {value === 1 ? "วันนี้" : value + " วัน"}
              </button>
            ))}
          </div>
        </div>
        <DailyVolume
          key={days}
          data={visibleTrend}
          hourly={days === 1}
          loading={loading}
          error={sourceErrors.support}
        />
        <p className={styles.scopeNote}>
          ตัวกรองช่วงเวลาใช้กับกราฟเคสใหม่
          ส่วนสรุปและสถานะด้านล่างแสดงข้อมูลปัจจุบันทั้งหมด
        </p>
      </section>
      <div className={styles.sectionHeading}>
        <h3>รายละเอียดสถานะงาน</h3>
        <span>ข้อมูลปัจจุบัน · ทุกช่วงเวลา</span>
      </div>
      <div className={styles.breakdowns}>
        <ChartCard title="เคสตามสถานะ" icon="schedule">
          <CategoryBars
            data={statusData}
            loading={loading}
            error={sourceErrors.support}
          />
        </ChartCard>
        <ChartCard title="เคสตามความสำคัญ" icon="priority_high">
          <CategoryBars
            data={[...priorityData].reverse()}
            loading={loading}
            error={sourceErrors.support}
          />
        </ChartCard>
        <ChartCard title="ข้อพิพาทตามสถานะ" icon="gavel">
          <CategoryBars
            data={disputeData}
            loading={!disputeData.length}
            error={sourceErrors.dispute}
          />
        </ChartCard>
      </div>
    </div>
  );
}

export default function DashboardSection(props) {
  return props.userRole === "CUSTOMER_SERVICE" ? (
    <AgentDashboard token={props.token} currentUserId={props.currentUserId} />
  ) : (
    <SafetyDashboardSection {...props} />
  );
}
