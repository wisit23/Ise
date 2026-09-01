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
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      {unavailable ? (
        <p className="mt-1 text-sm font-medium text-gray-500">ไม่พร้อมใช้งาน</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {fmt(value)}
          </p>
          {deltaPct !== null && deltaPct !== undefined && (
            <p
              className={`mt-1 text-xs font-medium ${
                deltaPct >= 0 ? "text-[#006300]" : "text-red-600"
              }`}
            >
              {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}%{" "}
              <span className="font-normal text-gray-500">เทียบช่วงก่อน</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
