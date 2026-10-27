import { render, screen, within } from "@testing-library/react";
import OrderDeliveryTimeline from "./OrderDeliveryTimeline";

test("pickup is the current step without a handoff timestamp or delivery claim", () => {
  render(<OrderDeliveryTimeline order={{ status: "pickup_in_progress" }} />);
  const steps = within(
    screen.getByRole("list", { name: "ขั้นตอนการจัดส่ง" }),
  ).getAllByRole("listitem");
  expect(steps).toHaveLength(5);
  expect(steps[1]).toHaveAttribute("aria-current", "step");
  expect(steps[1]).toHaveTextContent("ขนส่งกำลังเข้ารับสินค้า");
  expect(steps[2]).not.toHaveAttribute("aria-current");
  expect(steps[2].querySelector("time")).toBeNull();
});
test("in-transit timeline shows the actual handoff time", () => {
  const at = "2026-10-25T10:00:00.000Z";
  render(
    <OrderDeliveryTimeline order={{ status: "in_transit", shippedAt: at }} />,
  );
  const current = screen
    .getAllByRole("listitem")
    .find((step) => step.getAttribute("aria-current") === "step");
  expect(current).toHaveTextContent("อยู่ระหว่างการขนส่ง");
  expect(current.querySelector("time")).toHaveAttribute("dateTime", at);
});
test("held orders retain their paused shipping step", () => {
  render(
    <OrderDeliveryTimeline
      order={{ status: "disputed", preDisputeStatus: "pickup_in_progress" }}
    />,
  );
  expect(screen.getByText("ขนส่งกำลังเข้ารับสินค้า")).toHaveAttribute(
    "aria-current",
    "step",
  );
});

test("completed orders show the actual timestamp of all five milestones", () => {
  const timestamps = {
    confirmed: "2026-10-20T01:00:00.000Z",
    pickup_in_progress: "2026-10-20T02:00:00.000Z",
    in_transit: "2026-10-20T03:00:00.000Z",
    delivered: "2026-10-21T04:00:00.000Z",
    completed: "2026-10-22T05:00:00.000Z",
  };
  render(
    <OrderDeliveryTimeline
      order={{ status: "completed", deliveryTimeline: timestamps }}
    />,
  );
  const steps = screen.getAllByRole("listitem");
  Object.values(timestamps).forEach((at, index) => {
    expect(steps[index].querySelector("time")).toHaveAttribute("dateTime", at);
  });
});

test("legacy orders use stored delivery fields and explicitly mark missing history", () => {
  const order = {
    status: "completed",
    shippedAt: "2026-10-20T03:00:00.000Z",
    deliveredAt: "2026-10-21T04:00:00.000Z",
    completedAt: "2026-10-22T05:00:00.000Z",
    deliveryTimeline: { confirmed: "invalid" },
  };
  render(<OrderDeliveryTimeline order={order} />);
  expect(screen.getAllByText("ไม่มีข้อมูลเวลา")).toHaveLength(2);
  expect(document.querySelectorAll("time")).toHaveLength(3);
});

test("future steps do not claim timestamps before the order reaches them", () => {
  render(
    <OrderDeliveryTimeline
      order={{ status: "confirmed", deliveredAt: "2026-10-21T04:00:00.000Z" }}
    />,
  );
  expect(
    screen.getByText("ส่งถึงผู้ซื้อแล้ว").querySelector("time"),
  ).toBeNull();
});
