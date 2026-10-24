export default function OrderCancellationReason({ order }) {
  if (order?.status !== "cancelled" || !order.cancellationReason?.trim()) return null;
  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50 p-4" aria-label="เหตุผลในการยกเลิกคำสั่งซื้อ">
      <h3 className="text-sm font-semibold text-rose-900">เหตุผลในการยกเลิกคำสั่งซื้อ</h3>
      <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm text-rose-800">
        {order.cancellationReason}
      </p>
    </section>
  );
}
