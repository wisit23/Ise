import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SellerDashboardPage from "./page";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { useRouter, useSearchParams } from "next/navigation";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
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
      return Promise.resolve({});
    });
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

  it("includes ร้านค้าของฉัน in mobile section dropdown and navigates to seller store when selected", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams(""));
    render(<SellerDashboardPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "แดชบอร์ด" })).toBeInTheDocument();
    });
    const storeLinks = screen.getAllByRole("link", { name: /ร้านค้าของฉัน/ });
    const desktopStoreLink = storeLinks.find((l) => l.className.includes("border-slate-200"));
    expect(desktopStoreLink).toHaveClass("hidden", "sm:flex");
    const radioSelectTrigger = screen.getAllByRole("button").find(b => b.getAttribute("aria-haspopup") === "listbox");
    expect(radioSelectTrigger).toBeInTheDocument();
    fireEvent.click(radioSelectTrigger);
    const storeOption = screen.getByRole("radio", { name: "ร้านค้าของฉัน" });
    expect(storeOption).toBeInTheDocument();
    fireEvent.click(storeOption);
    expect(mockPush).toHaveBeenCalledWith("/store/seller-1");
  });
});
