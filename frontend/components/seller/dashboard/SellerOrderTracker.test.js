import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SellerOrderTracker from "./SellerOrderTracker";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../../lib/auth", () => ({
  getAccessToken: () => "token",
  getStoredUser: () => ({ id: "seller" }),
}));

const mockOrders = [
  {
    id: "ORD-1111111111",
    productTitle: "เสื้อยืดวินเทจ",
    price: 500,
    status: "completed",
    createdAt: "2026-10-15T10:00:00.000Z",
    orderType: "NORMAL",
  },
  {
    id: "AUC-2222222222",
    productTitle: "นาฬิกาสะสมประมูล",
    price: 3500,
    status: "completed",
    createdAt: "2026-10-15T12:00:00.000Z",
    orderType: "AUCTION",
    auctionId: "auc-999",
  },
];

describe("SellerOrderTracker", () => {
  it("renders order list with regular and auction badges", () => {
    render(<SellerOrderTracker orders={mockOrders} />);

    expect(screen.getByText("เสื้อยืดวินเทจ")).toBeInTheDocument();
    expect(screen.getByText("นาฬิกาสะสมประมูล")).toBeInTheDocument();

    // Check badges (both button and table badge exist)
    expect(screen.getAllByText("ขายปกติ").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("ประมูล").length).toBeGreaterThanOrEqual(2);
  });

  it("filters orders by order type (regular vs auction)", () => {
    render(<SellerOrderTracker orders={mockOrders} />);

    // Click "ขายปกติ"
    fireEvent.click(screen.getByRole("button", { name: "ขายปกติ" }));
    expect(screen.getByText("เสื้อยืดวินเทจ")).toBeInTheDocument();
    expect(screen.queryByText("นาฬิกาสะสมประมูล")).not.toBeInTheDocument();

    // Click "ประมูล"
    fireEvent.click(screen.getByRole("button", { name: "ประมูล" }));
    expect(screen.queryByText("เสื้อยืดวินเทจ")).not.toBeInTheDocument();
    expect(screen.getByText("นาฬิกาสะสมประมูล")).toBeInTheDocument();

    // Click "ทุกประเภท"
    fireEvent.click(screen.getByRole("button", { name: "ทุกประเภท" }));
    expect(screen.getByText("เสื้อยืดวินเทจ")).toBeInTheDocument();
    expect(screen.getByText("นาฬิกาสะสมประมูล")).toBeInTheDocument();
  });

  it("paid orders offer confirm/reject, confirmed ones the prepare step, ready-to-ship ones shipping", () => {
    const paidOrder = [
      {
        id: "ORD-3333333333",
        productTitle: "กางเกงยีนส์วินเทจ",
        price: 800,
        status: "paid",
        createdAt: "2026-10-15T14:00:00.000Z",
        orderType: "NORMAL",
      },
    ];
    const { rerender } = render(<SellerOrderTracker orders={paidOrder} />);

    expect(screen.getByText("ยืนยันรับออเดอร์")).toBeInTheDocument();
    expect(screen.getByText("ปฏิเสธออเดอร์")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "จัดส่งสินค้า" })).not.toBeInTheDocument();

    const confirmedOrder = [{ ...paidOrder[0], status: "confirmed" }];
    rerender(<SellerOrderTracker orders={confirmedOrder} />);

    expect(screen.queryByText("ยืนยันรับออเดอร์")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "จัดส่งสินค้า" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /เตรียมสินค้าเรียบร้อย/ })).toBeInTheDocument();

    rerender(<SellerOrderTracker orders={[{ ...paidOrder[0], status: "ready_to_ship" }]} />);
    expect(screen.getByRole("button", { name: "จัดส่งสินค้า" })).toBeInTheDocument();
  });

  it("marks a confirmed order as packed through the lifecycle status", async () => {
    apiFetch.mockResolvedValue({ id: "o2", status: "ready_to_ship" });
    const onOrderUpdated = jest.fn();
    render(
      <SellerOrderTracker
        orders={[{ ...mockOrders[0], id: "o2", status: "confirmed" }]}
        onOrderUpdated={onOrderUpdated}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /เตรียมสินค้าเรียบร้อย/ }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/orders/o2/status",
        expect.objectContaining({ method: "PATCH", body: { status: "ready_to_ship" } }),
      ),
    );
    expect(onOrderUpdated).toHaveBeenCalledWith({ id: "o2", status: "ready_to_ship" });
  });

  it("nothing offers completion to the seller", () => {
    render(<SellerOrderTracker orders={[{ ...mockOrders[0], status: "delivered" }]} />);
    expect(screen.queryByRole("button", { name: /ได้รับสินค้า|ยืนยันการรับ/ })).toBeNull();
  });

  it("decreases disputeCount when disputes are decided/completed", () => {
    const ordersWithDisputes = [
      {
        id: "ORD-ACTIVE-DISPUTE",
        productTitle: "สินค้ากำลังพิพาท",
        price: 1000,
        status: "disputed",
        createdAt: "2026-10-15T15:00:00.000Z",
        dispute: {
          id: "disp-1",
          status: "OPEN",
          decision: null,
        },
      },
      {
        id: "ORD-DECIDED-DISPUTE",
        productTitle: "สินค้าตัดสินข้อพิพาทแล้ว",
        price: 2000,
        status: "refunded",
        createdAt: "2026-10-15T16:00:00.000Z",
        dispute: {
          id: "disp-2",
          status: "DECIDED",
          decision: "APPROVE_REFUND",
        },
      },
    ];

    render(<SellerOrderTracker orders={ordersWithDisputes} />);

    // Only the 1 active dispute should be counted in the badge
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("อยู่ระหว่างพิจารณา")).toBeInTheDocument();
    expect(screen.getByText("พิจารณาแล้ว")).toBeInTheDocument();
  });
});

