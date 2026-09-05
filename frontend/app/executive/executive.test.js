import { render, screen } from "@testing-library/react";
import ExecutiveDashboardPage from "./page";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";

jest.mock(
  "../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const META = { definitionVersion: "v1", timezone: "Asia/Bangkok" };

describe("ExecutiveDashboardPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    getAccessToken.mockReturnValue("token");
    getStoredUser.mockReturnValue({
      role: "EXECUTIVE",
      firstName: "อัสนัย",
    });
  });

  it("restricts the page to Executive accounts", async () => {
    getStoredUser.mockReturnValue({ role: "BUYER", firstName: "ผู้ซื้อ" });

    render(<ExecutiveDashboardPage />);

    expect(
      await screen.findByText("หน้านี้ใช้ได้เฉพาะบัญชีผู้บริหารเท่านั้น"),
    ).toBeInTheDocument();
  });

  it("renders KPI values once every provider responds", async () => {
    apiFetch.mockImplementation((path) => {
      if (path.startsWith("/api/auth/executive/metrics")) {
        return Promise.resolve({
          data: { activeUsers: 4, newUsers: 11 },
          meta: META,
        });
      }
      if (path.startsWith("/api/orders/executive/metrics")) {
        return Promise.resolve({
          data: { gmv: 100000, platformRevenue: 10000, completedOrders: 2 },
          meta: META,
        });
      }
      return Promise.resolve({
        data: { newListings: 17, soldListings: 3, activeListings: 14 },
        meta: META,
      });
    });

    render(<ExecutiveDashboardPage />);

    expect(await screen.findByText("฿100,000")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("exposes the trend series to screen readers, since the tooltip is pointer-only", async () => {
    apiFetch.mockImplementation((path) => {
      if (path.startsWith("/api/auth/executive/metrics")) {
        return Promise.resolve({
          data: { activeUsers: 4, newUsers: 11 },
          meta: META,
        });
      }
      if (path.startsWith("/api/orders/executive/metrics")) {
        return Promise.resolve({
          data: { gmv: 100000, platformRevenue: 10000, completedOrders: 2 },
          meta: META,
        });
      }
      return Promise.resolve({
        data: { newListings: 17, soldListings: 3, activeListings: 14 },
        meta: META,
      });
    });

    render(<ExecutiveDashboardPage />);

    const gmvChart = await screen.findByRole("img", {
      name: /แนวโน้มยอดขายรวม \(GMV\)/,
    });
    expect(gmvChart).toHaveAccessibleName(/฿100,000/);
  });

  it("shows an unavailable state for a provider that fails, without masking it as zero", async () => {
    apiFetch.mockImplementation((path) => {
      if (path.startsWith("/api/products/executive/metrics")) {
        return Promise.reject(new Error("product-service unreachable"));
      }
      if (path.startsWith("/api/auth/executive/metrics")) {
        return Promise.resolve({
          data: { activeUsers: 4, newUsers: 11 },
          meta: META,
        });
      }
      return Promise.resolve({
        data: { gmv: 100000, platformRevenue: 10000, completedOrders: 2 },
        meta: META,
      });
    });

    render(<ExecutiveDashboardPage />);

    expect(await screen.findByText("฿100,000")).toBeInTheDocument();
    const unavailable = await screen.findAllByText("ไม่พร้อมใช้งาน");
    expect(unavailable.length).toBeGreaterThan(0);
  });
});
