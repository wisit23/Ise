import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PaymentPage from "./page";
import { apiFetch } from "../../../lib/api";

jest.mock(
  "../../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav />;
    },
);
jest.mock(
  "../../../components/Footer",
  () =>
    function MockFooter() {
      return <footer />;
    },
);

jest.mock("qrcode", () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn(() => Promise.resolve("data:image/png;base64,qr")),
  },
}));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "session-1" }),
  useRouter: () => ({ push }),
}));

jest.mock("../../../lib/auth", () => ({
  getAccessToken: () => "buyer-token",
}));

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

const SESSION = {
  id: "session-1",
  status: "pending",
  subtotal: 1000,
  discount: 200,
  total: 800,
  couponCode: null,
  orders: [
    {
      id: "order-1",
      productTitle: "เสื้อแจ็คเก็ตวินเทจ",
      campaignCode: "SAVE200",
      discountAmount: 200,
      finalPrice: 800,
    },
  ],
  expiresAt: "2099-08-10T12:10:00.000Z",
  shippingAddress: {
    recipientName: "สมชาย ใจดี",
    addressLine: "99 ถนนสุขุมวิท",
    subdistrict: "คลองเตย",
    district: "คลองเตย",
    province: "กรุงเทพมหานคร",
    postalCode: "10110",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockImplementation((path, options = {}) => {
    if (path === "/api/orders/checkout-sessions/session-1" && !options.method) {
      return Promise.resolve(SESSION);
    }
    if (
      path === "/api/orders/checkout-sessions/session-1/confirm" &&
      options.method === "POST"
    ) {
      return Promise.resolve({ ...SESSION, status: "paid" });
    }
    return Promise.reject(new Error(`unexpected request: ${path}`));
  });
});

test("renders a scannable QR payment summary with a fresh countdown", async () => {
  render(<PaymentPage />);

  expect(
    await screen.findByRole("heading", { name: "สแกน QR Code เพื่อชำระเงิน" }),
  ).toBeInTheDocument();
  expect(screen.getByText("฿800")).toBeInTheDocument();
  expect(screen.getByText("SAVE200")).toBeInTheDocument();
  expect(await screen.findByAltText("QR Code สำหรับชำระเงิน")).toHaveAttribute(
    "src",
    "data:image/png;base64,qr",
  );
});

test("confirms payment and shows the success state", async () => {
  render(<PaymentPage />);
  await screen.findByRole("button", { name: "ฉันชำระเงินแล้ว" });

  fireEvent.click(screen.getByRole("button", { name: "ฉันชำระเงินแล้ว" }));

  await waitFor(() => {
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/checkout-sessions/session-1/confirm",
      { method: "POST", token: "buyer-token" },
    );
    expect(screen.getByText("ชำระเงินสำเร็จ")).toBeInTheDocument();
  });
});
