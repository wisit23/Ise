"use client";

/* Pill-shaped option group whose highlight slides to the chosen item. Items
   share one width (the widest label), so the highlight is a simple
   translateX of one column. `tabs` renders ARIA tabs; otherwise toggle
   buttons with aria-pressed. */
export default function SegmentedControl({
  items,
  value,
  onChange,
  label,
  tabs = false,
  tone = "brand",
  className = "",
}) {
  const index = Math.max(
    0,
    items.findIndex(([key]) => key === value),
  );
  const brand = tone === "brand";
  return (
    <div
      role={tabs ? "tablist" : "group"}
      aria-label={label}
      className={`relative isolate inline-grid auto-cols-fr grid-flow-col rounded-full bg-slate-100 p-1 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-1 left-1 top-1 -z-10 rounded-full shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none ${brand ? "bg-emerald-600" : "bg-white"}`}
        style={{
          width: `calc((100% - 8px) / ${items.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {items.map(([key, text]) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            {...(tabs
              ? { role: "tab", "aria-selected": active }
              : { "aria-pressed": active })}
            onClick={() => onChange(key)}
            className={`relative whitespace-nowrap rounded-full px-2 py-1.5 text-center text-xs font-semibold transition-colors duration-200 sm:px-4 sm:text-sm ${
              active
                ? brand
                  ? "text-white"
                  : "text-emerald-700"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
