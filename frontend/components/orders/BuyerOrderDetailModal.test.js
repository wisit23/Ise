import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import BuyerOrderDetailModal from "./BuyerOrderDetailModal";
import { apiFetch } from "../../lib/api";

jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
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

beforeEach(() => apiFetch.mockReset());

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
