"use client";

import Badge from "../../../panel/ui/Badge";
import QueueIcon from "./QueueIcon";
import motion from "../supportMotion.module.css";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
} from "../../../../lib/supportConstants";

export default function SupportQueueSidebar({
  tickets = [],
  selectedTicketId,
  onSelectTicket,
  scope,
  onScopeChange,
  search,
  onSearchChange,
  loading,
  error,
  onRefresh,
  className = "",
  toolbar,
  direction = 1,
}) {
  return (
    <aside
      className={`h-full min-h-0 w-full shrink-0 flex-col border-r border-slate-200 bg-white md:w-80 lg:w-[22rem] ${className}`}
    >
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 pb-4 pt-3">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            กล่องงาน
          </h2>
          {toolbar}
        </div>
        <div
          className="relative mt-2 flex border-b border-slate-200"
          role="group"
          aria-label="เลือกคิวงาน"
        >
          <span
            aria-hidden="true"
            className={motion.indicator}
            style={{
              transform: `translateX(${Math.max(0, ["mine", "unassigned", "all"].indexOf(scope)) * 100}%)`,
            }}
          />
          {[
            { value: "mine", label: "งานของฉัน" },
            { value: "unassigned", label: "รอรับเรื่อง" },
            { value: "all", label: "ทุกงาน" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onScopeChange(item.value)}
              aria-pressed={scope === item.value}
              className={`min-h-11 flex-1 border-b-2 px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${
                scope === item.value
                  ? "border-transparent font-semibold text-emerald-800"
                  : "border-transparent font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative mt-4">
          <QueueIcon
            name="search"
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาเลข Ticket หรือหัวข้อ"
            aria-label="ค้นหาตั๋ว"
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-11 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="ล้างคำค้นหา"
            >
              <QueueIcon name="close" />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between px-4 py-1 text-xs text-slate-600">
        <span role="status" aria-live="polite">
          {loading
            ? "กำลังโหลดคิวงาน…"
            : error
              ? "อัปเดตไม่สำเร็จ"
              : `แสดง ${tickets.length} รายการ`}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="รีเฟรชรายการ"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
          title="รีเฟรชรายการ"
        >
          <QueueIcon
            name="refresh"
            className={`h-4 w-4 ${loading ? "motion-safe:animate-spin" : ""}`}
          />
        </button>
      </div>

      {error && tickets.length > 0 && (
        <div
          role="alert"
          className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          อัปเดตคิวไม่สำเร็จ ขณะนี้แสดงข้อมูลเดิม
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="mt-1 block min-h-11 font-semibold underline disabled:opacity-50"
          >
            ลองใหม่
          </button>
        </div>
      )}

      <div
        key={`${scope}-${loading && tickets.length === 0 ? "loading" : "results"}`}
        style={{ "--queue-from": `${direction * 18}px` }}
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain divide-y divide-slate-100 ${motion.list}`}
        aria-label="รายการ Ticket"
        aria-busy={loading}
      >
        {error && tickets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <QueueIcon name="inbox" className="mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">
              โหลดคิวงานไม่สำเร็จ
            </p>
            <p className="mt-1 max-w-56 text-xs text-slate-500">{error}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-4 min-h-11 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ลองใหม่
            </button>
          </div>
        ) : loading && tickets.length === 0 ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="rounded-xl border border-slate-100 p-3 space-y-2"
              >
                <div className="flex justify-between">
                  <div className="h-3.5 w-20 bg-slate-200 rounded" />
                  <div className="h-3.5 w-14 bg-slate-200 rounded" />
                </div>
                <div className="h-4 w-3/4 bg-slate-200 rounded" />
                <div className="h-3 w-1/2 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-500">
              <QueueIcon name="inbox" className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {search.trim()
                ? "ไม่พบ Ticket ที่ค้นหา"
                : scope === "mine"
                  ? "ยังไม่มีงานในความดูแล"
                  : scope === "unassigned"
                    ? "ไม่มีงานรอรับเรื่อง"
                    : "ยังไม่มี Ticket"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {search.trim()
                ? "ลองใช้เลข Ticket หรือคำค้นที่สั้นลง"
                : scope === "mine"
                  ? "เลือกงานที่รอรับเรื่องเพื่อเริ่มดูแลลูกค้า"
                  : "รายการใหม่จะแสดงที่นี่เมื่อโหลดคิวอีกครั้ง"}
            </p>
            {search.trim() ? (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="mt-4 min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                ล้างคำค้นหา
              </button>
            ) : scope === "mine" ? (
              <button
                type="button"
                onClick={() => onScopeChange("unassigned")}
                className="mt-4 min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                ดูงานรอรับเรื่อง
              </button>
            ) : null}
          </div>
        ) : (
          tickets.map((t) => {
            const isSelected = selectedTicketId === t.id;
            const priorityStyle =
              PRIORITY_STYLE[t.priority] || "border-slate-200 text-slate-600";
            const statusStyle =
              TICKET_STATUS_STYLE[t.status] ||
              "border-slate-200 text-slate-600";

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTicket(t)}
                aria-current={isSelected ? "true" : undefined}
                className={`w-full min-h-[92px] text-left px-4 py-4 transition-colors flex flex-col gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
                  isSelected
                    ? "bg-emerald-50/80 border-l-4 border-l-emerald-600 pl-3"
                    : "hover:bg-slate-50/80 border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="truncate font-mono">{t.ticketNumber}</span>
                  <span className="shrink-0">
                    {t.createdAt && !Number.isNaN(Date.parse(t.createdAt))
                      ? new Date(t.createdAt).toLocaleDateString("th-TH", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
                <p className="line-clamp-2 break-words text-sm font-semibold leading-6 text-slate-900">
                  {t.subject || "ไม่ระบุหัวข้อ"}
                </p>
                <div className="mt-1 flex w-full flex-wrap items-center gap-1.5">
                  <Badge
                    text={TICKET_STATUS_LABEL[t.status] || t.status}
                    style={statusStyle}
                  />
                  {t.status !== "CLOSED" &&
                    t.priority &&
                    t.priority !== "NORMAL" && (
                      <Badge
                        text={PRIORITY_LABEL[t.priority] || t.priority}
                        style={priorityStyle}
                      />
                    )}
                  <span className="ml-auto text-xs text-slate-500">
                    {isSelected ? "กำลังเปิด" : ""}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
