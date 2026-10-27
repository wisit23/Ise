import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import CheckoutPage from "./page";
import { apiFetch } from "../../lib/api";
import * as serverClock from "../../lib/serverClock";

jest.mock("../../lib/serverClock", () => ({
  serverNow: jest.fn(() => Date.now()),
}));

test("checkout uses server time when the browser clock is three seconds behind", async () => {
  const start = Date.parse(ORDER.reservationExpiresAt) - 600000;
  const localClock = jest.spyOn(Date, "now").mockReturnValue(start - 3000);
  const clock = serverClock.serverNow.mockReturnValue(start);
  try {
    render(<CheckoutPage />);
    expect(await screen.findByText("10:00")).toBeInTheDocument();
    expect(screen.queryByText("10:03")).not.toBeInTheDocument();
  } finally {
    clock.mockImplementation(() => Date.now());
    localClock.mockRestore();
  }
});

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
const replace = jest.fn();
const mockRouter = { push, replace };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
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
    if (path === "/api/products/campaigns/my-vouchers?status=CLAIMED")
      return Promise.resolve([]);
    if (path === "/api/orders/checkout-sessions" && options.method === "POST") {
      return Promise.resolve({ id: "session-1" });
    }
    return Promise.reject(new Error(`unexpected request: ${path}`));
  });
});

test("shows the Marketing voucher and its server-calculated order summary", async () => {
  render(<CheckoutPage />);

  expect(
    (await screen.findAllByText(/เสื้อแจ็คเก็ตวินเทจ/)).length,
  ).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("สมชาย ใจดี")).toBeInTheDocument();

  expect(
    screen.getByRole("button", { name: /เลือกโค้ดส่วนลดสำหรับ เสื้อ/ }),
  ).toHaveTextContent("SAVE200");
  expect(screen.getByText("ส่วนลดสินค้าชิ้นนี้ -฿200")).toBeInTheDocument();
  expect(screen.getByText("฿800")).toBeInTheDocument();
});

test("returns straight to the QR page when the order already has an open payment session", async () => {
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) =>
    path === "/api/orders/order-1"
      ? Promise.resolve({
          ...ORDER,
          checkoutSessionId: "session-1",
          checkoutSession: { id: "session-1", status: "pending" },
        })
      : original(path, options),
  );
  render(<CheckoutPage />);
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith("/payment/session-1"),
  );
  expect(screen.queryByText("สมชาย ใจดี")).not.toBeInTheDocument();
});

test("stays on checkout when the previous payment session is no longer pending", async () => {
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) =>
    path === "/api/orders/order-1"
      ? Promise.resolve({
          ...ORDER,
          checkoutSessionId: "session-0",
          checkoutSession: { id: "session-0", status: "expired" },
        })
      : original(path, options),
  );
  render(<CheckoutPage />);
  await screen.findByText("สมชาย ใจดี");
  expect(replace).not.toHaveBeenCalled();
});

test("shows an expired auction message without a payment action for a cancelled winner order", async () => {
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) =>
    path === "/api/orders/order-1"
      ? Promise.resolve({
          ...ORDER,
          orderType: "AUCTION",
          auctionId: "auction-1",
          status: "cancelled",
          reservationExpiresAt: null,
          checkoutSessionId: "expired-winner-session",
          checkoutSession: { id: "expired-winner-session", status: "pending" },
        })
      : original(path, options),
  );

  render(<CheckoutPage />);

  expect(
    await screen.findByRole("heading", {
      name: "สิทธิ์ในการชำระเงินสิ้นสุดแล้ว",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(/ไม่ได้ชำระเงินภายใน 24 ชั่วโมง/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "ยืนยันและไปสแกน QR" }),
  ).not.toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "ดูประวัติคำสั่งซื้อ" })).toHaveAttribute(
    "href",
    "/orders",
  );
});

test("entering checkout creates orders from cart reservations before confirming payment", async () => {
  window.history.replaceState(null, "", "/checkout?items=basket-1");
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) =>
    path === "/api/orders/cart/prepare"
      ? Promise.resolve({ items: [ORDER] })
      : original(path, options),
  );
  render(<CheckoutPage />);
  await screen.findByText("สมชาย ใจดี");
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/cart/prepare", {
    method: "POST",
    token: "buyer-token",
    body: { basketIds: ["basket-1"] },
  });
  expect(
    apiFetch.mock.calls.some(
      ([path]) => path === "/api/orders/checkout-sessions",
    ),
  ).toBe(false);
});

test("checkout can combine cart reservations with an existing auction order", async () => {
  window.history.replaceState(
    null,
    "",
    "/checkout?items=basket-1&orders=order-1",
  );
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) =>
    path === "/api/orders/cart/prepare"
      ? Promise.resolve({
          items: [{ ...ORDER, id: "order-new", productTitle: "New cart item" }],
        })
      : original(path, options),
  );
  render(<CheckoutPage />);
  await screen.findByText("สมชาย ใจดี");
  expect(screen.getAllByText("New cart item").length).toBeGreaterThan(0);
  expect(screen.getAllByText(ORDER.productTitle).length).toBeGreaterThan(0);
});

test("chooses separate vouchers for two products and totals only the updated item", async () => {
  window.history.replaceState(null, "", "/checkout?orders=order-1,order-2");
  const original = apiFetch.getMockImplementation();
  const second = {
    ...ORDER,
    id: "order-2",
    productTitle: "รองเท้า",
    campaignId: null,
    campaignCode: null,
    discountAmount: 0,
    finalPrice: 1000,
  };
  apiFetch.mockImplementation((path, options) => {
    if (path === "/api/orders/order-2") return Promise.resolve(second);
    if (path === "/api/products/campaigns/my-vouchers?status=CLAIMED")
      return Promise.resolve([
        { id: "v1", campaignId: "campaign-1", campaign: { code: "SAVE200" } },
        { id: "v2", campaignId: "campaign-2", campaign: { code: "SHOES100" } },
      ]);
    if (path === "/api/orders/order-2/voucher")
      return Promise.resolve({
        ...second,
        campaignId: "campaign-2",
        campaignCode: "SHOES100",
        finalPrice: 900,
        discountAmount: 100,
      });
    return original(path, options);
  });
  render(<CheckoutPage />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "เลือกโค้ดส่วนลดสำหรับ รองเท้า",
    }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).queryByRole("radio", { name: "SAVE200" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    await within(dialog).findByRole("radio", { name: "SHOES100" }),
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "ยืนยันใช้โค้ด" }),
  );
  expect(
    await screen.findByText("ส่วนลดสินค้าชิ้นนี้ -฿100"),
  ).toBeInTheDocument();
  expect(screen.getByText("฿1,700")).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "เลือกโค้ดส่วนลดสำหรับ เสื้อแจ็คเก็ตวินเทจ",
    }),
  ).toHaveTextContent("SAVE200");
  expect(apiFetch).toHaveBeenCalledWith(
    "/api/orders/order-2/voucher",
    expect.objectContaining({
      method: "PATCH",
      body: { campaignId: "campaign-2" },
    }),
  );
});

test("removing a voucher restores the individual item price", async () => {
  const original = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) =>
    path === "/api/orders/order-1/voucher"
      ? Promise.resolve({
          ...ORDER,
          campaignId: null,
          campaignCode: null,
          discountAmount: 0,
          finalPrice: 1000,
        })
      : original(path, options),
  );
  render(<CheckoutPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: /เลือกโค้ดส่วนลดสำหรับ เสื้อ/ }),
  );
  fireEvent.click(
    await screen.findByRole("radio", { name: "ไม่ใช้โค้ดส่วนลด" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันใช้โค้ด" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(apiFetch).toHaveBeenCalledWith(
    "/api/orders/order-1/voucher",
    expect.objectContaining({ body: { campaignId: null } }),
  );
  expect(screen.getAllByText("฿1,000")).toHaveLength(2);
});

test("blocks checkout while voucher pricing is pending and retains original price on rejection", async () => {
  const original = apiFetch.getMockImplementation();
  let rejectChange;
  apiFetch.mockImplementation((path, options) => {
    if (path === "/api/products/campaigns/my-vouchers?status=CLAIMED")
      return Promise.resolve([
        { id: "v2", campaignId: "campaign-2", campaign: { code: "SAVE300" } },
      ]);
    if (path === "/api/orders/order-1/voucher")
      return new Promise((resolve, reject) => {
        rejectChange = reject;
      });
    return original(path, options);
  });
  render(<CheckoutPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: /เลือกโค้ดส่วนลดสำหรับ เสื้อ/ }),
  );
  fireEvent.click(await screen.findByRole("radio", { name: "SAVE300" }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันใช้โค้ด" }));
  expect(
    screen.getByRole("button", { name: /ยืนยันและไปสแกน QR/ }),
  ).toBeDisabled();
  rejectChange(new Error("โค้ดนี้ไม่ตรงหมวดสินค้า"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "โค้ดนี้ไม่ตรงหมวดสินค้า",
  );
  expect(
    screen.getByRole("button", { name: /เลือกโค้ดส่วนลดสำหรับ เสื้อ/ }),
  ).toHaveTextContent("SAVE200");
  expect(screen.getByText("฿800")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(
    screen.getByRole("button", { name: /ยืนยันและไปสแกน QR/ }),
  ).not.toBeDisabled();
});

test("voucher draft cancels on Escape without changing the order or calling the API", async () => {
  render(<CheckoutPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: /เลือกโค้ดส่วนลดสำหรับ เสื้อ/ }),
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("radio", { name: "ไม่ใช้โค้ดส่วนลด" }),
  );
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(apiFetch.mock.calls.some(([path]) => path.endsWith("/voucher"))).toBe(
    false,
  );
  expect(screen.getByText("฿800")).toBeInTheDocument();
});

test("adds an address in a popup and selects it in checkout without navigating away", async () => {
  const original = apiFetch.getMockImplementation();
  let created = false;
  const added = {
    ...ADDRESS,
    id: "address-2",
    recipientName: "ผู้รับใหม่",
    isDefault: false,
  };
  apiFetch.mockImplementation((path, options = {}) => {
    if (path === "/api/auth/me/addresses" && options.method === "POST") {
      created = true;
      return Promise.resolve(added);
    }
    if (path === "/api/auth/me/addresses" && created)
      return Promise.resolve([ADDRESS, added]);
    return original(path, options);
  });
  render(<CheckoutPage />);
  fireEvent.click(await screen.findByRole("button", { name: "จัดการที่อยู่" }));
  const manager = await screen.findByRole("dialog");
  fireEvent.click(
    within(manager).getByRole("button", { name: "เพิ่มที่อยู่ใหม่" }),
  );
  const fields = {
    "ชื่อ-นามสกุล ผู้รับ": added.recipientName,
    เบอร์โทรศัพท์: added.phone,
    "บ้านเลขที่ ถนน อาคาร": added.addressLine,
    "แขวง / ตำบล": added.subdistrict,
    "เขต / อำเภอ": added.district,
    จังหวัด: added.province,
    รหัสไปรษณีย์: added.postalCode,
  };
  for (const [label, value] of Object.entries(fields))
    fireEvent.change(
      within(manager).getByRole("textbox", { name: new RegExp(label) }),
      { target: { value } },
    );
  fireEvent.click(
    within(manager).getByRole("button", { name: "บันทึกที่อยู่" }),
  );
  await within(manager).findByRole("button", { name: "เพิ่มที่อยู่ใหม่" });
  fireEvent.click(within(manager).getByRole("button", { name: "ปิดหน้าต่าง" }));
  expect(screen.getByRole("radio", { name: /ผู้รับใหม่/ })).toBeChecked();
  expect(push).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("link", { name: "จัดการที่อยู่" }),
  ).not.toBeInTheDocument();
});

test("deleting the selected address clears checkout selection when no addresses remain", async () => {
  const original = apiFetch.getMockImplementation();
  let deleted = false;
  apiFetch.mockImplementation((path, options = {}) => {
    if (
      path === `/api/auth/me/addresses/${ADDRESS.id}` &&
      options.method === "DELETE"
    ) {
      deleted = true;
      return Promise.resolve(null);
    }
    if (path === "/api/auth/me/addresses" && deleted)
      return Promise.resolve([]);
    return original(path, options);
  });
  render(<CheckoutPage />);
  fireEvent.click(await screen.findByRole("button", { name: "จัดการที่อยู่" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "ลบ" }));
  fireEvent.click(
    within(dialog).getByRole("button", { name: "ยืนยันลบที่อยู่" }),
  );
  await within(dialog).findByText("ยังไม่มีที่อยู่จัดส่ง");
  fireEvent.click(within(dialog).getByRole("button", { name: "ปิดหน้าต่าง" }));
  expect(
    screen.getByRole("button", { name: /ยืนยันและไปสแกน QR/ }),
  ).toBeDisabled();
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
          addressId: ADDRESS.id,
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
