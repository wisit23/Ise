"use client";

import Pagination from "../../../Pagination";
import Badge from "../../../panel/ui/Badge";
import DropdownFilter from "../../../panel/ui/DropdownFilter";
import KpiCard from "../../../panel/ui/KpiCard";
import Button from "../../../ui/Button";
import DataTable from "../../../ui/DataTable";
import EmptyState from "../../../ui/EmptyState";
import Input from "../../../ui/Input";
import CopyableId from "./CopyableId";
import {
  DISPUTE_STATUS_LABEL,
  DISPUTE_STATUS_STYLE,
} from "../../../../lib/supportConstants";

const STATUS_OPTIONS = [
  { value: "", label: "สถานะทั้งหมด" },
  { value: "OPEN", label: "รอตรวจสอบ" },
  { value: "NEEDS_INFO", label: "รอข้อมูล" },
  { value: "DECIDED", label: "ตัดสินแล้ว" },
];

/* Stat row, search, status filter, the dispute table and its pager.
   Presentational — DisputesSection owns every piece of state. */
export default function DisputesTable({
  items,
  loading,
  stats,
  qInput,
  onQInputChange,
  onSearch,
  status,
  onStatusChange,
  page,
  totalPages,
  onPageChange,
  onOpenDispute,
}) {
  const columns = [
    {
      key: "id",
      header: "Dispute ID",
      render: (d) => (
        <div className="flex flex-col gap-1">
          <CopyableId
            value={d.id}
            display={`#${d.id.slice(0, 12).toUpperCase()}`}
            className="font-mono text-[13px] font-semibold tracking-tight text-slate-800"
          />
          <span className="font-mono text-xs text-slate-500">
            Ord #{d.orderId.slice(0, 12).toUpperCase()}
          </span>
        </div>
      ),
    },
    {
      key: "reason",
      header: "เหตุผล",
      className: "max-w-[180px] truncate text-sm font-medium text-slate-700",
    },
    {
      key: "parties",
      header: "Buyer → Seller",
      render: (d) =>
        d.order ? (
          <div className="flex flex-col gap-0.5 text-[13px] text-slate-500">
            <CopyableId
              value={d.order.buyerId}
              display={d.order.buyerId.slice(0, 12)}
              suffix=" (B)"
              revealOnHover
            />
            <CopyableId
              value={d.order.sellerId}
              display={d.order.sellerId.slice(0, 12)}
              suffix=" (S)"
              revealOnHover
            />
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "price",
      header: "ยอดเงิน",
      align: "center",
      className: "font-medium text-slate-700",
      render: (d) =>
        d.order?.price ? `฿${d.order.price.toLocaleString("th-TH")}` : "—",
    },
    {
      key: "status",
      header: "สถานะ",
      align: "center",
      render: (d) => (
        <Badge
          text={DISPUTE_STATUS_LABEL[d.status] || d.status}
          style={
            DISPUTE_STATUS_STYLE[d.status] || "bg-slate-100 text-slate-600"
          }
        />
      ),
    },
    {
      key: "createdAt",
      header: "วันที่เปิด",
      align: "center",
      className: "text-xs font-medium text-slate-500",
      render: (d) => new Date(d.createdAt).toLocaleDateString("th-TH"),
    },
    {
      key: "action",
      header: "Action",
      align: "center",
      render: (d) => (
        <Button
          size="sm"
          variant={d.status === "DECIDED" ? "secondary" : "primary"}
          onClick={() => onOpenDispute(d)}
        >
          {d.status === "DECIDED" ? "ดูรายละเอียด" : "ตรวจสอบ"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-4">
        <KpiCard
          label="ทั้งหมด"
          value={stats.total}
          icon="folder"
          color="gray"
        />
        <KpiCard
          label="รอตรวจสอบ"
          value={stats.open}
          icon="inbox"
          color="amber"
        />
        <KpiCard
          label="ตัดสินแล้ว"
          value={stats.decided}
          icon="check_circle"
          color="emerald"
        />
      </div>

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
            aria-label="ค้นหาข้อพิพาท"
            placeholder="ค้นหาข้อพิพาท..."
          />
        </form>
        <DropdownFilter
          value={status}
          onChange={onStatusChange}
          options={STATUS_OPTIONS}
          align="right"
        />
      </div>

      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        minWidth="min-w-[700px]"
        empty={
          <EmptyState
            icon="gavel"
            title="ไม่มีข้อพิพาทในหมวดนี้"
            description="ลองเปลี่ยนตัวกรองสถานะ หรือค้นหาด้วยคำอื่น"
            className="border-0 bg-transparent py-0"
          />
        }
      />

      <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
    </>
  );
}
