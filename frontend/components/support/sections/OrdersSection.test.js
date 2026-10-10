import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { apiFetch } from "../../../lib/api";
import OrdersSection from "./OrdersSection";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../ui/ToastProvider", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock("../../ui/ConfirmDialog", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../../ui/RadioSelect", () => ({
  __esModule: true,
  default: () => null,
}));

const user = {
  id: "user-1",
  email: "user@example.test",
  firstName: "Test",
  lastName: "User",
  role: "SELLER",
  roles: ["SELLER"],
  status: "ACTIVE",
  safetySummary: { reportCount: 0, warningCount: 0, suspensionCount: 0 },
  sellerProfile: {
    shopName: "Safe Shop",
    kycStatus: "VERIFIED",
    idCardNumber: "1234567890123",
    bankAccount: "secret-bank",
    address: "secret-address",
  },
};

const emptySafetyHistory = {
  items: [],
  page: 1,
  total: 0,
  totalPages: 1,
};

beforeEach(() => jest.clearAllMocks());

it("shows an order-service failure as unavailable rather than no history", async () => {
  apiFetch.mockImplementation((url) => {
    if (url.includes("/admin/users/user-1/history")) {
      return Promise.resolve(emptySafetyHistory);
    }
    if (url.includes("/support/users/user-1/history")) {
      return Promise.reject(new Error("order service unavailable"));
    }
    return Promise.resolve(user);
  });

  render(<OrdersSection token="token" initialUserId="user-1" />);

  expect(
    await screen.findByText(/ประวัติคำสั่งซื้อไม่พร้อมใช้งาน/),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("ไม่พบประวัติคำสั่งซื้อของผู้ใช้งานรายนี้ในระบบ"),
  ).not.toBeInTheDocument();
});

it("uses API totals, pages user history, and does not render sensitive KYC fields", async () => {
  apiFetch.mockImplementation((url) => {
    if (url.includes("/admin/users/user-1/history")) {
      return Promise.resolve(emptySafetyHistory);
    }
    if (url.includes("/support/users/user-1/history")) {
      const page = new URL(url, "http://test").searchParams.get("page");
      return Promise.resolve({
        items: [
          {
            id: `order-${page}`,
            buyerId: "user-1",
            sellerId: "seller-2",
            status: "completed",
            price: 100,
          },
        ],
        page: Number(page),
        total: 12,
        totalPages: 2,
        summary: { completedOrders: 4 },
      });
    }
    return Promise.resolve(user);
  });

  render(<OrdersSection token="token" initialUserId="user-1" />);

  expect(await screen.findByText("หน้า 1 / 2")).toBeInTheDocument();
  expect(screen.getByText("4")).toBeInTheDocument();
  expect(screen.queryByText("1234567890123")).not.toBeInTheDocument();
  expect(screen.queryByText("secret-bank")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await waitFor(() =>
    expect(
      apiFetch.mock.calls.some(
        ([url]) =>
          url.includes("/support/users/user-1/history") &&
          url.includes("page=2"),
      ),
    ).toBe(true),
  );
});
