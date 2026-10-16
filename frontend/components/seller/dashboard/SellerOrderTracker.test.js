import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SellerOrderTracker from "./SellerOrderTracker";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../../lib/auth", () => ({
  getAccessToken: () => "token",
  getStoredUser: () => ({ id: "seller" }),
}));

const order = (id, status) => ({
  id,
  status,
  sellerId: "seller",
  productTitle: `item ${id}`,
  price: 100,
  createdAt: "2026-10-16T00:00:00Z",
});

beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockImplementation((url, options) =>
    Promise.resolve({ id: url.split("/")[3], status: options.body.status }),
  );
});

test("seller accepts a paid order and marks a confirmed one as packed", async () => {
  const onOrderUpdated = jest.fn();
  render(
    <SellerOrderTracker
      orders={[order("o1", "paid"), order("o2", "confirmed")]}
      onOrderUpdated={onOrderUpdated}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /ยอมรับคำสั่งซื้อ/ }));
  await waitFor(() =>
    expect(onOrderUpdated).toHaveBeenCalledWith({ id: "o1", status: "confirmed" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /เตรียมสินค้าเรียบร้อย/ }));
  await waitFor(() =>
    expect(onOrderUpdated).toHaveBeenCalledWith({
      id: "o2",
      status: "ready_to_ship",
    }),
  );
});

test("rejecting a paid order asks first and then cancels it", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValueOnce(false);
  render(<SellerOrderTracker orders={[order("o1", "paid")]} />);
  fireEvent.click(screen.getByRole("button", { name: "ปฏิเสธ" }));
  expect(apiFetch).not.toHaveBeenCalled();
  confirm.mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole("button", { name: "ปฏิเสธ" }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/o1/status",
      expect.objectContaining({ body: { status: "cancelled" } }),
    ),
  );
  confirm.mockRestore();
});

test("only ready_to_ship orders offer shipping, and nothing offers completion", () => {
  render(
    <SellerOrderTracker
      orders={[order("o1", "confirmed"), order("o2", "ready_to_ship"), order("o3", "delivered")]}
    />,
  );
  expect(screen.getAllByRole("button", { name: /จัดส่งสินค้า/ })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /ได้รับสินค้า|ยืนยันการรับ/ })).toBeNull();
});
