import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import useDeliveryDeadlines from "./useDeliveryDeadlines";

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-11-10T00:00:00Z")); });
afterEach(() => jest.useRealTimers());

function useOrders(order) {
  const [orders, setOrders] = useState([order]);
  useDeliveryDeadlines(orders, setOrders);
  return orders;
}

test("an open page changes at the persisted ten-second deadline without polling", () => {
  const at = "2026-11-10T00:00:10.000Z";
  const { result, unmount } = renderHook(() => useOrders({ id: "o", status: "in_transit", deliveredAt: at }));
  act(() => jest.advanceTimersByTime(9999));
  expect(result.current[0].status).toBe("in_transit");
  act(() => jest.advanceTimersByTime(1));
  expect(result.current[0].status).toBe("delivered");
  expect(result.current[0].deliveredAt).toBe(at);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test("reopening after arrival does not wait another ten seconds", () => {
  const { result } = renderHook(() => useOrders({ status: "in_transit", deliveredAt: "2026-11-09T23:59:59Z" }));
  act(() => jest.advanceTimersByTime(0));
  expect(result.current[0].status).toBe("delivered");
});

test("held shipments are not advanced locally", () => {
  const { result } = renderHook(() => useOrders({ status: "in_transit", deliveredAt: "2026-11-10T00:00:10Z", payoutHeld: true }));
  act(() => jest.advanceTimersByTime(15_000));
  expect(result.current[0].status).toBe("in_transit");
});
