import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CartPage, { isReservationExpired, reservationCountdown } from "./page";
import { apiFetch } from "../../lib/api";

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({
  getAccessToken: () => "token",
  getCurrentRoles: () => ["BUYER"],
  isCustomerAccountRoles: () => true,
}));
jest.mock(
  "../../components/NavBar",
  () =>
    function Nav() {
      return null;
    },
);
jest.mock(
  "../../components/Footer",
  () =>
    function Footer() {
      return null;
    },
);
jest.mock(
  "../../components/OrderLine",
  () =>
    function Line({ order, lead, actions }) {
      return (
        <div>
          {order.productTitle}
          {lead}
          {actions}
        </div>
      );
    },
);

const CART_ITEM = {
  id: "basket-1",
  basketId: "basket-1",
  orderId: null,
  productTitle: "Cart product",
  price: 100,
  reservationExpiresAt: "2099-01-01T00:00:00Z",
};
beforeEach(() => {
  jest.clearAllMocks();
});

test("cart navigation passes reservation IDs without creating orders", async () => {
  apiFetch.mockResolvedValue({
    items: [
      CART_ITEM,
      {
        id: "auction-order",
        orderId: "auction-order",
        auctionId: "auction",
        productTitle: "Auction product",
        price: 50,
        createdAt: "2099-01-01T00:00:00Z",
      },
    ],
  });
  render(<CartPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "ยืนยันรายการ (2)" }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith(
    "/checkout?items=basket-1&orders=auction-order",
  );
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/cart", { token: "token" });
});

test.each([null, "existing-order"])(
  "cart cancellation uses the correct endpoint for order %s",
  async (orderId) => {
    apiFetch.mockImplementation((path) =>
      path === "/api/orders/cart"
        ? Promise.resolve({ items: [{ ...CART_ITEM, orderId }] })
        : Promise.resolve(null),
    );
    render(<CartPage />);
    fireEvent.click(await screen.findByRole("button", { name: "ยกเลิก" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        orderId
          ? "/api/orders/existing-order/status"
          : "/api/orders/cart/basket-1",
        {
          method: orderId ? "PATCH" : "DELETE",
          token: "token",
          ...(orderId ? { body: { status: "cancelled" } } : {}),
        },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Cart product")).not.toBeInTheDocument(),
    );
  },
);

test("shows the persisted reservation countdown and detects expiry", () => {
  const order = { reservationExpiresAt: "2026-08-10T12:10:00.000Z" };

  expect(
    reservationCountdown(order, new Date("2026-08-10T12:00:30.000Z").getTime()),
  ).toBe("9:30");
  expect(
    isReservationExpired(order, new Date("2026-08-10T12:09:59.000Z").getTime()),
  ).toBe(false);
  expect(
    isReservationExpired(order, new Date("2026-08-10T12:10:00.000Z").getTime()),
  ).toBe(true);
});

test("keeps legacy cart rows without an expiry usable", () => {
  const legacyOrder = { reservationExpiresAt: null };

  expect(isReservationExpired(legacyOrder, Date.now())).toBe(false);
  expect(reservationCountdown(legacyOrder, Date.now())).toBeNull();
});

test("auction won orders have a 24-hour payment window", () => {
  const auctionOrder = {
    auctionId: "auction-123",
    createdAt: "2026-08-10T12:00:00.000Z",
    reservationExpiresAt: null,
  };

  expect(
    isReservationExpired(
      auctionOrder,
      new Date("2026-08-10T12:15:00.000Z").getTime(),
    ),
  ).toBe(false);

  expect(
    isReservationExpired(
      auctionOrder,
      new Date("2026-08-11T12:01:00.000Z").getTime(),
    ),
  ).toBe(true);
});
