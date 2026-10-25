import { formatReferenceCode } from "../../../../lib/referenceCodes";
import { ORDER_STATUS_LABEL } from "../../../../lib/supportConstants";

export function orderAmount(order) {
  return order.finalPrice ?? order.totalAmount ?? order.price ?? 0;
}

export default function SupportOrderDetails({ order }) {
  const money = (value) => `฿${Number(value).toLocaleString("th-TH")}`;
  const rows = [
    ["รหัสคำสั่งซื้อ", order.id],
    ["สินค้า", order.productTitle || formatReferenceCode(order.productId) || "—"],
    ["สถานะ", ORDER_STATUS_LABEL[order.status] || order.status],
    ["ผู้ซื้อ", order.buyer?.name || formatReferenceCode(order.buyerId)],
    ["รหัสผู้ซื้อ", order.buyerId],
    ["ผู้ขาย", order.seller?.name || formatReferenceCode(order.sellerId)],
    ["รหัสผู้ขาย", order.sellerId],
    ["ราคาสินค้า", money(order.price ?? order.totalAmount ?? 0)],
    ["ส่วนลด", money(order.discountAmount ?? 0)],
    ["ยอดชำระ", money(orderAmount(order))],
    ["รหัสส่วนลด", order.campaignCode || "—"],
    [
      "วันที่สั่งซื้อ",
      order.createdAt ? new Date(order.createdAt).toLocaleString("th-TH") : "—",
    ],
  ];
  return (
    <dl className="space-y-3">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-1 gap-1 border-b pb-2 sm:grid-cols-3"
        >
          <dt className="text-sm text-slate-500">{label}</dt>
          <dd className="break-words text-sm font-medium sm:col-span-2">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
