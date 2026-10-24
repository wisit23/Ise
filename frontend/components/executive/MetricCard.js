import { formatCount } from "../../lib/executive";

/** KPI tile for the executive dashboard. Shows "ไม่พร้อมใช้งาน" instead of a
 * fake zero when its owner service didn't respond (see CEO-DEC-003 — never
 * mask a provider outage as an empty/zero metric).
 *
 * The comparison line reads "▲ +12% <deltaLabel>": green for growth, red for a
 * drop, grey for no change. A percentage from a zero baseline is undefined
 * (200 after 0 is +200 units, not +200%), so `noBaseline` shows the amount
 * gained instead, e.g. "▲ +฿450 · …ไม่มียอด". */
export default function MetricCard({
  label,
  value,
  unavailable,
  deltaPct,
  deltaLabel = "เทียบกับช่วงก่อนหน้า",
  baselineName = "ช่วงก่อนหน้า",
  noBaseline = false,
  hint,
  formatValue,
}) {
  const fmt = formatValue || formatCount;

  // What the line says: `change` is the bold figure, `note` the context.
  let change = null;
  let note = null;
  let direction = 0;
  if (deltaPct !== null && deltaPct !== undefined) {
    direction = Math.sign(deltaPct);
    change = `${deltaPct > 0 ? "+" : ""}${deltaPct}%`;
    note = deltaLabel;
  } else if (noBaseline && value > 0) {
    direction = 1;
    change = `+${fmt(value)}`;
    note = `${baselineName}ไม่มียอด`;
  } else if (noBaseline) {
    note = "ไม่มียอดทั้งสองช่วง";
  }

  const tone =
    direction > 0
      ? "text-[#006300]"
      : direction < 0
        ? "text-red-600"
        : "text-slate-500";
  const arrow = direction > 0 ? "▲" : direction < 0 ? "▼" : null;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition-shadow hover:shadow-md">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
      {unavailable ? (
        <p className="mt-2 text-sm font-medium text-slate-400">
          ไม่พร้อมใช้งาน
        </p>
      ) : (
        <>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {fmt(value)}
          </p>
          {note && (
            <p className="mt-1.5 text-xs">
              {change && (
                <span
                  data-testid="delta"
                  className={`flex items-center gap-1 font-semibold ${tone}`}
                >
                  {arrow && <span aria-hidden="true">{arrow}</span>}
                  <span>{change}</span>
                </span>
              )}
              <span className="block text-[11px] leading-snug text-slate-500">
                {note}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
