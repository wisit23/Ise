"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ROUND_GROUPS = [
  {
    id: "active",
    label: "เปิดอยู่",
    phases: ["submission", "waiting", "auction"],
  },
  { id: "upcoming", label: "ยังไม่เปิด", phases: ["upcoming"] },
  { id: "ended", label: "จบแล้ว", phases: ["ended"] },
  { id: "cancelled", label: "ยกเลิกรอบ", phases: ["cancelled"] },
];

function toggleValues(currentValues, values) {
  const current = new Set(currentValues);
  const allSelected = values.length > 0 && values.every((value) => current.has(value));
  values.forEach((value) => {
    if (allSelected) current.delete(value);
    else current.add(value);
  });
  return [...current];
}

function FilterPopover({ label, summary, align = "left", children }) {
  const [open, setOpen] = useState(false);
  const [verticalPlacement, setVerticalPlacement] = useState("bottom");
  const [panelMaxHeight, setPanelMaxHeight] = useState(480);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const updatePanelPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const edgeGap = 16;
      const panelGap = 8;
      const below = window.innerHeight - rect.bottom - edgeGap - panelGap;
      const above = rect.top - edgeGap - panelGap;
      const placeAbove = below < 280 && above > below;
      const available = placeAbove ? above : below;
      setVerticalPlacement(placeAbove ? "top" : "bottom");
      setPanelMaxHeight(Math.max(160, Math.min(480, Math.floor(available))));
    };
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    updatePanelPosition();
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium leading-4 text-slate-500">
            {label}
          </span>
          <span className="block truncate" title={summary}>
            {summary}
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 fill-current text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={`absolute z-50 w-[min(25rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ${verticalPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"} ${align === "right" ? "right-0" : "left-0"}`}
          style={{ maxHeight: `${panelMaxHeight}px` }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function CheckboxRow({ checked, label, onChange, muted = false }) {
  return (
    <label className="flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
      />
      <span
        className={`min-w-0 break-words leading-5 ${muted ? "font-medium text-slate-600" : "text-slate-700"}`}
        title={label}
      >
        {label}
      </span>
    </label>
  );
}

function isRoundInDateRange(round, fromDate, toDate) {
  const roundDate = new Date(round.auctionEndsAt);
  if (Number.isNaN(roundDate.getTime())) return false;
  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00`);
    if (roundDate < from) return false;
  }
  if (toDate) {
    const to = new Date(`${toDate}T23:59:59.999`);
    if (roundDate > to) return false;
  }
  return true;
}

function RoundFilter({ rounds, selectedIds, onChange }) {
  const [expandedGroup, setExpandedGroup] = useState("active");
  const [endedFrom, setEndedFrom] = useState("");
  const [endedTo, setEndedTo] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const groups = ROUND_GROUPS.map((group) => {
    let items = rounds.filter((round) => group.phases.includes(round.phase));
    if (group.id === "ended" && (endedFrom || endedTo)) {
      items = items.filter((round) => isRoundInDateRange(round, endedFrom, endedTo));
    }
    return { ...group, items };
  });

  return (
    <FilterPopover
      label="รอบประมูล"
      summary={selectedIds.length ? `เลือกแล้ว ${selectedIds.length} รอบ` : "ทุกรอบประมูล"}
    >
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <p className="text-xs font-medium text-slate-500">เลือกได้มากกว่าหนึ่งรอบ</p>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:text-slate-400"
          disabled={!selectedIds.length}
        >
          ล้างตัวกรอง
        </button>
      </div>
      <div className="space-y-2 pr-1">
        {groups.map((group) => {
          const groupIds = group.items.map((round) => round.id);
          const selectedCount = groupIds.filter((id) => selectedSet.has(id)).length;
          const expanded = expandedGroup === group.id;
          return (
            <section key={group.id} className="rounded-xl border border-slate-200">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedGroup(expanded ? "" : group.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <span className="font-semibold text-slate-800">{group.label}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {selectedCount ? `เลือก ${selectedCount}` : `${group.items.length} รอบ`}
                  <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
                </span>
              </button>
              {expanded && (
                <div className="border-t border-slate-100 p-2">
                  {group.id === "ended" && (
                    <div className="mb-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2">
                      <label className="text-[11px] font-medium text-slate-600">
                        ตั้งแต่วันที่
                        <input
                          type="date"
                          value={endedFrom}
                          max={endedTo || undefined}
                          onChange={(event) => setEndedFrom(event.target.value)}
                          className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-emerald-500"
                        />
                      </label>
                      <label className="text-[11px] font-medium text-slate-600">
                        ถึงวันที่
                        <input
                          type="date"
                          value={endedTo}
                          min={endedFrom || undefined}
                          onChange={(event) => setEndedTo(event.target.value)}
                          className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-emerald-500"
                        />
                      </label>
                    </div>
                  )}
                  {group.items.length ? (
                    <>
                      <CheckboxRow
                        muted
                        label={`ทั้งหมดในกลุ่ม ${group.label}`}
                        checked={groupIds.length > 0 && selectedCount === groupIds.length}
                        onChange={() => onChange(toggleValues(selectedIds, groupIds))}
                      />
                      <div className="border-t border-slate-100 pt-1">
                        {group.items.map((round) => (
                          <CheckboxRow
                            key={round.id}
                            label={round.title || "รอบประมูลไม่มีชื่อ"}
                            checked={selectedSet.has(round.id)}
                            onChange={() => onChange(toggleValues(selectedIds, [round.id]))}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="px-2 py-3 text-center text-xs text-slate-500">
                      ไม่พบรอบประมูลในกลุ่มนี้
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </FilterPopover>
  );
}

function StatusFilter({ options, selectedValues, onChange }) {
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  return (
    <FilterPopover
      label="สถานะรายการ"
      summary={selectedValues.length ? `เลือกแล้ว ${selectedValues.length} สถานะ` : "ทุกสถานะ"}
      align="right"
    >
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <p className="text-xs font-medium text-slate-500">เลือกได้มากกว่าหนึ่งสถานะ</p>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:text-slate-400"
          disabled={!selectedValues.length}
        >
          ล้างตัวกรอง
        </button>
      </div>
      <div>
        <CheckboxRow
          muted
          label="ทุกสถานะ"
          checked={!selectedValues.length}
          onChange={() => onChange([])}
        />
        <div className="border-t border-slate-100 pt-1">
          {options.map((option) => (
            <CheckboxRow
              key={option.value}
              label={option.label}
              checked={selectedSet.has(option.value)}
              onChange={() => onChange(toggleValues(selectedValues, [option.value]))}
            />
          ))}
        </div>
      </div>
    </FilterPopover>
  );
}

export default function AuctionItemFilters({
  rounds,
  selectedRoundIds,
  onRoundIdsChange,
  statusOptions,
  selectedStatuses,
  onStatusesChange,
  searchValue,
  onSearchChange,
  onSearchSubmit,
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(20rem,1.5fr)_minmax(12rem,0.75fr)_minmax(12rem,0.75fr)]">
      <form
        className="min-w-0 md:col-span-2 xl:col-span-1"
        onSubmit={(event) => {
          event.preventDefault();
          onSearchSubmit();
        }}
      >
        <div className="relative min-w-0">
          <label className="block min-w-0">
            <span className="sr-only">ค้นหาชื่อสินค้าหรือร้านค้า</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
            >
              <span className="material-symbols-outlined text-[20px] leading-none text-slate-400">
                search
              </span>
            </span>
            <input
              type="search"
              value={searchValue}
              maxLength={100}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="ค้นหาชื่อสินค้า หรือชื่อร้าน"
              className="block min-h-[42px] w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-14 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <button
            type="submit"
            aria-label="ค้นหา"
            title="ค้นหา"
            className="absolute inset-y-0 right-1.5 my-auto flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          >
            <span
              className="material-symbols-outlined text-[20px] leading-none"
              aria-hidden="true"
            >
              search
            </span>
          </button>
        </div>
      </form>
      <RoundFilter
        rounds={rounds}
        selectedIds={selectedRoundIds}
        onChange={onRoundIdsChange}
      />
      <StatusFilter
        options={statusOptions}
        selectedValues={selectedStatuses}
        onChange={onStatusesChange}
      />
    </div>
  );
}

export { ROUND_GROUPS, isRoundInDateRange, toggleValues };
