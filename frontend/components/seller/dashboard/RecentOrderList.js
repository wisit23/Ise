"use client";

import EmptyState from "../../ui/EmptyState";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
  StatusPill,
  baht,
} from "./sellerStatus";

export default function RecentOrderList({ orders }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="receipt_long"
        title="ยังไม่มีคำสั่งซื้อเข้ามา"
        description="เมื่อมีลูกค้าสั่งซื้อ รายการจะปรากฏที่นี่"
        className="border-0 bg-transparent py-6"
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-gray-100">
      {orders.map((o) => (
        <li
          key={o.id}
          className="flex items-center justify-between gap-3 py-2.5 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">
              {o.productTitle}
            </p>
            <p className="text-ink-muted">
              {baht(o.price)} ·{" "}
              {new Date(o.createdAt).toLocaleDateString("th-TH")}
            </p>
          </div>
          <StatusPill
            label={ORDER_STATUS_LABEL[o.status] || o.status}
            style={ORDER_STATUS_STYLE[o.status]}
          />
        </li>
      ))}
    </ul>
  );
}
