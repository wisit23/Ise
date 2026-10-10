"use client";
import { useEffect, useId, useState } from "react";
import RadioSelect from "../../ui/RadioSelect";
import styles from "./workspace.module.css";

export default function CaseFilters({
  state,
  labels,
  priorities,
  onChange,
  searchSlot,
}) {
  const [open, setOpen] = useState(false);
  const [settled, setSettled] = useState(false);
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(() => setSettled(open), 230);
    return () => clearTimeout(timer);
  }, [open]);
  const count =
    Number(Boolean(state.status)) +
    Number(Boolean(state.priority)) +
    Number(Boolean(state.work));
  const groups = [
    [
      "work",
      "งานที่แสดง",
      [
        { value: "", label: "ทุกงาน" },
        { value: "open", label: "งานที่ยังไม่จบ" },
        { value: "overdue", label: "เกิน SLA" },
        { value: "soon", label: "ใกล้ครบ SLA" },
        { value: "reply", label: "รอฉันตอบ" },
      ],
    ],
    [
      "status",
      "สถานะ",
      [
        { value: "", label: "สถานะทั้งหมด" },
        ...Object.entries(labels)
          .filter(([key]) => key !== "ESCALATED")
          .map(([value, label]) => ({ value, label })),
      ],
    ],
    [
      "priority",
      "ความสำคัญ",
      [
        { value: "", label: "ความสำคัญทั้งหมด" },
        ...Object.entries(priorities).map(([value, label]) => ({
          value,
          label,
        })),
      ],
    ],
    [
      "sort",
      "เรียงเคส",
      [
        { value: "sla", label: "SLA ใกล้หมดก่อน" },
        { value: "newest", label: "ล่าสุดก่อน" },
        { value: "oldest", label: "เก่าสุดก่อน" },
        { value: "priority", label: "ความสำคัญสูงก่อน" },
      ],
    ],
  ];
  return (
    <div
      className={
        searchSlot
          ? "relative z-20 mb-4 rounded-xl border border-slate-200 bg-white p-3"
          : "relative z-20 border-b border-slate-100 bg-white"
      }
    >
      <div className={searchSlot ? "flex flex-wrap items-center gap-2" : ""}>
        {searchSlot}
        {searchSlot && (
          <RadioSelect
            ariaLabel="เรียงเคส"
            value={state.sort}
            options={groups[3][2]}
            onChange={(value) => onChange("sort", value)}
            hoverToOpen={false}
            size="sm"
            className="w-full sm:w-48"
            buttonClassName="!min-h-11 !rounded-lg !shadow-none"
          />
        )}

        {state.work && (
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
            {state.work === "reply"
              ? "รอฉันตอบ"
              : state.work === "overdue"
                ? "เกิน SLA"
                : state.work === "soon"
                  ? "ใกล้ครบ SLA"
                  : "งานที่ยังไม่จบ"}
          </span>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setSettled(false);
            setOpen(!open);
          }}
          className={`flex min-h-11 items-center gap-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600 ${searchSlot ? "rounded-lg border border-slate-200 px-3 text-slate-700 hover:bg-slate-50" : "w-full px-4 text-xs text-slate-600 hover:bg-slate-50"}`}
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[18px]"
          >
            tune
          </span>
          ตัวกรอง
          {count > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 text-emerald-800">
              {count}
            </span>
          )}
          <span
            className={
              searchSlot
                ? "hidden"
                : "ml-auto max-w-[55%] truncate font-normal text-slate-500"
            }
          >
            {groups[2][2].find((option) => option.value === state.sort)?.label}
          </span>
          <span
            aria-hidden="true"
            className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            expand_more
          </span>
        </button>
      </div>
      <div
        id={id}
        aria-hidden={!open}
        ref={(element) => {
          if (element) element.inert = !open;
        }}
        className={`${styles.filterReveal} ${open ? styles.filterOpen : ""}`}
        onTransitionEnd={() => setSettled(open)}
      >
        <div
          className={`min-h-0 ${settled && open ? "overflow-visible" : "overflow-hidden"}`}
        >
          <div
            className={`${styles.filterFields} ${searchSlot ? styles.filterFieldsToolbar : ""}`}
          >
            {groups
              .filter(([key]) => !searchSlot || key !== "sort")
              .map(([key, label, options]) => (
                <div key={key} className="min-w-0">
                  <p className="mb-1 text-[11px] text-slate-500">{label}</p>
                  <RadioSelect
                    ariaLabel={
                      key === "status"
                        ? "กรองสถานะ"
                        : key === "priority"
                          ? "กรองความสำคัญ"
                          : label
                    }
                    value={state[key]}
                    options={options}
                    onChange={(value) => onChange(key, value)}
                    hoverToOpen={false}
                    disabled={!open}
                    size="sm"
                    className="w-full"
                    buttonClassName="!min-h-11 !rounded-lg !shadow-none"
                  />
                </div>
              ))}
            {count > 0 && (
              <button
                type="button"
                onClick={() => onChange("resetFilters", "")}
                className="min-h-11 text-left text-xs text-emerald-700 underline"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
