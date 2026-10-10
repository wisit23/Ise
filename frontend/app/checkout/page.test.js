import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CheckoutPage from "./page";
import { apiFetch } from "../../lib/api";

jest.mock(
  "../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav />;
    },
);
jest.mock(
  "../../components/Footer",
  () =>
    function MockFooter() {
      return <footer />;
    },
);
jest.mock(
  "../../components/OrderLine",
  () =>
    function MockOrderLine({ order }) {
      return <div>{order.productTitle}</div>;
    },
);

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: () => "buyer-token",
}));

jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));

const ORDER = {
  id: "order-1",
  productTitle: "เสื้อแจ็คเก็ตวินเทจ",
  price: 1000,
  campaignId: "campaign-1",
  campaignCode: "SAVE200",
  discountAmount: 200,
  finalPrice: 800,
  status: "pending_payment",
  reservationExpiresAt: "2099-08-10T12:10:00.000Z",
  createdAt: "2099-08-10T12:00:00.000Z",
};

const ADDRESS = {
  id: "address-1",
  recipientName: "สมชาย ใจดี",
  phone: "0812345678",
  addressLine: "99 ถนนสุขุมวิท",
  subdistrict: "คลองเตย",
  district: "คลองเตย",
  province: "กรุงเทพมหานคร",
  postalCode: "10110",
  isDefault: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/checkout?orders=order-1");
  apiFetch.mockImplementation((path, options = {}) => {
    if (path === "/api/orders/order-1") return Promise.resolve(ORDER);
    if (path === "/api/auth/me/addresses") return Promise.resolve([ADDRESS]);
    if (path === "/api/orders/checkout-sessions" && options.method === "POST") {
      return Promise.resolve({ id: "session-1" });
    }
    return Promise.reject(new Error(`unexpected request: ${path}`));
  });
});

test("shows the Marketing voucher and its server-calculated order summary", async () => {
  render(<CheckoutPage />);

  expect(
    (await screen.findAllByText("เสื้อแจ็คเก็ตวินเทจ")).length,
  ).toBeGreaterThanOrEqual(2);
  expect(screen.getByText("สมชาย ใจดี")).toBeInTheDocument();

  expect(screen.getByText("SAVE200")).toBeInTheDocument();
  expect(screen.getAllByText("-฿200")).toHaveLength(2);
  expect(screen.getByText("฿800")).toBeInTheDocument();
});

test("creates a checkout session before opening the QR page", async () => {
  render(<CheckoutPage />);
  await screen.findAllByText("เสื้อแจ็คเก็ตวินเทจ");

  fireEvent.click(screen.getByRole("button", { name: /ยืนยันและไปสแกน QR/i }));

  await waitFor(() => {
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/checkout-sessions",
      expect.objectContaining({
        method: "POST",
        token: "buyer-token",
        body: expect.objectContaining({
          orderIds: ["order-1"],
          shippingAddress: ADDRESS,
        }),
      }),
    );
    const checkoutCall = apiFetch.mock.calls.find(
      ([path]) => path === "/api/orders/checkout-sessions",
    );
    expect(checkoutCall[1].body).not.toHaveProperty("couponCode");
    expect(push).toHaveBeenCalledWith("/payment/session-1");
  });
});
