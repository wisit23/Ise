"use client";
import CaseWorkspace from "../workspace/CaseWorkspace";
export function TicketViewControl({ value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="มุมมองตั๋ว"
      className="relative flex h-10 w-[184px] shrink-0 rounded-xl bg-slate-100 p-1"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${
          value === "table" ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {[
        { value: "workspace", label: "สนทนา", icon: "forum" },
        { value: "table", label: "ตาราง", icon: "table_rows" },
      ].map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              selected
                ? "text-emerald-700"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span
              className="material-symbols-outlined text-[16px] leading-none"
              aria-hidden="true"
            >
              {option.icon}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function TicketsSection(props) {
  return <CaseWorkspace {...props} domain="tickets" />;
}
