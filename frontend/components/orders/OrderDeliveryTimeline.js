import { ORDER_STATUS_LABEL } from "../seller/dashboard/sellerStatus";

const STEPS = [
  "confirmed",
  "pickup_in_progress",
  "in_transit",
  "delivered",
  "completed",
];

const TIMESTAMP_FIELDS = {
  in_transit: "shippedAt",
  delivered: "deliveredAt",
  completed: "completedAt",
};

function milestoneTime(order, step) {
  const candidates = [
    order?.[TIMESTAMP_FIELDS[step]],
    order?.deliveryTimeline?.[step],
  ];
  return (
    candidates.find(
      (value) =>
        typeof value === "string" &&
        value.trim() &&
        Number.isFinite(new Date(value).getTime()),
    ) || null
  );
}

/** Each milestone shows its recorded time; missing history is never inferred. */
export default function OrderDeliveryTimeline({ order, statusLabels = {} }) {
  const status =
    order?.status === "disputed" ? order.preDisputeStatus : order?.status;
  const current = STEPS.indexOf(
    status === "ready_to_ship" ? "confirmed" : status,
  );
  return (
    <ol
      aria-label="ขั้นตอนการจัดส่ง"
      className="space-y-2 rounded-lg border border-line p-3 text-xs"
    >
      {STEPS.map((step, index) => {
        const reached = index <= current;
        const at = reached ? milestoneTime(order, step) : null;
        return (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className={
              index <= current
                ? "font-medium text-emerald-700"
                : "text-ink-muted"
            }
          >
            {statusLabels[step] || ORDER_STATUS_LABEL[step]}
            {at ? (
              <time dateTime={at} className="ml-2 font-normal">
                {new Date(at).toLocaleString("th-TH", {
                  timeZone: "Asia/Bangkok",
                })}
              </time>
            ) : reached ? (
              <span className="ml-2 font-normal text-ink-muted">
                ไม่มีข้อมูลเวลา
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
