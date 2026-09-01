export default function KpiCard({
  label,
  value,
  sub,
  icon,
  color = "gray",
  onClick,
}) {
  const colors = {
    gray: "text-slate-500 bg-slate-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-500 bg-amber-50",
    red: "text-red-500 bg-red-50",
    sky: "text-sky-500 bg-sky-50",
    indigo: "text-indigo-500 bg-indigo-50",
    violet: "text-violet-500 bg-violet-50",
  };
  return (
    <div
      onClick={onClick}
      className={`group rounded-xl border border-slate-200/60 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] hover:-translate-y-1 hover:shadow-[0_8px_20px_-6px_rgba(6,81,237,0.12)] transition-all duration-300 ease-out ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 group-hover:text-emerald-600 transition-colors cursor-default mb-1">
            {label}
          </p>
          <p className="text-3xl font-bold tracking-tight text-slate-900">
            {value ?? "…"}
          </p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colors[color]}`}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      {sub && (
        <p className="mt-3 text-[13px] font-semibold text-slate-500">{sub}</p>
      )}
    </div>
  );
}
