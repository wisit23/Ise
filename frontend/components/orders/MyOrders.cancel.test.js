import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyOrders from "./MyOrders";
import { apiFetch } from "../../lib/api";

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn(), mediaUrl: (url) => url }));
jest.mock("../chat/ChatSocketProvider", () => ({ useChatSocketEvent: jest.fn() }));
jest.mock("../chat/ContactSellerButton", () => () => null);
jest.mock("../OrderLine", () => ({ __esModule: true, default: ({ actions, status }) => <div>{status}{actions}</div>, ProductThumb: () => null }));

let order;
beforeEach(() => {
  jest.clearAllMocks();
  order = { id: "order-1", productId: "p-1", status: "paid", price: 100 };
  apiFetch.mockImplementation(async (url, options) => {
    if (url.startsWith("/api/orders/mine")) return { items: [order], totalPages: 1 };
    if (url.startsWith("/api/reviews/mine")) return { items: [] };
    if (url === "/api/orders/order-1/status" && options.method === "PATCH") {
      order = { ...order, status: "cancelled" };
      return order;
    }
    if (url === "/api/orders/order-1") return order;
    return { items: [] };
  });
});

test("buyer explicitly confirms paid cancellation and the button disappears after success", async () => {
  render(<MyOrders />);
  fireEvent.click(await screen.findByRole("button", { name: "ยกเลิกคำสั่งซื้อ" }));
  expect(screen.getByText(/ระบบจะบันทึกคืนเงินเต็มจำนวน/)).toBeInTheDocument();
  expect(apiFetch.mock.calls.some(([, opts]) => opts?.method === "PATCH")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกคำสั่งซื้อ" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/orders/order-1/status", {
    method: "PATCH", token: "token", body: { status: "cancelled" },
  }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "ยกเลิกคำสั่งซื้อ" })).not.toBeInTheDocument());
});

for (const state of ["pending_payment"]) {
  test(`unpaid ${state} orders can still be cancelled`, async () => {
    order.status = state;
    render(<MyOrders />);
    expect(await screen.findByRole("button", { name: "ยกเลิกคำสั่งซื้อ" })).toBeInTheDocument();
  });
}

test.each([
  ["pending_payment", "รอชำระเงิน"],
])("%s shows its own label and preserves the payment link", async (status, label) => {
  order.status = status;
  render(<MyOrders />);
  expect(await screen.findByText(label, { selector: "span" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /ไปชำระเงิน/ })).toHaveAttribute("href", "/checkout?orders=order-1");
});

test.each([
  ["payment_expired", "หมดเวลาชำระเงิน", "หมดเวลาชำระเงิน"],
  ["seller_confirmation_expired", "หมดเวลายืนยันคำสั่งซื้อ (คืนเงินแล้ว)", "หมดเวลาผู้ขายยืนยัน"],
])("%s shows a distinct terminal label and filter", async (status, label, filter) => {
  order.status = status;
  render(<MyOrders />);
  expect(await screen.findByText(label, { selector: "span" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: filter }));
  await waitFor(() => expect(apiFetch.mock.calls.some(([url]) => url.includes(`status=${status}`))).toBe(true));
  expect(screen.queryByRole("link", { name: /ไปชำระเงิน/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ยกเลิกคำสั่งซื้อ" })).not.toBeInTheDocument();
});

for (const extra of [{ payoutHeld: true }, { paymentSimulationStatus: "ON_HOLD" }, { dispute: { id: "case-1", decision: null } }]) {
test(`paid orders with hold or dispute do not offer cancellation ${JSON.stringify(extra)}`, async () => {
  Object.assign(order, extra);
  render(<MyOrders />);
  await screen.findByRole("button", { name: "ดูรายละเอียด" });
  expect(screen.queryByRole("button", { name: "ยกเลิกคำสั่งซื้อ" })).not.toBeInTheDocument();
});
}

for (const state of ["confirmed", "ready_to_ship", "pickup_in_progress", "in_transit", "delivered", "completed", "payment_expired", "seller_confirmation_expired"]) {
  test(`buyer cannot pay or cancel inactive order state (${state})`, async () => {
    order.status = state;
    render(<MyOrders />);
    await screen.findByRole("button", { name: "ดูรายละเอียด" });
    expect(screen.queryByRole("button", { name: "ยกเลิกคำสั่งซื้อ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ไปชำระเงิน/ })).not.toBeInTheDocument();
  });
}

test("seller acceptance during cancellation shows conflict and reloads confirmed status", async () => {
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation(async (url, options) => {
    if (url.endsWith("/status")) {
      order.status = "confirmed";
      throw new Error("ผู้ขายยืนยันคำสั่งซื้อแล้ว");
    }
    return original(url, options);
  });
  render(<MyOrders />);
  fireEvent.click(await screen.findByRole("button", { name: "ยกเลิกคำสั่งซื้อ" }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกคำสั่งซื้อ" }));
  expect(await screen.findByText("ผู้ขายยืนยันคำสั่งซื้อแล้ว")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("button", { name: "ยกเลิกคำสั่งซื้อ" })).not.toBeInTheDocument());
});
