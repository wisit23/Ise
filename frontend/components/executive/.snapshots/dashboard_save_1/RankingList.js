import { CATEGORICAL } from "../charts/palette";

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

/**
 * Ranked "top N" list with a proportional bar. Rank number and value are
 * text, so the ordering never rests on bar length or color alone.
 */
export default function RankingList({ rows, emptyText, unavailable }) {
  if (unavailable) {
    return <p className="text-sm text-gray-500">ไม่พร้อมใช้งาน</p>;
  }
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>;
  }

  const max = Math.max(...rows.map((r) => r.gmv), 1);
  const total = rows.reduce((sum, r) => sum + (r.gmv || 0), 0) || 1;

  return (
    <ol className="flex flex-col gap-3 py-1">
      {rows.map((row, i) => {
        const pctOfMax = Math.max((row.gmv / max) * 100, 20);
        const sharePct = ((row.gmv / total) * 100).toFixed(0);

        return (
          <li key={row.id} className="flex items-center gap-3">
            {/* Left: Rank & Title */}
            <div className="flex items-center gap-1.5 w-28 sm:w-36 shrink-0 truncate">
              <span className="text-xs font-bold text-slate-400">{i + 1}</span>
              <span className="truncate text-xs font-semibold text-slate-800">
                {row.label}
              </span>
            </div>

            {/* Right: Horizontal Bar matching user screenshot */}
            <div className="relative flex-1 h-8 rounded-lg bg-slate-100 overflow-hidden flex items-center">
              <div
                className="h-full rounded-lg bg-[#3b82f6] flex items-center justify-between px-3 transition-all duration-500 shadow-2xs"
                style={{ width: `${pctOfMax}%` }}
              >
                <span className="text-xs font-bold text-white whitespace-nowrap">
                  {baht(row.gmv)}
                </span>
                <span className="text-[10px] font-medium text-blue-100 hidden sm:inline-flex items-center gap-1 ml-2 whitespace-nowrap">
                  <span>{row.count.toLocaleString("th-TH")} ชิ้น</span>
                  <span>{sharePct}%</span>
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
