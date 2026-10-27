import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PaymentPage from "./page";
import { apiFetch } from "../../../lib/api";
import * as serverClock from "../../../lib/serverClock";

jest.mock("../../../lib/serverClock", () => ({
  serverNow: jest.fn(() => Date.now()),
}));

test("payment uses server time when the browser clock is three seconds behind", async () => {
  const start = Date.parse(SESSION.expiresAt) - 600000;
  const localClock = jest.spyOn(Date, "now").mockReturnValue(start - 3000);
  const clock = serverClock.serverNow.mockReturnValue(start);
  try {
    render(<PaymentPage />);
    expect(await screen.findByText("10:00")).toBeInTheDocument();
    expect(screen.queryByText("10:03")).not.toBeInTheDocument();
  } finally {
    clock.mockImplementation(() => Date.now());
    localClock.mockRestore();
  }
});

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
  addressId: "a1",
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
    if (path === "/api/auth/me/addresses") return Promise.resolve([
      { ...SESSION.shippingAddress, id: "a1", phone: "0812345678" },
      { ...SESSION.shippingAddress, id: "a2", recipientName: "ผู้รับใหม่", addressLine: "123 ถนนใหม่", phone: "0899999999" },
    ]);
    if (path === "/api/orders/checkout-sessions/session-1/cancel") return Promise.resolve({ ...SESSION, status: "cancelled" });
    if (path === "/api/orders/checkout-sessions/session-1/address") return Promise.resolve({
      ...SESSION, addressId: "a2", shippingAddress: { ...SESSION.shippingAddress, recipientName: "ผู้รับใหม่", addressLine: "123 ถนนใหม่" },
    });
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


test("cancel requires confirmation and backing out makes no cancellation request", async () => {
  render(<PaymentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "ยกเลิกการชำระเงิน" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/cancel"), expect.anything());
  expect(screen.getByRole("button", { name: "ฉันชำระเงินแล้ว" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ชำระเงินต่อ" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/cancel"), expect.anything());
});

test("confirmed cancellation calls API once and returns home", async () => {
  render(<PaymentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "ยกเลิกการชำระเงิน" }));
  const confirm = screen.getByRole("button", { name: "ยืนยันยกเลิกการชำระเงิน" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  expect(apiFetch.mock.calls.filter(([path]) => path.endsWith("/cancel"))).toHaveLength(1);
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/checkout-sessions/session-1/cancel", { method: "POST", token: "buyer-token" });
});

test("cancellation failure stays on payment and shows the error", async () => {
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) => path.endsWith("/cancel") ? Promise.reject(new Error("ยกเลิกไม่สำเร็จ")) : original(path, options));
  render(<PaymentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "ยกเลิกการชำระเงิน" }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิกการชำระเงิน" }));
  expect(await screen.findByText("ยกเลิกไม่สำเร็จ")).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "ฉันชำระเงินแล้ว" })).toBeEnabled();
});

test("address selection saves the checkout snapshot without confirming payment", async () => {
  render(<PaymentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "เปลี่ยนที่อยู่จัดส่ง" }));
  fireEvent.click(await screen.findByRole("radio", { name: /ผู้รับใหม่/ }));
  expect(screen.getByRole("button", { name: "ฉันชำระเงินแล้ว" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกที่อยู่จัดส่ง" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/checkout-sessions/session-1/address", {
    method: "PATCH", token: "buyer-token", body: { addressId: "a2" },
  });
  expect(screen.getByText(/123 ถนนใหม่/)).toBeInTheDocument();
  expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/confirm"), expect.anything());
});

test("failed address save preserves the old address and allows retry", async () => {
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) => path.endsWith("/address") ? Promise.reject(new Error("บันทึกที่อยู่ไม่สำเร็จ")) : original(path, options));
  render(<PaymentPage />);
  fireEvent.click(await screen.findByRole("button", { name: "เปลี่ยนที่อยู่จัดส่ง" }));
  fireEvent.click(await screen.findByRole("radio", { name: /ผู้รับใหม่/ }));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกที่อยู่จัดส่ง" }));
  expect(await screen.findByText("บันทึกที่อยู่ไม่สำเร็จ")).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "บันทึกที่อยู่จัดส่ง" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(screen.getByText(/99 ถนนสุขุมวิท/)).toBeInTheDocument();
});

test("paid and expired sessions do not offer cancel or address changes", async () => {
  apiFetch.mockResolvedValue({ ...SESSION, status: "paid" });
  const view = render(<PaymentPage />);
  await screen.findByText("ชำระเงินสำเร็จ");
  expect(screen.queryByRole("button", { name: "เปลี่ยนที่อยู่จัดส่ง" })).not.toBeInTheDocument();
  view.unmount();
  apiFetch.mockResolvedValue({ ...SESSION, status: "expired", expiresAt: "2000-01-01" });
  render(<PaymentPage />);
  await screen.findByText("หมดเวลาชำระเงิน");
  expect(screen.queryByRole("button", { name: "ยกเลิกการชำระเงิน" })).not.toBeInTheDocument();
});
