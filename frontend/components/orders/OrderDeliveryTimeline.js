import { ORDER_STATUS_LABEL } from "../seller/dashboard/sellerStatus";

const STEPS = ["confirmed", "pickup_in_progress", "in_transit", "delivered", "completed"];

/** Pickup is separate from carrier handoff; only handoff has shippedAt. */
export default function OrderDeliveryTimeline({ order, statusLabels = {} }) {
  const status = order?.status === "disputed" ? order.preDisputeStatus : order?.status;
  const current = STEPS.indexOf(status === "ready_to_ship" ? "confirmed" : status);
  return (
    <ol aria-label="ขั้นตอนการจัดส่ง" className="space-y-2 rounded-lg border border-line p-3 text-xs">
      {STEPS.map((step, index) => (
        <li key={step} aria-current={index === current ? "step" : undefined}
          className={index <= current ? "font-medium text-emerald-700" : "text-ink-muted"}>
          {statusLabels[step] || ORDER_STATUS_LABEL[step]}
          {step === "in_transit" && order?.shippedAt && (
            <time dateTime={order.shippedAt} className="ml-2 font-normal">
              {new Date(order.shippedAt).toLocaleString("th-TH")}
            </time>
          )}
        </li>
      ))}
    </ol>
  );
}
