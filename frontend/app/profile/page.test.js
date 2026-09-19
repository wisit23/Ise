import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProfilePage from "./page";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";

jest.mock(
  "../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock(
  "../../components/Footer",
  () =>
    function MockFooter() {
      return <footer aria-label="footer" />;
    },
);

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
  getRefreshToken: jest.fn(),
  saveSession: jest.fn(),
}));

const USER = {
  id: "u-1",
  firstName: "สมชาย",
  lastName: "ใจดี",
  email: "somchai@example.com",
  phone: "0812345678",
  role: "BUYER",
};

const ORDERS_RESPONSE = {
  items: [
    {
      id: "order-1",
      productId: "product-1",
      productTitle: "เสื้อเชิ้ตจากฐานข้อมูล",
      price: 890,
      status: "pending_payment",
      checkoutSessionId: "checkout-qr-1",
      createdAt: "2025-04-12T00:00:00.000Z",
    },
    {
      id: "order-2",
      productId: "product-2",
      productTitle: "กระเป๋าที่ซื้อสำเร็จ",
      price: 1290,
      status: "completed",
      dispute: null,
      createdAt: "2025-04-11T00:00:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  totalPages: 1,
};

const SAVED_ADDRESSES = [
  {
    id: "address-1",
    recipientName: "สมชาย ใจดี",
    phone: "0812345678",
    addressLine: "99 ถนนสุขุมวิท",
    subdistrict: "คลองเตย",
    district: "คลองเตย",
    province: "กรุงเทพมหานคร",
    postalCode: "10110",
    isDefault: true,
  },
];

describe("ProfilePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAccessToken.mockReturnValue("test-token");
    getStoredUser.mockReturnValue(USER);
    apiFetch.mockImplementation((path) => {
      if (path === "/api/auth/me") return Promise.resolve(USER);
      if (path === "/api/auth/me/addresses") {
        return Promise.resolve(SAVED_ADDRESSES);
      }
      if (path === "/api/orders/mine?limit=50") {
        return Promise.resolve(ORDERS_RESPONSE);
      }
      if (path === "/api/reviews/mine?limit=50") {
        return Promise.resolve({ items: [], totalPages: 1 });
      }
      return Promise.resolve(null);
    });
  });

  it("redirects to login when unauthenticated", () => {
    getAccessToken.mockReturnValue(null);
    render(<ProfilePage />);
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("loads profile, addresses, and real orders from Docker-backed APIs", async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/me", {
        token: "test-token",
      });
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/me/addresses", {
        token: "test-token",
      });
      expect(apiFetch).toHaveBeenCalledWith("/api/orders/mine?limit=50", {
        token: "test-token",
      });
    });
  });

  it("renders profile summary and 4 order status shortcuts", () => {
    render(<ProfilePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "สมชาย ใจดี",
    );
    expect(screen.getByText(/somchai@example\.com/)).toBeInTheDocument();
    expect(screen.getByText("ผู้ซื้อ")).toBeInTheDocument();

    // 4 statuses provided by order-service
    expect(screen.getByText("รอชำระเงิน")).toBeInTheDocument();
    expect(screen.getByText("รอยืนยัน")).toBeInTheDocument();
    expect(screen.getByText("จัดส่งแล้ว")).toBeInTheDocument();
    expect(screen.getByText("สำเร็จ")).toBeInTheDocument();
  });

  it("shows only order-service data when clicking a status shortcut", async () => {
    render(<ProfilePage />);

    const pendingPaymentButton = screen.getByRole("button", {
      name: /รอชำระเงิน/i,
    });
    fireEvent.click(pendingPaymentButton);

    expect(screen.getByText("สถานะสินค้าและคำสั่งซื้อ")).toBeInTheDocument();
    expect(await screen.findByText("เสื้อเชิ้ตจากฐานข้อมูล")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปชำระเงิน/i })).toHaveAttribute(
      "href",
      "/payment/checkout-qr-1",
    );
    expect(screen.queryByText(/Levi's 90s Vintage/)).not.toBeInTheDocument();
  });

  it("shows review and report actions for an unreviewed completed order", async () => {
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /สำเร็จ/i }));

    expect(await screen.findByText("กระเป๋าที่ซื้อสำเร็จ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "รีวิว" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "รายงาน" })).toBeInTheDocument();
  });

  it("switches to addresses tab and shows address list and allows adding address", async () => {
    render(<ProfilePage />);

    const addressTabBtn = screen.getByRole("button", {
      name: /ที่อยู่จัดส่ง/i,
    });
    fireEvent.click(addressTabBtn);

    expect(screen.getByText("ที่อยู่สำหรับจัดส่ง")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("สมชาย ใจดี").length).toBeGreaterThanOrEqual(
        2,
      );
      expect(screen.getByText("ค่าเริ่มต้น")).toBeInTheDocument();
    });

    // Open add address modal
    const addBtn = screen.getByRole("button", { name: /เพิ่มที่อยู่ใหม่/i });
    fireEvent.click(addBtn);

    expect(screen.getByText("เพิ่มที่อยู่จัดส่งใหม่")).toBeInTheDocument();
  });

  it("switches to coupons tab and allows redeeming coupon code", async () => {
    render(<ProfilePage />);

    const couponTabBtn = screen.getByRole("button", {
      name: /โค้ดส่วนลดของฉัน/i,
    });
    fireEvent.click(couponTabBtn);

    expect(
      screen.getByRole("heading", { name: "โค้ดส่วนลดของฉัน" }),
    ).toBeInTheDocument();
    expect(screen.getByText("RELOOPNEW")).toBeInTheDocument();

    // Type a new coupon
    const input = screen.getByPlaceholderText(/กรอกรหัสส่วนลด เช่น NEW50/i);
    fireEvent.change(input, { target: { value: "PROMO100" } });

    const redeemBtn = screen.getByRole("button", { name: /เก็บโค้ด/i });
    fireEvent.click(redeemBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/เก็บโค้ด "PROMO100" สำเร็จแล้ว/i),
      ).toBeInTheDocument();
      expect(screen.getByText("PROMO100")).toBeInTheDocument();
    });
  });
});
