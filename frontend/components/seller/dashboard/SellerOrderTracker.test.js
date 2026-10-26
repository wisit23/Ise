import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SellerOrderTracker from "./SellerOrderTracker";
import { apiFetch } from "../../../lib/api";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

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
  it("opens the selected order buyer's chat directly", async () => {
    apiFetch.mockResolvedValue({ id: "buyer-room" });
    render(<SellerOrderTracker orders={[{ ...mockOrders[0], productId: "product-1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /แชท/ }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/chat/buyer-room"));
    expect(apiFetch).toHaveBeenCalledWith("/api/chat/conversations", {
      method: "POST", token: "token",
      body: { contextType: "PRODUCT", productId: "product-1", orderId: mockOrders[0].id },
    });
  });

  it("shows chat failures and lets the seller retry", async () => {
    apiFetch.mockRejectedValueOnce(new Error("ไม่สามารถตรวจสอบคำสั่งซื้อได้"));
    render(<SellerOrderTracker orders={[{ ...mockOrders[0], productId: "product-1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /แชท/ }));
    expect(await screen.findByText("ไม่สามารถตรวจสอบคำสั่งซื้อได้")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /แชท/ })).toBeEnabled();
  });

  it("renders order list with regular and auction badges", () => {
    render(<SellerOrderTracker orders={mockOrders} />);

    expect(screen.getByText("เสื้อยืดวินเทจ")).toBeInTheDocument();
    expect(screen.getByText("นาฬิกาสะสมประมูล")).toBeInTheDocument();

    // Check badges (both button and table badge exist)
    expect(screen.getAllByText("ขายปกติ").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("ประมูล").length).toBeGreaterThanOrEqual(2);
  });

  it("labels and filters payment_expired separately from pending_payment", () => {
    render(<SellerOrderTracker orders={[
      { ...mockOrders[0], status: "payment_expired" },
      { ...mockOrders[1], status: "pending_payment" },
    ]} />);
    expect(screen.getAllByText("หมดเวลาชำระเงิน").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "หมดเวลาชำระเงิน" }));
    expect(screen.getByText("เสื้อยืดวินเทจ")).toBeInTheDocument();
    expect(screen.queryByText("นาฬิกาสะสมประมูล")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "รอชำระเงิน" }));
    expect(screen.queryByText("เสื้อยืดวินเทจ")).not.toBeInTheDocument();
    expect(screen.getByText("นาฬิกาสะสมประมูล")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "เรียกขนส่ง" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /เตรียมสินค้าเรียบร้อย/ })).not.toBeInTheDocument();

    rerender(<SellerOrderTracker orders={[{ ...paidOrder[0], status: "ready_to_ship" }]} />);
    expect(screen.getByRole("button", { name: "เรียกขนส่ง" })).toBeInTheDocument();
    rerender(<SellerOrderTracker orders={[{ ...paidOrder[0], status: "pickup_in_progress" }]} />);
    expect(screen.getByRole("button", { name: "ส่งมอบให้ขนส่งแล้ว" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เรียกขนส่ง" })).not.toBeInTheDocument();
  });

  it("opens shipping details from confirmed without making a status-only request", async () => {
    apiFetch.mockResolvedValue({ id: "o2", sellerId: "seller", status: "confirmed" });
    const onOrderUpdated = jest.fn();
    render(
      <SellerOrderTracker
        orders={[{ ...mockOrders[0], id: "o2", status: "confirmed" }]}
        onOrderUpdated={onOrderUpdated}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "เรียกขนส่ง" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByLabelText("บริษัทขนส่ง")).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
    expect(onOrderUpdated).not.toHaveBeenCalled();
  });

  it("nothing offers completion to the seller", () => {
    render(<SellerOrderTracker orders={[{ ...mockOrders[0], status: "delivered" }]} />);
    expect(screen.queryByRole("button", { name: /ได้รับสินค้า|ยืนยันการรับ/ })).toBeNull();
  });

  it("hides cases and counts before the workflow reaches the seller", () => {
    render(<SellerOrderTracker orders={[{
      ...mockOrders[0], status: "disputed",
      dispute: { id: "hidden", status: "OPEN", sellerVisible: false },
    }]} />);
    expect(screen.queryByRole("link", { name: "ดูข้อพิพาท" })).toBeNull();
    expect(screen.getByText("อยู่ระหว่างตรวจสอบ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ข้อพิพาท" }));
    expect(screen.queryByText(mockOrders[0].productTitle)).toBeNull();
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
          sellerVisible: true,
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

  it("the dispute filter never seeds the search from a highlighted order, so disputes stay visible", () => {
    const orders = [
      mockOrders[0],
      {
        id: "c58a6037-d5aa-4bbb-8ccc-000000000001",
        productTitle: "สินค้ามีข้อพิพาท",
        price: 900,
        status: "disputed",
        createdAt: "2026-10-15T15:00:00.000Z",
        dispute: { id: "disp-9", status: "OPEN", decision: null, sellerVisible: true },
      },
    ];
    const { rerender } = render(
      <SellerOrderTracker orders={orders} highlightOrderId="ORD-1111111111" statusFilter="disputed" />,
    );
    expect(screen.getByPlaceholderText(/ค้นหาชื่อสินค้า/)).toHaveValue("");
    expect(screen.getByText("สินค้ามีข้อพิพาท")).toBeInTheDocument();

    rerender(<SellerOrderTracker orders={orders} highlightOrderId={null} statusFilter="disputed" />);
    expect(screen.getByText("สินค้ามีข้อพิพาท")).toBeInTheDocument();
  });

  it("finds an order by the ORD- number shown on screen", () => {
    const orders = [
      {
        id: "c58a6037-d5aa-4bbb-8ccc-000000000001",
        referenceCode: "ORD-7K3M-9X2R-4T6W",
        productTitle: "สินค้ามีข้อพิพาท",
        price: 900,
        status: "in_transit",
        createdAt: "2026-10-15T15:00:00.000Z",
      },
    ];
    render(<SellerOrderTracker orders={orders} />);
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อสินค้า/), {
      target: { value: "ord7k3m9x2r4t6w" },
    });
    expect(screen.getByText("สินค้ามีข้อพิพาท")).toBeInTheDocument();
  });
});
