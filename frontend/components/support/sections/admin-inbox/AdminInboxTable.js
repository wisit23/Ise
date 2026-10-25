"use client";
import { formatReferenceCode } from "../../../../lib/referenceCodes";


import Pagination from "../../../Pagination";
import Badge from "../../../panel/ui/Badge";
import DropdownFilter from "../../../panel/ui/DropdownFilter";
import DataTable from "../../../ui/DataTable";
import EmptyState from "../../../ui/EmptyState";
import Input from "../../../ui/Input";
import CaseDate from "../case/CaseDate";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
} from "../../../../lib/supportConstants";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "รอดำเนินการ" },
  { value: "OPEN", label: "รายงานใหม่" },
  { value: "REVIEWED", label: "กำลังตรวจสอบ" },
  { value: "ACTIONED", label: "จัดการแล้ว" },
  { value: "DISMISSED", label: "ยกเลิกแล้ว" },
  { value: "", label: "ทั้งหมด" },
];
const TICKET_OPTIONS = [
  { value: "ALL", label: "ทุกสถานะ" },
  ...["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"]
    .map((value) => ({ value, label: TICKET_STATUS_LABEL[value] || value })),
];

/* The queue view: search, status filter, the case table and its pager.
   Presentational only — every piece of state lives in AdminInboxSection. */
export default function AdminInboxTable({
  items,
  source,
  loading,
  qInput,
  onQInputChange,
  onSearch,
  statusFilter,
  history = false,
  hideStatusFilter = false,
  ticketStatus,
  onTicketStatusChange,
  onStatusFilterChange,
  page,
  totalPages,
  onPageChange,
  onSelectTicket,
}) {
  const columns = [
    {
      key: "ticketNumber",
      header: source === "reports" ? "เลขรายงาน" : "Ticket ID",
      className:
        "font-mono text-[13px] font-semibold tracking-tight text-slate-500",
    },
    {
      key: "createdAt",
      header: source === "reports" ? "วันที่แจ้งรายงาน" : "วันที่แจ้งปัญหา",
      align: "center",
      className: "text-xs font-medium text-slate-500",
      render: (t) => <CaseDate value={t.createdAt} />,
    },
    {
      key: "parties",
      header: "คู่กรณี / ผู้แจ้ง",
      className: "text-xs font-medium",
      render: (t) => (
        <div className="flex flex-col gap-0.5">
          {t.targetId ? (
            <span
              className="font-semibold text-orange-700"
              title={`คู่กรณี: ${formatReferenceCode(t.targetId)}`}
            >
              <span className="mr-1 text-[10px] font-bold uppercase text-orange-500">
                คู่กรณี:
              </span>
              <span>{t.targetName || formatReferenceCode(t.targetId)}</span>
            </span>
          ) : (
            <span className="text-[11px] italic text-slate-400">
              คู่กรณี: ไม่ระบุ
            </span>
          )}
          <span className="text-slate-500" title={`ผู้แจ้ง: ${formatReferenceCode(t.requesterId)}`}>
            <span className="mr-1 text-[10px] font-medium text-slate-400">
              ผู้แจ้ง:
            </span>
            <span>
              {t.requesterName || (t.requesterId ? formatReferenceCode(t.requesterId) : "—")}
            </span>
          </span>
        </div>
      ),
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
            text="ด่วนที่สุด"
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
          t.assigneeName || formatReferenceCode(t.assigneeId)
        ) : (
          <span className="text-slate-500">—</span>
        ),
    },
  ];

  if (source === "tickets") columns.push({
    key: "escalatedAt", header: "วันที่ส่งต่อ T&S", align: "center",
    render: (row) => <CaseDate value={row.escalatedAt} />,
  });
  if (history || items.some((row) => row.assigneeId)) columns.push({
    key: "assignedAt", header: "วันที่รับงาน", align: "center",
    render: (row) => <CaseDate value={source === "reports" ? row.rawReport?.reviewedAt : row.assignedAt} />,
  });
  if (history) columns.push({
    key: "completedAt", header: source === "reports" ? "วันที่ตัดสิน" : "วันที่ปิด / แก้ไข", align: "center",
    render: (row) => <CaseDate value={source === "reports" ? row.rawReport?.decidedAt : row.closedAt || row.resolvedAt} />,
  });

  if (source === "reports") {
    columns.splice(1, 0, {
      key: "reportType",
      header: "ประเภทรายงาน",
      render: (row) => {
        const report = row.rawReport;
        if (report?.reason?.includes("[รายงานรีวิว") || report?.reason?.includes("เนื้อหารีวิว")) return "รีวิว";
        return report?.productId ? "สินค้า" : "ร้านค้า";
      },
    });
  }

  return (
    <>
      <p className="mb-3 text-xs text-slate-500">วันและเวลาแสดงตามเวลาไทย (UTC+7) · วันที่แจ้งเรื่องแยกจากวันที่รับงานและวันที่ตัดสิน</p>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {source === "tickets" && (
          <><form
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
          </form>{!history && <DropdownFilter
            value={ticketStatus}
            onChange={onTicketStatusChange}
            options={TICKET_OPTIONS}
            align="right"
          />}</>
        )}

        {source === "reports" && (
          <><form onSubmit={e=>{e.preventDefault();onSearch();}} className="flex-1"><Input icon="search" value={qInput} onChange={e=>onQInputChange(e.target.value)} aria-label="ค้นหาเคส" placeholder="ค้นหารายงาน..." /></form>{!history && !hideStatusFilter && <DropdownFilter
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={STATUS_OPTIONS}
            align="right"
          />}</>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        onRowClick={onSelectTicket}
        empty={
          <EmptyState
            icon="inbox"
            title={source === "reports" ? "ไม่มีรายงานในหมวดนี้" : "ไม่มีเคสในหมวดนี้"}
            description="ลองเปลี่ยนตัวกรองสถานะ หรือค้นหาด้วยคำอื่น"
            className="border-0 bg-transparent py-0"
          />
        }
      />

      <p className="mt-3 text-right text-xs font-medium text-slate-500">
        {source === "reports" ? "เลือกรายงานเพื่อรับงาน ตรวจสอบหลักฐาน และพิจารณา" : "เลือกคำร้องเพื่อดูรายละเอียดและประวัติการสนทนา"}
      </p>
      <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
    </>
  );
}
