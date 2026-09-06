"use client";

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

/**
 * Clean, compact Horizontal Bar Chart for 12 months of a single metric (e.g. GMV or Platform Revenue)
 * with direct in-bar labeling (ตัวเลขฝังในแท่งกราฟโดยตรง ดูเข้าใจง่ายใน 5 วินาที ไม่ต้องเอาเมาส์ชี้).
 */
export default function HorizontalTrendChart({
  data = [],
  color = "#3b82f6",
  formatValue,
  label,
}) {
  const fmt = formatValue || baht;
  const available = data.filter((d) => !d.unavailable);
  const max = Math.max(...available.map((d) => d.value || 0), 1);

  const summary = data
    .map(
      (d) =>
        `${d.label}: ${d.unavailable ? "ไม่พร้อมใช้งาน" : fmt(d.value || 0)}`,
    )
    .join(", ");

  return (
    <div
      role="img"
      aria-label={label ? `${label} — ${summary}` : summary}
      className="flex flex-col gap-1.5 py-1"
    >
      {data.map((d) => {
        const val = d.value || 0;
        const pct = Math.min((val / max) * 100, 100);

        return (
          <div
            key={d.label}
            className="flex items-center gap-2 group transition-colors hover:bg-slate-50/80 rounded px-1 py-0.5"
          >
            {/* Left: Month short label */}
            <span
              className="w-10 sm:w-12 shrink-0 text-right text-[11px] font-semibold text-slate-600 truncate"
              title={d.fullLabel || d.label}
            >
              {d.shortLabel || d.label}
            </span>

            {/* Right: Bar track */}
            <div className="relative flex-1 h-5 rounded-md bg-slate-100 overflow-hidden flex items-center">
              {d.unavailable ? (
                <span className="px-2 text-[10px] font-medium text-slate-400">
                  ไม่พร้อมใช้งาน
                </span>
              ) : val === 0 ? (
                <span className="px-2 text-[10px] font-medium text-slate-400">
                  ฿0
                </span>
              ) : (
                <div
                  className="h-full rounded-md flex items-center justify-end px-2 transition-all duration-500 shadow-2xs"
                  style={{
                    width: `${Math.max(pct, 18)}%`,
                    backgroundColor: color,
                  }}
                >
                  <span className="text-[10px] font-bold text-white whitespace-nowrap leading-none">
                    {fmt(val)}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
