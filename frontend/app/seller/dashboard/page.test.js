import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import SellerDashboardPage from "./page";
import StorePage from "../../store/[sellerId]/page";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { useRouter, useSearchParams, useParams } from "next/navigation";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  useParams: jest.fn(),
}));

jest.mock("../../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../../components/NavBar", () => function MockNavBar() {
  return <div data-testid="mock-navbar">NavBar</div>;
});

jest.mock("../../../components/Footer", () => function MockFooter() {
  return <div data-testid="mock-footer">Footer</div>;
});

jest.mock("../../../components/ProductCard", () => function MockProductCard({ product }) {
  return <div>{product.title}</div>;
});

jest.mock("../../../components/chat/ChatSocketProvider", () => ({
  useChatSocketEvent: jest.fn(),
  useChatSocket: () => ({ socket: null, connected: false }),
}));

const mockPush = jest.fn();

const mockProducts = [
  { id: "p-1", title: "เสื้อยืดวินเทจ", price: 350, status: "available" },
];

const mockOrders = [
  {
    id: "ORD-999999",
    productId: "p-1",
    productTitle: "เสื้อยืดวินเทจ",
    price: 350,
    status: "paid",
    createdAt: new Date().toISOString(),
  },
  {
    id: "ORD-111111",
    productId: "p-2",
    productTitle: "กางเกงยีนส์",
    price: 800,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  },
];

describe("SellerDashboardPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
    getAccessToken.mockReturnValue("mock-token");
    getStoredUser.mockReturnValue({ id: "seller-1", role: "SELLER" });

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "VERIFIED" });
      }
      if (url.includes("/api/products/mine")) {
        return Promise.resolve({ items: mockProducts });
      }
      if (url.includes("/api/orders/selling")) {
        return Promise.resolve({ items: mockOrders });
      }
      if (url.includes("/api/auth/users/seller-1/public")) {
        return Promise.resolve({ shopName: "ร้านทดสอบ" });
      }
      if (url.includes("/api/reviews/by-seller/")) {
        return Promise.resolve({ items: [], total: 0, averageRating: 0, totalPages: 1 });
      }
      if (url === "/api/auth/shop/profile") {
        return Promise.resolve({ shopName: "ร้านทดสอบ", address: "กรุงเทพฯ" });
      }
      return Promise.resolve({});
    });
  });

  it("opens product clips from the sidebar and mobile menu", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams(""));
    render(<SellerDashboardPage />);
    const clipsButton = await screen.findByRole("button", { name: /คลิปสินค้า/ });
    const sidebarButtons = within(clipsButton.closest("nav")).getAllByRole("button");
    const productIndex = sidebarButtons.findIndex((button) => button.textContent.includes("รายการสินค้า"));
    expect(sidebarButtons[productIndex + 1]).toBe(clipsButton);
    fireEvent.click(clipsButton);
    expect(await screen.findByRole("link", { name: "อัปโหลดคลิปใหม่" })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/products/videos/mine?page=1&limit=12", expect.objectContaining({ token: "mock-token" }));
    fireEvent.click(screen.getByRole("button", { name: /แดชบอร์ด/ }));
    fireEvent.click(screen.getAllByRole("button").find((button) => button.getAttribute("aria-haspopup") === "listbox"));
    fireEvent.click(screen.getByRole("radio", { name: "คลิปสินค้า" }));
    expect(await screen.findByRole("heading", { name: "คลิปสินค้า" })).toBeInTheDocument();
  });

  it("renders default dashboard overview when no query params", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams(""));

    render(<SellerDashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "แดชบอร์ด" })).toBeInTheDocument();
    });
    expect(screen.queryByText(/แสดงรายละเอียดคำสั่งซื้อที่เลือก:/)).not.toBeInTheDocument();
  });

  it("adds rounded net revenue per completed order in the dashboard totals", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams(""));
    const year = new Date().getFullYear();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) return Promise.resolve({ kycStatus: "VERIFIED" });
      if (url.includes("/api/products/mine")) return Promise.resolve({ items: mockProducts });
      if (url.includes("/api/orders/selling")) {
        return Promise.resolve({ items: [
          { id: "ORD-1", productId: "p-1", finalPrice: 50, status: "completed", createdAt: `${year}-01-15T10:00:00.000Z` },
          { id: "ORD-2", productId: "p-1", finalPrice: 50, status: "completed", createdAt: `${year}-01-15T11:00:00.000Z` },
        ] });
      }
      return Promise.resolve({});
    });

    render(<SellerDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("ยอดรวมปีนี้: ฿98")).toBeInTheDocument();
    });
    expect(screen.getByText("สะสมสุทธิล่าสุด: ฿98")).toBeInTheDocument();
    expect(screen.getAllByText("฿98").length).toBeGreaterThanOrEqual(1);
  });

  it("includes orders beyond the first API page in revenue totals", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams(""));
    const year = new Date().getFullYear();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) return Promise.resolve({ kycStatus: "VERIFIED" });
      if (url.includes("/api/products/mine")) return Promise.resolve({ items: mockProducts, totalPages: 1 });
      if (url.includes("/api/orders/selling") && url.includes("page=2")) {
        return Promise.resolve({ items: [{ id: "ORD-51", finalPrice: 10000, status: "completed", createdAt: `${year}-01-15T10:00:00.000Z` }] });
      }
      if (url.includes("/api/orders/selling")) {
        return Promise.resolve({
          items: Array.from({ length: 50 }, (_, i) => ({ id: `ORD-${i}`, finalPrice: 100, status: "completed", createdAt: `${year}-01-15T10:00:00.000Z` })),
          totalPages: 2,
        });
      }
      return Promise.resolve({});
    });
    render(<SellerDashboardPage />);
    await waitFor(() => expect(screen.getByText("ยอดรวมปีนี้: ฿14,550")).toBeInTheDocument());
    expect(apiFetch).toHaveBeenCalledWith("/api/orders/selling?page=2&limit=50", { token: "mock-token" });
  });

  it("automatically opens 'ติดตามออเดอร์' tab and highlights product when orderId is provided from notification", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams("orderId=ORD-999999"));

    render(<SellerDashboardPage />);

    // Should automatically land in "ติดตามออเดอร์" (Order tracking) section
    await waitFor(() => {
      expect(screen.getByText("แสดงรายละเอียดคำสั่งซื้อที่เลือก:")).toBeInTheDocument();
    });

    // The orderId should be pinned and displayed in the banner
    expect(screen.getByText("ORD-999999")).toBeInTheDocument();

    // The order should be displayed with its action button directly visible
    expect(screen.getByText("ยืนยันรับออเดอร์")).toBeInTheDocument();
  });

  it("opens 'ติดตามออเดอร์' tab when section=orders is in search params", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams("section=orders&orderId=ORD-111111"));

    render(<SellerDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("แสดงรายละเอียดคำสั่งซื้อที่เลือก:")).toBeInTheDocument();
    });

    expect(screen.getByText("ORD-111111")).toBeInTheDocument();
    expect(screen.getByText("กางเกงยีนส์")).toBeInTheDocument();
  });

  it("opens the store inside the panel from the mobile section dropdown", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams(""));
    render(<SellerDashboardPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "แดชบอร์ด" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /ร้านค้าของฉัน/ })).not.toBeInTheDocument();
    const radioSelectTrigger = screen.getAllByRole("button").find(b => b.getAttribute("aria-haspopup") === "listbox");
    expect(radioSelectTrigger).toBeInTheDocument();
    fireEvent.click(radioSelectTrigger);
    const storeOption = screen.getByRole("radio", { name: "ร้านค้าของฉัน" });
    expect(storeOption).toBeInTheDocument();
    fireEvent.click(storeOption);
    expect(await screen.findByRole("heading", { name: "ร้านทดสอบ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ร้านค้าของฉัน" })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps the sidebar and one panel shell while viewing and editing the store", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams(""));
    render(<SellerDashboardPage />);
    const storeButton = await screen.findByRole("button", { name: /ร้านค้าของฉัน/ });
    fireEvent.click(storeButton);
    expect(await screen.findByRole("heading", { name: "ร้านทดสอบ" })).toBeInTheDocument();
    expect(screen.getAllByTestId("mock-navbar")).toHaveLength(1);
    expect(screen.getAllByTestId("mock-footer")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(storeButton).toHaveClass("bg-emerald-600");
    fireEvent.click(screen.getByRole("button", { name: /แก้ไขข้อมูลร้านค้า/ }));
    const dialog = await screen.findByRole("dialog", { name: "แก้ไขข้อมูลร้านค้า" });
    expect(await within(dialog).findByDisplayValue("ร้านทดสอบ")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByDisplayValue("ร้านทดสอบ"), { target: { value: "ชื่อร้านใหม่" } });
    fireEvent.change(within(dialog).getByPlaceholderText(/กรุณาระบุรายละเอียดให้ Trust and Safety/), { target: { value: "เปลี่ยนชื่อร้าน" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "ส่งให้ Trust and Safety ตรวจสอบ" }));
    expect(await within(dialog).findByText("ส่งคำขอสำเร็จเรียบร้อย")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/shop/change-request", expect.objectContaining({
      method: "POST", token: "mock-token", body: expect.objectContaining({ shopName: "ชื่อร้านใหม่", comment: "เปลี่ยนชื่อร้าน" }),
    }));
    fireEvent.click(within(dialog).getByRole("button", { name: "เข้าใจแล้ว" }));
    fireEvent.click(screen.getByRole("button", { name: /แดชบอร์ด/ }));
    expect(screen.getByRole("heading", { name: "แดชบอร์ด" })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens the store section directly from its query parameter", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams("section=my_store"));
    render(<SellerDashboardPage />);
    expect(await screen.findByRole("heading", { name: "ร้านทดสอบ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ร้านค้าของฉัน" })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("preserves the standalone public store for visitors", async () => {
    useParams.mockReturnValue({ sellerId: "seller-1" });
    getStoredUser.mockReturnValue(null);
    apiFetch.mockImplementation((url) => {
      if (url.includes("/public")) return Promise.resolve({ shopName: "ร้านสาธารณะ" });
      return Promise.resolve({ items: [], total: 0, averageRating: 0, totalPages: 1 });
    });
    render(<StorePage />);
    expect(await screen.findByRole("heading", { name: "ร้านสาธารณะ", level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("mock-footer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /แก้ไขข้อมูลร้านค้า/ })).not.toBeInTheDocument();
  });
});
