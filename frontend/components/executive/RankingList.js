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
    return <p className="text-sm text-gray-400">ไม่พร้อมใช้งาน</p>;
  }
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-gray-400">{emptyText}</p>;
  }

  const max = Math.max(...rows.map((r) => r.gmv), 1);

  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <li key={row.id} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-right text-sm font-semibold text-gray-400">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-gray-800">
                {row.label}
              </span>
              <span className="shrink-0 text-sm font-semibold text-gray-900">
                {baht(row.gmv)}
                <span className="ml-1.5 font-normal text-gray-400">
                  · {row.count.toLocaleString("th-TH")} ชิ้น
                </span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((row.gmv / max) * 100, 3)}%`,
                  backgroundColor: CATEGORICAL[i % CATEGORICAL.length],
                }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
