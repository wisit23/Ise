"use client";

import Link from "next/link";
import Button from "../../ui/Button";
import EmptyState from "../../ui/EmptyState";
import {
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_STYLE,
  StatusPill,
  baht,
} from "./sellerStatus";

export default function SellerProductList({ products }) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon="inventory_2"
        title="ยังไม่มีสินค้าที่ลงขาย"
        description="ลงขายชิ้นแรกเพื่อเริ่มรับคำสั่งซื้อ"
        action={
          <Button href="/sell" icon="add">
            ลงขายสินค้า
          </Button>
        }
        className="border-0 bg-transparent py-6"
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2">
      {products.map((p) => (
        <li
          key={p.id}
          className="flex items-center justify-between gap-3 py-2.5 pr-4 text-sm"
        >
          <div className="min-w-0">
            <Link
              href={`/products/${p.id}`}
              className="focus-ring block truncate rounded font-medium text-gray-900 hover:text-brand-600"
            >
              {p.title}
            </Link>
            <p className="text-ink-muted">{baht(p.price)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/products/${p.id}/edit`}
              className="focus-ring rounded text-xs font-medium text-ink-muted hover:text-brand-600 hover:underline"
            >
              แก้ไข
            </Link>
            <StatusPill
              label={PRODUCT_STATUS_LABEL[p.status] || p.status}
              style={PRODUCT_STATUS_STYLE[p.status]}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
