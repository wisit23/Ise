import { render, screen, fireEvent } from "@testing-library/react";
import CampaignsPage from "./page";
import { apiFetch } from "../../lib/api";
import {
  getAccessToken,
  getStoredUser,
  getCurrentRoles,
  isCustomerAccountRoles,
} from "../../lib/auth";

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
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
  getCurrentRoles: jest.fn(),
  isCustomerAccountRoles: jest.fn(),
}));

describe("CampaignsPage (Buyer Voucher Hub)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    getAccessToken.mockReturnValue("fake-token");
    getStoredUser.mockReturnValue({ id: "user-1", email: "buyer@example.com" });
    getCurrentRoles.mockReturnValue(["BUYER"]);
    isCustomerAccountRoles.mockReturnValue(true);
  });

  it("shows empty state when no available campaigns exist", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/campaigns/available")) {
        return Promise.resolve([]);
      }
      if (url.includes("/api/products/campaigns/my-vouchers")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<CampaignsPage />);

    expect(
      await screen.findByText("ยังไม่มีคูปองส่วนลดในขณะนี้"),
    ).toBeInTheDocument();
  });

  it("renders available campaign card with discount and code", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/campaigns/available")) {
        return Promise.resolve([
          {
            id: "camp-test-1",
            name: "Flash Sale ต้อนรับเปิดเทอม",
            code: "BACK2SCHOOL",
            description: "ลดแรงทุกชิ้นในหมวดหมู่เสื้อผ้า",
            discountType: "PERCENT",
            discountValue: 20,
            maxDiscount: 200,
            minOrderPrice: 500,
            startsAt: "2026-09-01T00:00:00.000Z",
            endsAt: "2026-09-30T23:59:59.000Z",
            status: "published",
            usageLimit: 100,
            usedCount: 15,
          },
        ]);
      }
      if (url.includes("/api/products/campaigns/my-vouchers")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<CampaignsPage />);

    expect(
      await screen.findByText("Flash Sale ต้อนรับเปิดเทอม"),
    ).toBeInTheDocument();
    expect(screen.getByText("BACK2SCHOOL")).toBeInTheDocument();
    expect(screen.getByText(/20%/)).toBeInTheDocument();
    expect(screen.getByText("เก็บคูปอง")).toBeInTheDocument();
  });

  it("switches to wallet tab and displays claimed vouchers", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/campaigns/available")) {
        return Promise.resolve([]);
      }
      if (url.includes("/api/products/campaigns/my-vouchers")) {
        return Promise.resolve([
          {
            id: "vouch-1",
            userId: "user-1",
            campaignId: "camp-test-1",
            status: "CLAIMED",
            claimedAt: "2026-09-12T10:00:00.000Z",
            campaign: {
              name: "คูปองต้อนรับสมาชิกใหม่",
              code: "WELCOME100",
              discountType: "FIXED",
              discountValue: 100,
              minOrderPrice: 300,
              startsAt: "2026-09-01T00:00:00.000Z",
              endsAt: "2026-09-30T23:59:59.000Z",
              status: "published",
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<CampaignsPage />);

    const walletTabButton = await screen.findByRole("button", {
      name: /คูปองของฉัน/i,
    });
    fireEvent.click(walletTabButton);

    expect(
      await screen.findByText("คูปองต้อนรับสมาชิกใหม่"),
    ).toBeInTheDocument();
    expect(screen.getByText("WELCOME100")).toBeInTheDocument();
    expect(screen.getByText("ลด ฿100")).toBeInTheDocument();
  });

  it.each(["EXECUTIVE", "ADMIN", "CUSTOMER_SERVICE"])(
    "does not let %s collect or open a voucher wallet",
    async (role) => {
      getCurrentRoles.mockReturnValue([role]);
      isCustomerAccountRoles.mockReturnValue(false);
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/campaigns/available")) {
          return Promise.resolve([
            {
              id: "camp-staff-test",
              name: "Staff restriction test",
              code: "STAFF-NO-CLAIM",
              discountType: "FIXED",
              discountValue: 50,
              minOrderPrice: 0,
              startsAt: "2026-09-01T00:00:00.000Z",
              endsAt: "2026-12-31T23:59:59.000Z",
              status: "published",
              usageLimit: 100,
              usedCount: 0,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      render(<CampaignsPage />);

      expect(
        await screen.findByText("บัญชีเจ้าหน้าที่ไม่สามารถเก็บคูปองได้"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "เก็บคูปอง" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /คูปองของฉัน/i }),
      ).not.toBeInTheDocument();
      expect(apiFetch).not.toHaveBeenCalledWith(
        "/api/products/campaigns/my-vouchers",
        expect.anything(),
      );
    },
  );
});
