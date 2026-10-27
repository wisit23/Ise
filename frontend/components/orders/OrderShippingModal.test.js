import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { apiFetch } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
import OrderShippingModal from "./OrderShippingModal";

jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token", getStoredUser: jest.fn() }));
const order = {
  id: "o1", sellerId: "seller", status: "confirmed", version: 7, price: 100,
  shipping: { addressSnapshot: { recipientName: "Buyer", phone: "0812345678", addressLine: "Test Road", postalCode: "10110" } },
};
let current;
beforeEach(() => {
  jest.clearAllMocks();
  current = { ...order };
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  apiFetch.mockImplementation((url, options) => {
    if (options?.method === "PATCH") {
      current = { ...current, status: options.body.status || current.status, version: current.version + 1,
        shipping: { ...current.shipping, ...(options.body.company ? { company: options.body.company, trackingNumber: options.body.trackingNumber } : {}) } };
    }
    return Promise.resolve(current);
  });
});
function open(props = {}) {
  return render(<OrderShippingModal orderId="o1" initialOrder={current} isOpen onClose={() => {}} {...props} />);
}
it("seller prepares shipping details at confirmed and reuses them at handoff", async () => {
  const onOrderUpdated = jest.fn();
  open({ onOrderUpdated });
  const pickup = await screen.findByRole("button", { name: "เรียกขนส่ง" });
  expect(pickup).toBeDisabled();
  fireEvent.change(screen.getByLabelText("บริษัทขนส่ง"), { target: { value: "Kerry Express" } });
  expect(pickup).toBeDisabled();
  fireEvent.change(screen.getByLabelText("เลขติดตามพัสดุ"), { target: { value: " TRACK123 " } });
  fireEvent.click(pickup);
  const submit = await screen.findByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" });
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/status", expect.objectContaining({
    method: "PATCH", body: { status: "pickup_in_progress", company: "Kerry Express", trackingNumber: "TRACK123", version: 7 },
  }));
  expect(onOrderUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "pickup_in_progress" }));
  expect(screen.getByLabelText("บริษัทขนส่ง")).toHaveValue("Kerry Express");
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/status", expect.objectContaining({
    method: "PATCH", body: { status: "in_transit", version: 8 },
  })));
  expect(onOrderUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "in_transit" }));
  expect(screen.getByText("TRACK123")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" })).not.toBeInTheDocument();
});
it("reopens pickup with saved details and hands off without re-entry", async () => {
  current = { ...order, status: "pickup_in_progress", shipping: { ...order.shipping, company: "Flash Express", trackingNumber: "TRACK123" } };
  open();
  const handoff = await screen.findByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" });
  expect(screen.getByText("TRACK123")).toBeInTheDocument();
  expect(screen.getByLabelText("เลขติดตามพัสดุ")).toHaveValue("TRACK123");
  fireEvent.click(handoff);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/status", expect.objectContaining({
    method: "PATCH", body: { status: "in_transit", version: 7 },
  })));
});
it("older ready_to_ship orders can still request pickup with shipping details", async () => {
  current = { ...order, status: "ready_to_ship" };
  open();
  const pickup = await screen.findByRole("button", { name: "เรียกขนส่ง" });
  expect(pickup).toBeDisabled();
  fireEvent.change(screen.getByLabelText("บริษัทขนส่ง"), { target: { value: "Flash Express" } });
  fireEvent.change(screen.getByLabelText("เลขติดตามพัสดุ"), { target: { value: "TRACK123" } });
  fireEvent.click(pickup);
  expect(await screen.findByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" })).toBeEnabled();
});
it("edits saved pickup details without handing over the parcel", async () => {
  current = { ...order, status: "pickup_in_progress", shipping: { ...order.shipping, company: "Flash Express", trackingNumber: "TRACK123" } };
  const onOrderUpdated = jest.fn();
  open({ onOrderUpdated });
  const save = await screen.findByRole("button", { name: "บันทึกการแก้ไข" });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("บริษัทขนส่ง"), { target: { value: "J&T Express" } });
  fireEvent.change(screen.getByLabelText("เลขติดตามพัสดุ"), { target: { value: " EDIT12345 " } });
  fireEvent.click(save);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/shipping-details", expect.objectContaining({
    method: "PATCH", body: { company: "J&T Express", trackingNumber: "EDIT12345", version: 7 },
  })));
  expect(await screen.findByText("บันทึกข้อมูลขนส่งเรียบร้อยแล้ว")).toBeInTheDocument();
  expect(onOrderUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "pickup_in_progress", version: 8 }));
  expect(screen.getByLabelText("เลขติดตามพัสดุ")).toHaveValue("EDIT12345");
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/status", expect.objectContaining({
    method: "PATCH", body: { status: "in_transit", version: 8 },
  })));
});
it("invalid edited tracking disables saving and carrier handoff", async () => {
  current = { ...order, status: "pickup_in_progress", shipping: { ...order.shipping, company: "Flash Express", trackingNumber: "TRACK123" } };
  open();
  fireEvent.change(await screen.findByLabelText("เลขติดตามพัสดุ"), { target: { value: "INVALID" } });
  expect(screen.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" })).toBeDisabled();
});
it.each(["in_transit", "delivered", "completed"])("shipping details are read-only after handoff (%s)", async (status) => {
  current = { ...order, status, shipping: { ...order.shipping, company: "Flash Express", trackingNumber: "TRACK123" } };
  open();
  expect(await screen.findByText("TRACK123")).toBeInTheDocument();
  expect(screen.queryByLabelText("เลขติดตามพัสดุ")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "บันทึกการแก้ไข" })).not.toBeInTheDocument();
});
it("provides carrier options while preparing a confirmed order", async () => {
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
it.each(["confirmed", "ready_to_ship", "pickup_in_progress"])("buyer has no seller controls at %s", async (status) => {
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
  fireEvent.change(await screen.findByLabelText("บริษัทขนส่ง"), { target: { value: "Kerry Express" } });
  fireEvent.change(screen.getByLabelText("เลขติดตามพัสดุ"), { target: { value: "TRACK123" } });
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
  expect(await screen.findByRole("button", { name: "เรียกขนส่ง" })).toBeDisabled();
  expect(screen.getByLabelText("บริษัทขนส่ง")).toBeInTheDocument();
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

it("shows the saved cancellation reason in seller order details", async () => {
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  apiFetch.mockResolvedValue({ ...order, status: "cancelled", cancellationReason: "สินค้าหมดสต็อก" });
  render(<OrderShippingModal orderId="o1" initialOrder={order} isOpen onClose={() => {}} />);
  expect(await screen.findByRole("region", { name: "เหตุผลในการยกเลิกคำสั่งซื้อ" })).toHaveTextContent("สินค้าหมดสต็อก");
});

it.each(["confirmed", "ready_to_ship"])("seller can reject %s order directly from shipping modal", async (status) => {
  const currentOrder = { ...order, status, price: 150, finalPrice: 100 };
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  const cancelledOrder = { ...order, status: "cancelled" };
  apiFetch.mockImplementation((url, options) => {
    if (options?.method === "POST" && url === "/api/orders/o1/reject") {
      return Promise.resolve(cancelledOrder);
    }
    return Promise.resolve(currentOrder);
  });
  const onRejected = jest.fn();
  const onOrderUpdated = jest.fn();

  render(
    <OrderShippingModal
      orderId="o1"
      initialOrder={currentOrder}
      isOpen
      onClose={() => {}}
      onRejected={onRejected}
      onOrderUpdated={onOrderUpdated}
    />,
  );

  const rejectBtn = await screen.findByRole("button", { name: "ปฏิเสธ" });
  fireEvent.click(rejectBtn);

  expect(screen.getByText("คำเตือนเกี่ยวกับการปฏิเสธออเดอร์")).toBeInTheDocument();
  expect(screen.getByText(/เมื่อปฏิเสธคำสั่งซื้อ/)).toHaveTextContent("฿100");
  expect(screen.getByText(/เมื่อปฏิเสธคำสั่งซื้อ/)).not.toHaveTextContent("฿150");
  fireEvent.click(screen.getByText("สินค้าชำรุดก่อนจัดส่ง"));

  const confirmReject = screen.getByRole("button", { name: "ยืนยันการปฏิเสธออเดอร์" });
  fireEvent.click(confirmReject);

  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/o1/reject",
      expect.objectContaining({
        method: "POST",
        body: { reason: "สินค้าชำรุดก่อนจัดส่ง" },
      }),
    ),
  );

  expect(onRejected).toHaveBeenCalledWith(cancelledOrder);
  expect(onOrderUpdated).toHaveBeenCalledWith(cancelledOrder);
});
