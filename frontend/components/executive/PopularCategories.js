import { baht, categoryName, formatCount } from "../../lib/executive";
// One template for the header and every row keeps the columns aligned: a wide
// name column, then three equal columns whose figures sit under their headings.
const GRID =
  "grid grid-cols-[1.5rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-baseline gap-x-3";

/**
 * The most popular categories: how many pieces each sold, its share of all
 * pieces sold, and what buyers paid for them.
 * `total` is everything sold, so a share is of all sales and not of the ranked
 * rows. `rows` is null when the product service did not answer, shown as
 * unavailable rather than as an empty list (CEO-DEC-003).
 */
export default function PopularCategories({ rows, total, emptyText }) {
  if (!rows) {
    return <p className="text-sm text-slate-500">ไม่พร้อมใช้งาน</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }

  const whole =
    typeof total?.count === "number" && total.count > 0
      ? total.count
      : rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="text-sm">
      <div
        className={`${GRID} border-b border-slate-100 pb-2 text-xs text-slate-500`}
      >
        <span>#</span>
        <span>ประเภทสินค้า</span>
        <span className="text-center">ขายแล้ว</span>
        <span className="text-center">สัดส่วน</span>
        <span className="text-center">ราคาขายรวม</span>
      </div>
      <ol className="divide-y divide-slate-100">
        {rows.map((row, i) => (
          <li key={row.id} className={`${GRID} py-3 text-slate-900`}>
            <span className="text-xs text-slate-400">{i + 1}</span>
            <span className="min-w-0 truncate font-medium">
              {categoryName(row)}
            </span>
            <span className="text-center font-semibold">
              {formatCount(row.count)} ชิ้น
            </span>
            <span className="text-center">
              {Math.round((row.count / whole) * 100)}%
            </span>
            <span className="text-center font-semibold">{baht(row.gmv)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
