import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { apiFetch } from "../../lib/api";
import OrderConfirmationModal from "./OrderConfirmationModal";

jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({
  getAccessToken: () => "token",
  getStoredUser: () => ({ id: "seller", role: "SELLER" }),
}));

const mockOrder = {
  id: "ORD-CONFIRM-1",
  sellerId: "seller",
  productTitle: "เสื้อวินเทจสุดเท่",
  price: 500,
  ordersAmount: 500,
  status: "paid",
  shipping: {
    addressSnapshot: {
      recipientName: "สมชาย ใจดี",
      phone: "0812345678",
      addressLine: "123/45 ถนนสุขุมวิท",
      subdistrict: "คลองเตย",
      district: "คลองเตย",
      province: "กรุงเทพมหานคร",
      postalCode: "10110",
    },
  },
};

describe("OrderConfirmationModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders product summary and buyer delivery details without shipping inputs", async () => {
    apiFetch.mockResolvedValue(mockOrder);
    render(
      <OrderConfirmationModal
        orderId={mockOrder.id}
        initialOrder={mockOrder}
        isOpen
        onClose={() => {}}
      />,
    );

    expect(
      await screen.findByText("รายละเอียดคำสั่งซื้อ & ที่อยู่จัดส่ง"),
    ).toBeInTheDocument();
    expect(await screen.findByText("เสื้อวินเทจสุดเท่")).toBeInTheDocument();
    expect(await screen.findByText("สมชาย ใจดี")).toBeInTheDocument();
    expect(await screen.findByText(/123\/45 ถนนสุขุมวิท/)).toBeInTheDocument();

    // Must NOT have shipment inputs (company / tracking number)
    expect(screen.queryByLabelText("บริษัทขนส่ง")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("เลขติดตามพัสดุ")).not.toBeInTheDocument();

    // Must have action buttons: ปิด, ปฏิเสธ, ยืนยันรับออเดอร์
    expect(screen.getByRole("button", { name: "ปิด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ปฏิเสธ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยืนยันรับออเดอร์" })).toBeInTheDocument();
  });

  it("calls /confirm endpoint when seller clicks ยืนยันรับออเดอร์", async () => {
    const updatedOrder = { ...mockOrder, status: "confirmed" };
    apiFetch.mockResolvedValue(updatedOrder);
    const onConfirmed = jest.fn();
    const onOrderUpdated = jest.fn();

    render(
      <OrderConfirmationModal
        orderId={mockOrder.id}
        initialOrder={mockOrder}
        isOpen
        onClose={() => {}}
        onConfirmed={onConfirmed}
        onOrderUpdated={onOrderUpdated}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "ยืนยันรับออเดอร์" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/orders/${mockOrder.id}/confirm`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(onConfirmed).toHaveBeenCalledWith(updatedOrder);
    expect(onOrderUpdated).toHaveBeenCalledWith(updatedOrder);
  });

  it("shows rejection view with reason when seller clicks ปฏิเสธ and calls /reject endpoint", async () => {
    const cancelledOrder = { ...mockOrder, status: "cancelled" };
    apiFetch.mockResolvedValue(cancelledOrder);
    const onRejected = jest.fn();
    const onOrderUpdated = jest.fn();

    render(
      <OrderConfirmationModal
        orderId={mockOrder.id}
        initialOrder={mockOrder}
        isOpen
        onClose={() => {}}
        onRejected={onRejected}
        onOrderUpdated={onOrderUpdated}
      />,
    );

    // Click "ปฏิเสธ" button
    const rejectBtn = screen.getByRole("button", { name: "ปฏิเสธ" });
    fireEvent.click(rejectBtn);

    // Shows warning & reason input
    expect(screen.getByText("คำเตือนเกี่ยวกับการปฏิเสธออเดอร์")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/สินค้าหมดสต็อก/)).toBeInTheDocument();

    // Select preset reason or type reason
    fireEvent.click(screen.getByText("สินค้าหมดสต็อก"));

    // Confirm rejection
    const confirmRejectBtn = screen.getByRole("button", { name: "ยืนยันการปฏิเสธออเดอร์" });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/orders/${mockOrder.id}/reject`,
        expect.objectContaining({
          method: "POST",
          body: { reason: "สินค้าหมดสต็อก" },
        }),
      );
    });

    expect(onRejected).toHaveBeenCalledWith(cancelledOrder);
    expect(onOrderUpdated).toHaveBeenCalledWith(cancelledOrder);
  });
});
