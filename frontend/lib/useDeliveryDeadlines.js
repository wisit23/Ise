"use client";

import { useEffect } from "react";

export function applyDeliveryDeadline(order, now = Date.now()) {
  if (order?.status !== "in_transit" || !order.deliveredAt ||
      order.payoutHeld || order.paymentSimulationStatus === "ON_HOLD" ||
      (order.dispute && !order.dispute.deletedAt && !order.dispute.decision) ||
      new Date(order.deliveredAt).getTime() > now ||
      !Number.isFinite(new Date(order.deliveredAt).getTime())) return order;
  return { ...order, status: "delivered",
    shipping: order.shipping ? { ...order.shipping, status: "delivered" } : order.shipping };
}

// Wake at the nearest persisted deadline, not on a polling interval.
export default function useDeliveryDeadlines(orders, setOrders) {
  useEffect(() => {
    const now = Date.now();
    const pending = orders.filter((order) => order?.status === "in_transit" &&
      order.deliveredAt && !order.payoutHeld && order.paymentSimulationStatus !== "ON_HOLD" &&
      !(order.dispute && !order.dispute.deletedAt && !order.dispute.decision) &&
      Number.isFinite(new Date(order.deliveredAt).getTime()));
    if (!pending.length) return undefined;
    const at = Math.min(...pending.map((order) => new Date(order.deliveredAt).getTime()));
    const timer = setTimeout(() => {
      setOrders((previous) => previous.map((order) => applyDeliveryDeadline(order)));
    }, Math.min(Math.max(0, at - now), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [orders, setOrders]);
}
