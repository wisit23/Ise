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
  { value: "", label: "สถานะทั้งหมด" },
  { value: "NEW", label: "ตั๋วใหม่" },
  { value: "ASSIGNED", label: "มอบหมายแล้ว" },
  { value: "IN_PROGRESS", label: "กำลังดำเนินการ" },
  { value: "PENDING_USER", label: "รอลูกค้าตอบกลับ" },
  { value: "RESOLVED", label: "แก้ไขสำเร็จ" },
  { value: "CLOSED", label: "ปิดตั๋วแล้ว" },
  // ESCALATED is deliberately excluded — those tickets are handed off to
  // Admin and only ever browsable from "เคสระดับแอดมิน"
  // (AdminInboxSection), not the general Tickets tab.
];

const PRIORITY_OPTIONS = [
  { value: "", label: "ความสำคัญทั้งหมด" },
  { value: "LOW", label: "ต่ำ" },
  { value: "NORMAL", label: "ปานกลาง" },
  { value: "HIGH", label: "สูง" },
  { value: "URGENT", label: "ด่วนที่สุด" },
];

/* The CS ticket queue. Same shape as the Admin inbox table but with its own
   filters and without the report-specific priority override. */
export default function TicketsTable({
  items,
  loading,
  qInput,
  onQInputChange,
  onSearch,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
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
      render: (t) => (
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
          <span className="text-slate-400">—</span>
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
            aria-label="ค้นหาตั๋ว"
            placeholder="ค้นหาตั๋ว..."
          />
        </form>
        <DropdownFilter
          value={statusFilter}
          onChange={onStatusFilterChange}
          options={STATUS_OPTIONS}
        />
        <DropdownFilter
          value={priorityFilter}
          onChange={onPriorityFilterChange}
          options={PRIORITY_OPTIONS}
        />
      </div>

      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        onRowClick={onSelectTicket}
        empty={
          <EmptyState
            icon="confirmation_number"
            title="ไม่มีตั๋วในหมวดนี้"
            description="ลองเปลี่ยนตัวกรองสถานะหรือความสำคัญ"
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
