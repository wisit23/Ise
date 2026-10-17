/**
 * The overview's period choices as a row of buttons, one always selected.
 * Radio semantics: the group has one value and each button says whether it is
 * the chosen one, so a screen reader hears "7 วันล่าสุด, selected, 1 of 4".
 */
export default function PeriodTabs({ options, value, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="ช่วงเวลา"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200/70 bg-white p-1 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${
              selected
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
