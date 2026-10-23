import { render, screen, within } from "@testing-library/react";
import OrderDeliveryTimeline from "./OrderDeliveryTimeline";

test("pickup is the current step without a handoff timestamp or delivery claim", () => {
  render(<OrderDeliveryTimeline order={{ status: "pickup_in_progress" }} />);
  const steps = within(screen.getByRole("list", { name: "ขั้นตอนการจัดส่ง" })).getAllByRole("listitem");
  expect(steps).toHaveLength(5);
  expect(steps[1]).toHaveAttribute("aria-current", "step");
  expect(steps[1]).toHaveTextContent("ขนส่งกำลังเข้ารับสินค้า");
  expect(steps[2]).not.toHaveAttribute("aria-current");
  expect(steps[2].querySelector("time")).toBeNull();
});
test("in-transit timeline shows the actual handoff time", () => {
  const at = "2026-10-25T10:00:00.000Z";
  render(<OrderDeliveryTimeline order={{ status: "in_transit", shippedAt: at }} />);
  const current = screen.getAllByRole("listitem").find((step) => step.getAttribute("aria-current") === "step");
  expect(current).toHaveTextContent("อยู่ระหว่างการขนส่ง");
  expect(current.querySelector("time")).toHaveAttribute("dateTime", at);
});
test("held orders retain their paused shipping step", () => {
  render(<OrderDeliveryTimeline order={{ status: "disputed", preDisputeStatus: "pickup_in_progress" }} />);
  expect(screen.getByText("ขนส่งกำลังเข้ารับสินค้า")).toHaveAttribute("aria-current", "step");
});
