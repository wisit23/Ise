/** KPI tile for the executive dashboard. Shows "ไม่พร้อมใช้งาน" instead of a
 * fake zero when its owner service didn't respond (see CEO-DEC-003 — never
 * mask a provider outage as an empty/zero metric). */
export default function MetricCard({
  label,
  value,
  unavailable,
  deltaPct,
  formatValue,
}) {
  const fmt = formatValue || ((v) => v.toLocaleString("th-TH"));

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {unavailable ? (
        <p className="mt-2 text-sm font-medium text-slate-400">ไม่พร้อมใช้งาน</p>
      ) : (
        <>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {fmt(value)}
          </p>
          {deltaPct !== null && deltaPct !== undefined && (
            <p
              className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${
                deltaPct >= 0 ? "text-[#006300]" : "text-red-600"
              }`}
            >
              <span>{deltaPct >= 0 ? "▲" : "▼"}</span>
              <span>{Math.abs(deltaPct)}%</span>{" "}
              <span className="font-normal text-slate-500">เทียบเดือนก่อน</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
