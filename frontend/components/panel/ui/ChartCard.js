export default function ChartCard({ title, icon, children, actions }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] transition-shadow hover:shadow-[0_8px_20px_-6px_rgba(6,81,237,0.08)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span className="material-symbols-outlined text-[18px] text-emerald-600">
            {icon}
          </span>
          {title}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
