"use client";

import Pagination from "../../../Pagination";
import Badge from "../../../panel/ui/Badge";
import DropdownFilter from "../../../panel/ui/DropdownFilter";
import DataTable from "../../../ui/DataTable";
import EmptyState from "../../../ui/EmptyState";
import Input from "../../../ui/Input";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
} from "../../../../lib/supportConstants";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "รอดำเนินการ (OPEN)" },
  { value: "ACTIONED", label: "จัดการแล้ว (ACTIONED)" },
  { value: "DISMISSED", label: "ยกเลิกแล้ว (DISMISSED)" },
  { value: "", label: "ทั้งหมด (ALL)" },
];

/* The queue view: search, status filter, the case table and its pager.
   Presentational only — every piece of state lives in AdminInboxSection. */
export default function AdminInboxTable({
  items,
  loading,
  qInput,
  onQInputChange,
  onSearch,
  statusFilter,
  onStatusFilterChange,
  page,
  totalPages,
  onPageChange,
  onSelectTicket,
}) {
  const columns = [
    {
      key: "ticketNumber",
      header: "Ticket ID",
      className:
        "font-mono text-[13px] font-semibold tracking-tight text-slate-500",
    },
    {
      key: "requesterId",
      header: "รหัสลูกค้า (ID)",
      className: "text-sm font-medium text-slate-700",
      render: (t) => t.requesterId?.slice(0, 12) ?? "—",
    },
    {
      key: "subject",
      header: "หัวข้อปัญหา",
      className:
        "max-w-[200px] truncate text-sm font-medium text-slate-900 transition-colors group-hover:text-emerald-700",
    },
    {
      key: "priority",
      header: "ความสำคัญ",
      align: "center",
      render: (t) =>
        // A report is always treated as the most urgent thing in the queue,
        // regardless of the priority field it was mapped from.
        t._type === "REPORT" ? (
          <Badge
            text="ด่วนที่สุด (CRITICAL)"
            style="bg-red-100 text-red-700 border border-red-200"
          />
        ) : (
          <Badge
            text={PRIORITY_LABEL[t.priority] || t.priority}
            style={PRIORITY_STYLE[t.priority] || "bg-gray-100 text-gray-600"}
          />
        ),
    },
    {
      key: "status",
      header: "สถานะ",
      align: "center",
      render: (t) => (
        <Badge
          text={TICKET_STATUS_LABEL[t.status] || t.status}
          style={TICKET_STATUS_STYLE[t.status] || "bg-slate-100 text-slate-600"}
        />
      ),
    },
    {
      key: "assigneeId",
      header: "ผู้รับผิดชอบ",
      align: "center",
      className: "text-xs font-medium text-slate-500",
      render: (t) =>
        t.assigneeId ? (
          t.assigneeId.slice(0, 12)
        ) : (
          <span className="text-slate-500">—</span>
        ),
    },
    {
      key: "createdAt",
      header: "จัดการ",
      align: "center",
      className: "text-xs font-medium text-slate-500",
      render: (t) => new Date(t.createdAt).toLocaleDateString("th-TH"),
    },
  ];

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
          className="flex-1"
        >
          <Input
            icon="search"
            value={qInput}
            onChange={(e) => onQInputChange(e.target.value)}
            aria-label="ค้นหาเคส"
            placeholder="ค้นหาเคส..."
          />
        </form>

        <DropdownFilter
          value={statusFilter}
          onChange={onStatusFilterChange}
          options={STATUS_OPTIONS}
        />
      </div>

      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        onRowClick={onSelectTicket}
        empty={
          <EmptyState
            icon="inbox"
            title="ไม่มีเคสในหมวดนี้"
            description="ลองเปลี่ยนตัวกรองสถานะ หรือค้นหาด้วยคำอื่น"
            className="border-0 bg-transparent py-0"
          />
        }
      />

      <p className="mt-3 text-right text-xs font-medium text-slate-500">
        คลิกที่แถวตั๋วเพื่อเปิดหน้าต่างแชท (Chat) เพื่อจัดการคำร้อง
      </p>
      <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
    </>
  );
}
