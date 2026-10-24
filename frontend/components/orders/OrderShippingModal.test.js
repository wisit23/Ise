import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { apiFetch } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
import OrderShippingModal from "./OrderShippingModal";

jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token", getStoredUser: jest.fn() }));
const order = {
  id: "o1", sellerId: "seller", status: "ready_to_ship", version: 7, price: 100,
  shipping: { addressSnapshot: { recipientName: "Buyer", phone: "0812345678", addressLine: "Test Road", postalCode: "10110" } },
};
let current;
beforeEach(() => {
  jest.clearAllMocks();
  current = { ...order };
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  apiFetch.mockImplementation((url, options) => {
    if (options?.method === "PATCH") {
      current = { ...current, status: options.body.status, version: current.version + 1,
        shipping: { ...current.shipping, ...(options.body.status === "in_transit" ? { company: options.body.company, trackingNumber: options.body.trackingNumber } : {}) } };
    }
    return Promise.resolve(current);
  });
});
function open(props = {}) {
  return render(<OrderShippingModal orderId="o1" initialOrder={current} isOpen onClose={() => {}} {...props} />);
}
async function pickup() {
  fireEvent.click(await screen.findByRole("button", { name: "เรียกขนส่ง" }));
  return screen.findByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" });
}
it("seller requests pickup without tracking, then must enter carrier/tracking at handoff", async () => {
  const onOrderUpdated = jest.fn();
  open({ onOrderUpdated });
  expect(screen.queryByLabelText("บริษัทขนส่ง")).not.toBeInTheDocument();
  const submit = await pickup();
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/status", expect.objectContaining({
    method: "PATCH", body: { status: "pickup_in_progress", version: 7 },
  }));
  expect(onOrderUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "pickup_in_progress" }));
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("บริษัทขนส่ง"), { target: { value: "Kerry Express" } });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("เลขติดตามพัสดุ"), { target: { value: " TRACK123 " } });
  fireEvent.click(submit);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/status", expect.objectContaining({
    method: "PATCH", body: { status: "in_transit", company: "Kerry Express", trackingNumber: "TRACK123", version: 8 },
  })));
  expect(onOrderUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "in_transit" }));
  expect(screen.getByText("TRACK123")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" })).not.toBeInTheDocument();
});
it("provides required company options only during pickup", async () => {
  current = { ...order, status: "pickup_in_progress" };
  open();
  const select = await screen.findByLabelText("บริษัทขนส่ง");
  expect(Array.from(select.querySelectorAll("option")).map((o) => o.value)).toEqual([
    "", "Thailand Post", "Kerry Express", "J&T Express", "Flash Express", "SPX Express", "Best Express",
  ]);
});
it("allows selecting a carrier from the scrollable dropdown", async () => {
  current = { ...order, status: "pickup_in_progress" };
  open();
  const trigger = await screen.findByTestId("shipping-company-trigger");
  fireEvent.click(trigger);
  const menu = screen.getByTestId("shipping-company-menu");
  expect(menu).toHaveClass("overflow-y-auto", "max-h-40", "top-full");
  fireEvent.click(within(menu).getByText("Flash Express"));
  expect(trigger).toHaveTextContent("Flash Express");
  expect(screen.queryByTestId("shipping-company-menu")).not.toBeInTheDocument();
  expect(screen.getByLabelText("บริษัทขนส่ง")).toHaveValue("Flash Express");
});
it.each(["ready_to_ship", "pickup_in_progress"])("buyer has no seller controls at %s", async (status) => {
  current = { ...order, status };
  getStoredUser.mockReturnValue({ id: "buyer", role: "BUYER" });
  open();
  expect(await screen.findByText(/Test Road/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "เรียกขนส่ง" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" })).not.toBeInTheDocument();
});
it.each(["ready_to_ship", "pickup_in_progress"])("hold blocks the seller action at %s", async (status) => {
  current = { ...order, status, payoutHeld: true };
  open();
  const button = await screen.findByRole("button", { name: status === "ready_to_ship" ? "เรียกขนส่ง" : "ส่งมอบให้ขนส่งแล้ว" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(apiFetch.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
});
it("failed pickup remains ready and reports the API error", async () => {
  apiFetch.mockImplementation((url, options) => options?.method ? Promise.reject(new Error("order changed")) : Promise.resolve(current));
  open();
  fireEvent.click(await screen.findByRole("button", { name: "เรียกขนส่ง" }));
  expect(await screen.findByText("order changed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "เรียกขนส่ง" })).toBeEnabled();
});
it("paid orders still require confirmation and preparation before pickup", async () => {
  current = { ...order, status: "paid" };
  apiFetch.mockImplementation((url, options) => {
    if (url.endsWith("/confirm") && options?.method === "POST") current = { ...current, status: "confirmed" };
    return Promise.resolve(current);
  });
  const onOrderUpdated = jest.fn();
  open({ onOrderUpdated });
  fireEvent.click(await screen.findByRole("button", { name: "ยืนยันรับออเดอร์" }));
  expect(await screen.findByText(/เตรียมสินค้าเรียบร้อย/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "เรียกขนส่ง" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("บริษัทขนส่ง")).not.toBeInTheDocument();
  expect(onOrderUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "confirmed" }));
});
it("paid-order rejection remains available with a reason", async () => {
  current = { ...order, status: "paid" };
  const cancelled = { ...current, status: "cancelled" };
  apiFetch.mockImplementation((url, options) => Promise.resolve(options?.method === "POST" ? cancelled : current));
  const onRejected = jest.fn();
  open({ onRejected });
  fireEvent.click(await screen.findByRole("button", { name: "ปฏิเสธ" }));
  fireEvent.click(screen.getByText("สินค้าชำรุดก่อนจัดส่ง"));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการปฏิเสธออเดอร์" }));
  await waitFor(() => expect(onRejected).toHaveBeenCalledWith(cancelled));
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/reject", expect.objectContaining({ method: "POST", body: { reason: "สินค้าชำรุดก่อนจัดส่ง" } }));
});
it("handoff refuses tracking outside 8-20 letters/digits with a digit", async () => {
  current = { ...order, status: "pickup_in_progress" };
  open();
  const submit = await screen.findByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" });
  fireEvent.change(screen.getByLabelText("บริษัทขนส่ง"), { target: { value: "J&T Express" } });
  const input = screen.getByLabelText("เลขติดตามพัสดุ");
  for (const value of ["ABCDEFGH", "พัสดุ", "AB 12345", "123!5678", "TH12345"]) {
    fireEvent.change(input, { target: { value } });
    expect(submit).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  }
  for (const value of ["123456789012", "TH123456789TH"]) {
    fireEvent.change(input, { target: { value } });
    expect(submit).toBeEnabled();
  }
  expect(apiFetch.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
});
