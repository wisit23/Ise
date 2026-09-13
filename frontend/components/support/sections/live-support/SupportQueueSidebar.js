"use client";

import Badge from "../../../panel/ui/Badge";
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
}) {
  return (
    <aside className={`h-full w-full shrink-0 flex-col border-r border-slate-200 bg-white md:w-80 lg:w-[22rem] ${className}`}>
      {/* ── Top Tabs / Filter ── */}
      <div className="border-b border-slate-200 p-3 bg-slate-50/70">
        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold" role="tablist" aria-label="เลือกคิวงาน">
          <button
            type="button"
            onClick={() => onScopeChange("mine")}
            role="tab"
            aria-selected={scope === "mine"}
            className={`flex-1 rounded-md py-1.5 text-center transition-all ${
              scope === "mine"
                ? "bg-white text-emerald-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            งานของฉัน
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("unassigned")}
            role="tab"
            aria-selected={scope === "unassigned"}
            className={`flex-1 rounded-md py-1.5 text-center transition-all ${
              scope === "unassigned"
                ? "bg-white text-amber-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            รอรับเรื่อง
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("all")}
            role="tab"
            aria-selected={scope === "all"}
            className={`flex-1 rounded-md py-1.5 text-center transition-all ${
              scope === "all"
                ? "bg-white text-slate-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ทั้งหมด
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mt-2.5">
          <span className="material-symbols-outlined absolute left-2.5 top-2 text-[18px] text-slate-400">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาเลขตั๋ว, หัวข้อ..."
            aria-label="ค้นหาตั๋ว"
            className="min-h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="ล้างคำค้นหา"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Queue Counter & Refresh ── */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500 bg-white">
        <span>
          พบ <strong className="text-slate-800">{tickets.length}</strong> รายการ
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          title="รีเฟรชรายการ"
        >
          <span
            className={`material-symbols-outlined text-[15px] ${
              loading ? "animate-spin" : ""
            }`}
          >
            refresh
          </span>
          <span>รีเฟรช</span>
        </button>
      </div>

      {/* ── Tickets List ── */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {error && tickets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <span className="material-symbols-outlined mb-2 text-[34px] text-red-300">cloud_off</span>
            <p className="text-sm font-semibold text-slate-700">โหลดคิวงานไม่สำเร็จ</p>
            <p className="mt-1 max-w-56 text-xs text-slate-500">{error}</p>
            <button type="button" onClick={onRefresh} className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              ลองใหม่
            </button>
          </div>
        ) : loading && tickets.length === 0 ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="rounded-xl border border-slate-100 p-3 space-y-2">
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
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <span className="material-symbols-outlined text-[36px] mb-2 text-slate-300">
              inbox
            </span>
            <p className="text-xs font-semibold text-slate-600">ไม่มีตั๋วในคิวนี้</p>
            <p className="mt-0.5 text-[11px]">
              {scope === "mine"
                ? "คุณยังไม่มีงานที่รับไว้ ลองเลือก 'รอรับเรื่อง'"
                : "ไม่มีรายการที่ตรงกับเงื่อนไข"}
            </p>
          </div>
        ) : (
          tickets.map((t) => {
            const isSelected = selectedTicketId === t.id;
            const priorityStyle =
              PRIORITY_STYLE[t.priority] || "border-slate-200 text-slate-600";
            const statusStyle =
              TICKET_STATUS_STYLE[t.status] || "border-slate-200 text-slate-600";

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTicket(t)}
                aria-current={isSelected ? "true" : undefined}
                className={`w-full min-h-[92px] text-left p-3.5 transition-all flex flex-col gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
                  isSelected
                    ? "bg-emerald-50/80 border-l-4 border-l-emerald-600 pl-2.5 shadow-2xs"
                    : "hover:bg-slate-50/80 border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {t.ticketNumber}
                  </span>
                  <div className="flex items-center gap-1">
                    {t.priority && t.priority !== "NORMAL" && (
                      <Badge
                        text={PRIORITY_LABEL[t.priority] || t.priority}
                        style={priorityStyle}
                      />
                    )}
                    <Badge
                      text={TICKET_STATUS_LABEL[t.status] || t.status}
                      style={statusStyle}
                    />
                  </div>
                </div>

                <p className="text-xs font-semibold text-slate-800 line-clamp-1">
                  {t.subject}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                  <span className="truncate max-w-[140px] font-mono">
                    #{t.requesterId?.slice(0, 10)}
                  </span>
                  <span>
                    {new Date(t.createdAt).toLocaleDateString("th-TH", {
                      month: "short",
                      day: "numeric",
                    })}
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
