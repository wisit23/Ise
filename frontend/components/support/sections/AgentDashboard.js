"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { PRIORITY_LABEL } from "../../../lib/supportConstants";
import { ComparisonChart, ChartLegend } from "./AgentDashboardCharts";
import styles from "./AgentOverview.module.css";
import { navigateWorkspaceSection } from "../workspace/useCaseWorkspace";

import PersonalPriorityDonut from "./PersonalPriorityDonut";

import RadioSelect from "../../ui/RadioSelect";
import defaults from "../../../lib/customerServiceConfig";
import useCustomerServiceConfig from "../hooks/useCustomerServiceConfig";

const SOURCES = [
  {
    key: "tickets",
    label: "Ticket",
    base: "/api/support/tickets",
  },
  {
    key: "disputes",
    label: "Dispute",
    base: "/api/orders/disputes",
  },
];
const CARDS = [
  {
    key: "mine_overdue",
    label: "งานของฉันเกินกำหนด",
    hint: "ยังไม่จบและเลยกำหนด",
    icon: "schedule",
    countKey: "overdue",
  },

  {
    key: "mine_reply",
    label: "งานที่รอฉันตอบ",
    icon: "chat",
    countKey: "reply",
  },
  {
    key: "unassigned",
    label: "งานที่ยังไม่มีคนรับ",
    hint: "ยังไม่มีเจ้าหน้าที่รับ",
    icon: "move_to_inbox",
  },
];
const fmt = (value) =>
  value === null ? "—" : Number(value).toLocaleString("th-TH");
const WORKFLOW = [
  { code: "ACCEPTED", label: "รับเรื่องแล้ว" },
  { code: "WAITING_INFO", label: "รอข้อมูลเพิ่ม" },
];
const time = (value, timeZone = defaults.dashboard.timeZone) =>
  new Date(value).toLocaleString("th-TH", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function validDashboard(payload) {
  const count = (value) => Number.isInteger(value) && value >= 0;
  const date = (value) =>
    typeof value === "string" && Number.isFinite(Date.parse(value));
  const distribution = (rows) =>
    Array.isArray(rows) &&
    rows.every((row) => typeof row.label === "string" && count(row.value));
  return (
    payload &&
    date(payload.asOf) &&
    count(payload.total) &&
    ["all", "mine", "unassigned", "overdue", "soon"].every((key) =>
      count(payload.counts?.[key]),
    ) &&
    ["statuses", "priorities", "aging"].every((key) =>
      distribution(payload[key]),
    ) &&
    distribution(payload.workflow) &&
    payload.workflow.length === 3 &&
    WORKFLOW.every(
      (stage) =>
        payload.workflow.filter((row) => row.label === stage.code).length === 1,
    ) &&
    payload.workflow.reduce((sum, row) => sum + row.value, 0) ===
      payload.counts.all &&
    payload.personal &&
    ["all", "overdue", "soon", "waiting"].every((key) =>
      count(payload.personal.counts?.[key]),
    ) &&
    payload.personal.counts.all === payload.counts.mine &&
    (payload.personal.awaitingReply === null ||
      (count(payload.personal.awaitingReply) &&
        payload.personal.awaitingReply <= payload.personal.counts.all)) &&
    count(payload.personal.withoutDeadline) &&
    payload.personal.counts.overdue +
      payload.personal.counts.soon +
      payload.personal.withoutDeadline <=
      payload.personal.counts.all &&
    distribution(payload.personal.priorities) &&
    payload.personal.priorities.every((row) =>
      [...Object.keys(PRIORITY_LABEL), "CRITICAL"].includes(row.label),
    ) &&
    payload.personal.priorities.reduce((sum, row) => sum + row.value, 0) ===
      payload.personal.counts.all &&
    distribution(payload.personal.workflow) &&
    payload.personal.workflow.length === WORKFLOW.length &&
    WORKFLOW.every(
      (stage) =>
        payload.personal.workflow.filter((row) => row.label === stage.code)
          .length === 1,
    ) &&
    payload.personal.workflow.reduce((sum, row) => sum + row.value, 0) ===
      payload.personal.counts.all &&
    distribution(payload.personal.aging) &&
    payload.personal.aging.length === payload.aging.length &&
    payload.personal.aging.reduce((sum, row) => sum + row.value, 0) ===
      payload.personal.counts.all &&
    Array.isArray(payload.trend) &&
    payload.trend.every(
      (row) => date(row.date) && count(row.received) && count(row.completed),
    ) &&
    Array.isArray(payload.items) &&
    payload.items.every(
      (row) =>
        typeof row.id === "string" &&
        typeof row.reference === "string" &&
        typeof row.subject === "string" &&
        date(row.createdAt) &&
        (!row.dueAt || date(row.dueAt)),
    )
  );
}
function MetricIcon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "schedule" ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3.5 2" />
        </>
      ) : name === "chat" ? (
        <>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M7 7h10M7 11h7" />
        </>
      ) : (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
          <path d="M12 7v7m-3-3 3 3 3-3M7 17h10" />
        </>
      )}
    </svg>
  );
}
function Panel({ title, children, className = "", action }) {
  return (
    <section
      className={`${styles.widget} rounded-xl border border-slate-200 bg-white p-4 ${className}`}
    >
      <div className={styles.widgetHeader}>
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AgentDashboard({ token, currentUserId }) {
  const config = useCustomerServiceConfig();
  const [days, setDays] = useState(defaults.dashboard.defaultDays);
  const focus = "mine";
  const priority = "";
  const [destination, setDestination] = useState(null);
  const destinationRef = useRef(null);
  useEffect(() => {
    if (destination && destinationRef.current) {
      if (destinationRef.current.showModal) destinationRef.current.showModal();
      else destinationRef.current.setAttribute("open", "");
    }
  }, [destination]);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState({ tickets: true, disputes: true });
  const query = `${days}:${focus}:${priority}`;
  const data =
    snapshot?.account === currentUserId && snapshot?.token === token
      ? snapshot.data
      : null;
  const displayDays = snapshot?.days ?? days;
  useEffect(() => {
    let alive = true,
      inFlight = false,
      controller,
      timeout;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      setLoading(true);
      timeout = setTimeout(
        () => controller.abort(),
        config.timing.requestTimeoutMs,
      );
      try {
        const responses = await Promise.all(
          SOURCES.map(async (source) => {
            try {
              const payload = await apiFetch(
                `${source.base}/agent-dashboard?focus=${focus}&page=1&days=${days}${priority ? `&priority=${priority}` : ""}`,
                { token, signal: controller.signal },
              );
              if (!validDashboard(payload))
                throw new Error("Invalid dashboard response");
              return payload;
            } catch (err) {
              throw new Error(
                `โหลด ${source.label} ไม่สำเร็จ${err.name === "AbortError" ? " (หมดเวลารอ)" : ""}`,
              );
            }
          }),
        );
        if (alive) {
          setSnapshot({
            query,
            account: currentUserId,
            token,
            days,
            data: Object.fromEntries(
              SOURCES.map((source, i) => [source.key, responses[i]]),
            ),
          });
          setError("");
        }
      } catch (err) {
        controller.abort();
        if (alive) setError(err.message);
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (alive) setLoading(false);
      }
    }
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, config.timing.dashboardRefreshMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      clearTimeout(timeout);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    token,
    currentUserId,
    days,
    focus,
    priority,
    query,
    revision,
    config.timing.requestTimeoutMs,
    config.timing.dashboardRefreshMs,
  ]);
  const cardCount = (domain, card) =>
    card.key === "mine_reply"
      ? (data[domain].personal.awaitingReply ?? null)
      : card.key === "unassigned"
        ? data[domain].counts.unassigned
        : data[domain].personal.counts[card.countKey];
  const sumCard = (card) =>
    [cardCount("tickets", card), cardCount("disputes", card)].some(
      (value) => value === null,
    )
      ? null
      : cardCount("tickets", card) + cardCount("disputes", card);
  function goToTable(domain, selection) {
    navigateWorkspaceSection(domain, currentUserId, "", {
      view: "table",
      scope: selection.key === "unassigned" ? "unassigned" : "mine",
      work:
        selection.key === "mine_reply"
          ? "reply"
          : selection.key === "mine_overdue"
            ? "overdue"
            : selection.key === "mine_soon"
              ? "soon"
              : "open",
      priority: selection.priority || "",
      search: "",
      sort: "sla",
      page: 1,
      selectedId: null,
    });
  }
  function visit(key, selectedPriority = "") {
    const selection = { key, priority: selectedPriority };
    const counts = SOURCES.map((source) => ({
      ...source,
      value:
        key === "mine_reply"
          ? (data[source.key].personal.awaitingReply ?? 0)
          : key === "unassigned"
            ? data[source.key].counts.unassigned
            : selectedPriority
              ? data[source.key].personal.priorities
                  .filter((row) => row.label === selectedPriority)
                  .reduce((sum, row) => sum + row.value, 0)
              : data[source.key].personal.counts[
                  key === "mine_overdue"
                    ? "overdue"
                    : key === "mine_soon"
                      ? "soon"
                      : "all"
                ],
    }));
    const available = counts.filter((source) => source.value > 0);
    if (available.length === 1) goToTable(available[0].key, selection);
    else setDestination({ ...selection, sources: counts });
  }
  const trend = data
    ? (data.tickets.trend || []).map((row) => ({
        label: row.date,
        tickets: row.received,
        disputes:
          (data.disputes.trend || []).find((other) => other.date === row.date)
            ?.received ?? 0,
      }))
    : [];
  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CUSTOMER SERVICE / OVERVIEW</p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            งานของฉัน
          </h1>
        </div>
        <div className={`${styles.toolbar} flex items-center gap-2`}>
          <button
            type="button"
            title={
              data
                ? `Ticket: ${time(data.tickets.asOf, config.dashboard.timeZone)} · Dispute: ${time(data.disputes.asOf, config.dashboard.timeZone)}`
                : undefined
            }
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:opacity-50"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              refresh
            </span>
            อัปเดตข้อมูล
          </button>
        </div>
      </div>
      {destination && (
        <dialog
          ref={destinationRef}
          onCancel={() => setDestination(null)}
          className={styles.destinationDialog}
          aria-labelledby="dashboard-destination-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") setDestination(null);
          }}
        >
          <h2 id="dashboard-destination-title">เลือกประเภทเคสที่จะดู</h2>
          <p>
            เปิดหน้าตารางพร้อมตัวกรอง
            {destination.priority
              ? "ความสำคัญ " + (PRIORITY_LABEL[destination.priority] || "วิกฤต")
              : destination.key === "mine_overdue"
                ? "งานของฉันเกินกำหนด"
                : destination.key === "mine_soon"
                  ? "งานใกล้ครบกำหนด"
                  : "งานที่เลือก"}
          </p>
          <div>
            {destination.sources.map((source) => (
              <button
                key={source.key}
                type="button"
                autoFocus={source.key === "tickets"}
                onClick={() => goToTable(source.key, destination)}
              >
                {source.label} · {fmt(source.value)} เคส →
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setDestination(null)}>
            ยกเลิก
          </button>
        </dialog>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          {error} ·{" "}
          {data ? "แสดงข้อมูลเดิม ณ เวลาที่ระบุ" : "ยังแสดงยอดรวมไม่ได้"}{" "}
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
            className="min-h-11 px-2 underline"
          >
            ลองใหม่
          </button>
        </div>
      )}
      {!data ? (
        <div className={styles.placeholder} role="status">
          <span className={loading ? "sr-only" : ""}>
            {loading
              ? "กำลังสรุป Ticket และ Dispute…"
              : "ไม่สามารถแสดงยอดได้ในขณะนี้"}
          </span>
          {loading && (
            <div aria-hidden="true" className={styles.skeleton}>
              <div className={styles.skeletonMetrics}>
                {[0, 1, 2].map((i) => (
                  <div key={i} />
                ))}
              </div>
              <div className={styles.skeletonChart} />
              <div className={styles.skeletonChart} />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={styles.metrics}>
            {CARDS.map((card) => (
              <button
                type="button"
                key={card.key}
                disabled={sumCard(card) === null}
                title={
                  sumCard(card) === null
                    ? "ยังโหลดข้อความที่รอตอบไม่ได้ กดอัปเดตข้อมูลเพื่อลองใหม่"
                    : undefined
                }
                onClick={() => visit(card.key)}
                className={`${styles.metric} ${card.key === "mine_reply" ? styles.replyCard : card.key === "mine_overdue" && sumCard(card) > 0 ? styles.attentionCard : ""}`}
              >
                <div className={styles.metricHeading}>
                  <span>{card.label}</span>
                  <span aria-hidden="true" className={styles.metricIcon}>
                    <MetricIcon name={card.icon} />
                  </span>
                </div>
                <p
                  className={`${styles.metricValue} ${card.key === "mine_overdue" && sumCard(card) > 0 ? styles.overdue : card.key === "mine_soon" && sumCard(card) > 0 ? styles.soon : ""}`}
                >
                  {fmt(sumCard(card))}
                  <span> เคส</span>
                </p>
                <div className={styles.metricFooter}>
                  <p className={styles.metricSources}>
                    <span className={styles.ticketSource}>
                      Ticket {fmt(cardCount("tickets", card))}
                    </span>{" "}
                    <span className={styles.disputeSource}>
                      Dispute {fmt(cardCount("disputes", card))}
                    </span>
                  </p>

                  <span className={styles.cardArrow} aria-hidden="true">
                    ↗
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className={`${styles.chartRow} ${styles.personalCharts}`}>
            <Panel
              title={`รับงานรายวัน · ${displayDays} วัน`}
              className={styles.trendPanel}
              action={
                <div className="inline-flex items-center gap-2 text-sm">
                  <RadioSelect
                    id="dashboard-days"
                    ariaLabel="ช่วงย้อนหลัง"
                    value={days}
                    options={config.dashboard.dayRanges.map((value) => ({
                      value,
                      label: value + " วัน",
                    }))}
                    onChange={(value) => setDays(Number(value))}
                    hoverToOpen={false}
                    size="sm"
                    align="right"
                    className="w-28"
                    buttonClassName="!min-h-11 !rounded-lg !px-3 !text-sm"
                  />
                </div>
              }
            >
              <ChartLegend
                rows={trend}
                visible={visible}
                onToggle={(key) =>
                  setVisible((value) => ({ ...value, [key]: !value[key] }))
                }
              />
              <ComparisonChart
                rows={trend}
                kind="line"
                hideLegend
                visible={visible}
              />
            </Panel>
            <Panel title="ความสำคัญของงานฉัน" className={styles.priorityPanel}>
              <PersonalPriorityDonut
                rows={SOURCES.flatMap(
                  (source) => data[source.key].personal.priorities,
                )}
                onSelect={(code) => visit("mine", code)}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
