import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import BuyerOrderDetailModal from "./BuyerOrderDetailModal";
import { apiFetch } from "../../lib/api";
import { fetchProduct } from "../../lib/products";
import { fetchSellerSummary } from "../../lib/sellers";

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: (url) => `https://media.test${url}`,
}));
jest.mock("../../lib/products", () => ({ fetchProduct: jest.fn() }));
jest.mock("../../lib/sellers", () => ({ fetchSellerSummary: jest.fn() }));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));

const ADDR_OLD = {
  id: "a1",
  recipientName: "Old Name",
  phone: "0811111111",
  addressLine: "1 Old Road",
  province: "Bangkok",
  postalCode: "10100",
};
const ADDR_NEW = {
  id: "a2",
  recipientName: "New Name",
  phone: "0822222222",
  addressLine: "2 New Road",
  province: "Chiang Mai",
  postalCode: "50000",
};

function order(status, extra = {}) {
  return {
    id: "o1",
    status,
    version: 3,
    productTitle: "Shoes",
    price: 790,
    finalPrice: 790,
    createdAt: "2026-10-16T04:00:00Z",
    shippingAddress: ADDR_OLD,
    shipping: { addressId: "a1" },
    ...extra,
  };
}

function mockApi(current, { patch } = {}) {
  apiFetch.mockImplementation((url, opts = {}) => {
    if (url === "/api/orders/o1" && !opts.method)
      return Promise.resolve(current);
    if (url === "/api/auth/me/addresses")
      return Promise.resolve([ADDR_OLD, ADDR_NEW]);
    if (url === "/api/orders/o1/shipping-address") return patch(opts);
    return Promise.reject(new Error("unexpected " + url));
  });
}

beforeEach(() => {
  apiFetch.mockReset();
  fetchProduct.mockReset().mockResolvedValue(null);
  fetchSellerSummary.mockReset().mockResolvedValue(null);
});

test("shows the shop name and product photo alongside shipping details", async () => {
  const current = order("shipped", {
    productId: "p1",
    sellerId: "s1",
    shipping: { company: "Test Express", trackingNumber: "SIM123" },
  });
  mockApi(current);
  fetchProduct.mockResolvedValue({
    title: "Current listing title",
    media: [
      { type: "video", url: "/uploads/clip.mp4" },
      { type: "image", url: "/uploads/shoes.jpg" },
    ],
  });
  fetchSellerSummary.mockResolvedValue({ shopName: "Secondhand Studio" });
  render(
    <BuyerOrderDetailModal order={current} statusLabel="จัดส่งแล้ว" onClose={() => {}} />,
  );
  expect(await screen.findByText("Secondhand Studio")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Shoes" })).toHaveAttribute(
    "src",
    "https://media.test/uploads/shoes.jpg",
  );
  expect(fetchProduct).toHaveBeenCalledWith("p1");
  expect(fetchSellerSummary).toHaveBeenCalledWith("s1");
  expect(screen.getByText("Test Express")).toBeInTheDocument();
  expect(screen.getByText("SIM123")).toBeInTheDocument();
  expect(screen.getByText("Old Name")).toBeInTheDocument();
});

test("keeps order details usable when the product and shop cannot be loaded", async () => {
  const current = order("paid", { productId: "removed", sellerId: "s1" });
  mockApi(current);
  render(
    <BuyerOrderDetailModal order={current} statusLabel="ชำระแล้ว" onClose={() => {}} />,
  );
  expect(await screen.findByText("ไม่พบชื่อร้าน")).toBeInTheDocument();
  expect(screen.getByText("Shoes")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Old Name")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "เปลี่ยนที่อยู่" })).toBeInTheDocument();
  await waitFor(() => expect(fetchProduct).toHaveBeenCalledWith("removed"));
});

test("shows the shop without a broken image when a listing has no photos", async () => {
  const current = order("paid", { productId: "p1", sellerId: "s1" });
  mockApi(current);
  fetchProduct.mockResolvedValue({ title: "Shoes", media: [] });
  fetchSellerSummary.mockResolvedValue({ shopName: "Photo-free Shop" });
  render(
    <BuyerOrderDetailModal order={current} statusLabel="ชำระแล้ว" onClose={() => {}} />,
  );
  expect(await screen.findByText("Photo-free Shop")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test.each(["shipped", "delivered", "completed"])(
  "shows the seller's shipping company and tracking number for %s orders after reload",
  async (status) => {
    const fresh = order(status, {
      shipping: {
        addressId: "a1",
        company: "Test Express",
        trackingNumber: "SIM123456789TH",
      },
    });
    mockApi(fresh);
    render(
      <BuyerOrderDetailModal
        order={order(status)}
        statusLabel="x"
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText("Test Express")).toBeInTheDocument();
    expect(screen.getByText("SIM123456789TH")).toBeInTheDocument();
    expect(screen.getByText("บริษัทขนส่ง")).toBeInTheDocument();
    expect(screen.getByText("เลขพัสดุ")).toBeInTheDocument();
    expect(screen.getByText("Old Name")).toBeInTheDocument();
    expect(
      screen.queryByText("รอผู้ขายระบุข้อมูลการจัดส่ง"),
    ).not.toBeInTheDocument();
  },
);

test("shows a waiting message before the seller ships, without invented tracking data", async () => {
  const current = order("ready_to_ship", { shipping: null });
  mockApi(current);
  render(
    <BuyerOrderDetailModal order={current} statusLabel="x" onClose={() => {}} />,
  );
  expect(
    await screen.findByText("รอผู้ขายระบุข้อมูลการจัดส่ง"),
  ).toBeInTheDocument();
  expect(screen.queryByText("เลขพัสดุ")).not.toBeInTheDocument();
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
});

test("reports missing shipping data on a shipped order instead of claiming it is awaiting shipment", async () => {
  const current = order("shipped", { shipping: null });
  mockApi(current);
  render(
    <BuyerOrderDetailModal order={current} statusLabel="x" onClose={() => {}} />,
  );
  expect(await screen.findByText("ไม่พบข้อมูลการจัดส่ง")).toBeInTheDocument();
  expect(
    screen.queryByText("รอผู้ขายระบุข้อมูลการจัดส่ง"),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
});

test.each(["paid", "confirmed"])(
  "buyer can change the address while the order is %s",
  async (status) => {
    const current = order(status);
    const updated = order(status, {
      version: 4,
      shippingAddress: ADDR_NEW,
    });
    mockApi(current, { patch: () => Promise.resolve(updated) });
    const onOrderChange = jest.fn();
    render(
      <BuyerOrderDetailModal
        order={current}
        statusLabel="x"
        onClose={() => {}}
        onOrderChange={onOrderChange}
      />,
    );
    expect(await screen.findByText("Old Name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนที่อยู่" }));
    fireEvent.click(await screen.findByLabelText(/New Name/));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกที่อยู่" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/shipping-address", {
        method: "PATCH",
        token: "token",
        body: { addressId: "a2", version: 3 },
      }),
    );
    expect(await screen.findByText("New Name")).toBeInTheDocument();
    expect(
      screen.getByText("เปลี่ยนที่อยู่จัดส่งเรียบร้อยแล้ว"),
    ).toBeInTheDocument();
  },
);

test.each(["ready_to_ship", "shipped", "delivered", "completed"])(
  "no change-address button once the order is %s",
  async (status) => {
    mockApi(order(status), { patch: () => Promise.reject(new Error("no")) });
    render(
      <BuyerOrderDetailModal
        order={order(status)}
        statusLabel="x"
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText("Old Name")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "เปลี่ยนที่อยู่" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/เปลี่ยนที่อยู่ไม่ได้/)).toBeInTheDocument();
  },
);

test("on conflict it shows the error and reloads the order, hiding the button when the seller already moved on", async () => {
  let current = order("confirmed");
  apiFetch.mockImplementation((url, opts = {}) => {
    if (url === "/api/orders/o1" && !opts.method)
      return Promise.resolve(current);
    if (url === "/api/auth/me/addresses")
      return Promise.resolve([ADDR_OLD, ADDR_NEW]);
    if (url === "/api/orders/o1/shipping-address") {
      current = order("ready_to_ship", { version: 4 });
      return Promise.reject(
        new Error(
          "the address can only change before the seller prepares the parcel",
        ),
      );
    }
    return Promise.reject(new Error("unexpected " + url));
  });
  render(
    <BuyerOrderDetailModal
      order={current}
      statusLabel="x"
      onClose={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "เปลี่ยนที่อยู่" }),
  );
  fireEvent.click(await screen.findByLabelText(/New Name/));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกที่อยู่" }));

  expect(
    await screen.findByText(/can only change before the seller prepares/),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "เปลี่ยนที่อยู่" }),
    ).not.toBeInTheDocument(),
  );
});
