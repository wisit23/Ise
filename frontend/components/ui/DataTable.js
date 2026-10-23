"use client";

import Skeleton from "./Skeleton";

/* The back office had five hand-written tables, each repeating its own
   overflow wrapper, header styling, loading row and empty row. Columns are
   described as data here:
     { key, header, align, className, render(row) }
   `render` is optional — without it the raw value at `key` is printed. */
export default function DataTable({
  columns,
  rows = [],
  loading = false,
  empty,
  onRowClick,
  rowKey = (row) => row.id,
  minWidth = "min-w-[750px]",
  className = "",
  // Fixed layout keeps column widths stable regardless of row content.
  fixed = false,
}) {
  const align = (a) =>
    a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";

  return (
    <div
      className={`overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] ${className}`}
    >
      <table className={`w-full ${minWidth} border-collapse text-sm ${fixed ? "table-fixed" : ""}`}>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500 [&>th:first-child]:pl-5 [&>th:last-child]:pr-5">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`whitespace-nowrap px-3 py-3 align-middle ${align(c.align)} ${c.headerClassName || ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton.Row key={`sk-${i}`} columns={columns.length} />
            ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-5 py-10">
                {empty ?? (
                  <p className="text-center text-sm font-medium text-slate-500">
                    ไม่พบข้อมูล
                  </p>
                )}
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`group transition-all duration-200 [&>td:first-child]:pl-5 [&>td:last-child]:pr-5 ${
                  onRowClick
                    ? "cursor-pointer hover:bg-slate-50/80"
                    : ""
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-3.5 align-middle ${align(c.align)} ${c.className || ""}`}
                  >
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
