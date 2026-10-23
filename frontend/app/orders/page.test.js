import { render, screen, fireEvent, waitFor } from "@testing-library/react";
// Order actions now render inside ProfilePage; retain coverage of the shared view.
import OrdersPage from "../../components/orders/MyOrders";
import LegacyOrdersPage from "./page";
import { redirect } from "next/navigation";
import { apiFetch } from "../../lib/api";
const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  redirect: jest.fn(),
}));

test("legacy orders route redirects to the orders section in profile", () => {
  LegacyOrdersPage();
  expect(redirect).toHaveBeenCalledWith("/profile?tab=orders");
});
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));
jest.mock(
  "../../components/NavBar",
  () =>
    function Nav() {
      return <nav />;
    },
);
jest.mock(
  "../../components/Footer",
  () =>
    function Footer() {
      return <footer />;
    },
);
jest.mock("../../components/OrderLine", () => ({
  __esModule: true,
  default: function Line({ actions, status, linkThumbnail }) {
    return (
      <div data-testid="order-line" data-link-thumbnail={String(linkThumbnail)}>
        {status}
        {actions}
      </div>
    );
  },
  ProductThumb: function Thumb() {
    return null;
  },
}));
test("my orders disables thumbnail links and keeps the details action", async () => {
  apiFetch.mockImplementation((url) => Promise.resolve(
    url.startsWith("/api/orders/mine")
      ? { items: [{ id: "order-1", productId: "p1", status: "paid", price: 800 }], totalPages: 1 }
      : { items: [] },
  ));
  render(<OrdersPage />);
  expect(await screen.findByTestId("order-line")).toHaveAttribute("data-link-thumbnail", "false");
  expect(screen.getByRole("button", { name: "ดูรายละเอียด" })).toBeEnabled();
});

test("contact seller from a purchased order sends the order ID and opens the room", async () => {
  mockRouter.push.mockClear();
  apiFetch.mockImplementation((url) => {
    if (url.startsWith("/api/orders/mine")) return Promise.resolve({
      items: [{ id: "order-1", productId: "sold-product", buyerId: "buyer", status: "paid", price: 800 }],
      totalPages: 1,
    });
    if (url === "/api/chat/conversations") return Promise.resolve({ id: "room-1" });
    return Promise.resolve({ items: [] });
  });
  render(<OrdersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "ติดต่อผู้ขาย" }));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/chat/room-1"));
  expect(apiFetch).toHaveBeenCalledWith("/api/chat/conversations", {
    method: "POST", token: "token",
    body: { contextType: "PRODUCT", productId: "sold-product", orderId: "order-1" },
  });
});

test("failed post-purchase chat shows the error and lets the buyer retry", async () => {
  mockRouter.push.mockClear();
  apiFetch.mockImplementation((url) => {
    if (url.startsWith("/api/orders/mine")) return Promise.resolve({
      items: [{ id: "order-1", productId: "sold-product", buyerId: "buyer", status: "paid", price: 800 }],
      totalPages: 1,
    });
    if (url === "/api/chat/conversations") return Promise.reject(new Error("ตรวจสอบคำสั่งซื้อไม่สำเร็จ"));
    return Promise.resolve({ items: [] });
  });
  render(<OrdersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "ติดต่อผู้ขาย" }));
  expect(await screen.findByText("ตรวจสอบคำสั่งซื้อไม่สำเร็จ")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ติดต่อผู้ขาย" })).toBeEnabled();
  expect(mockRouter.push).not.toHaveBeenCalled();
});
test("decided completed orders link to their case and cannot open a duplicate; a safety hold does not invent a dispute", async () => {
  const base = {
    buyerId: "buyer",
    productId: "product",
    price: 800,
    createdAt: "2026-10-11T04:00:00Z",
  };
  apiFetch.mockImplementation((url) =>
    Promise.resolve(
      url.startsWith("/api/orders/mine")
        ? {
            items: [
              {
                ...base,
                id: "decided-order",
                status: "completed",
                dispute: { id: "case", status: "DECIDED" },
              },
              {
                ...base,
                id: "normal-order",
                status: "completed",
                deliveredAt: new Date().toISOString(),
              },
              { ...base, id: "safety-order", status: "disputed" },
            ],
            totalPages: 1,
          }
        : { items: [] },
    ),
  );
  render(<OrdersPage />);
  expect(
    await screen.findByRole("link", { name: "ดูสถานะข้อพิพาท →" }),
  ).toHaveAttribute("href", "/support/cases/decided-order");
  expect(
    screen.getAllByRole("button", {
      name: "ขอคืนเงิน/คืนสินค้า",
    }),
  ).toHaveLength(1);
  expect(screen.getByText("พักเงินเพื่อตรวจสอบ")).toBeInTheDocument();
});

test("buyer confirms receipt only after delivery and disputes only within 14 days of it", async () => {
  const base = {
    buyerId: "buyer",
    productId: "product",
    price: 800,
    createdAt: "2026-10-01T04:00:00Z",
  };
  const longAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  apiFetch.mockImplementation((url) =>
    Promise.resolve(
      url.startsWith("/api/orders/mine")
        ? {
            items: [
              { ...base, id: "pickup-order", status: "pickup_in_progress" },
              { ...base, id: "transit-order", status: "in_transit" },
              {
                ...base,
                id: "delivered-order",
                status: "delivered",
                deliveredAt: new Date().toISOString(),
              },
              {
                ...base,
                id: "old-order",
                status: "completed",
                deliveredAt: longAgo,
                completedAt: longAgo,
              },
            ],
            totalPages: 1,
          }
        : { items: [] },
    ),
  );
  render(<OrdersPage />);
  expect(
    await screen.findAllByRole("button", { name: /ได้รับสินค้าแล้ว/ }),
  ).toHaveLength(1);
  expect(
    screen.getAllByRole("button", {
      name: "ขอคืนเงิน/คืนสินค้า",
    }),
  ).toHaveLength(1);
  expect(
    screen.getByText(/ระบบจะยืนยันรับสินค้าให้อัตโนมัติ/),
  ).toBeInTheDocument();
});

test("the detail button opens the buyer order detail for that order", async () => {
  const order = {
    id: "paid-order",
    buyerId: "buyer",
    productId: "product",
    productTitle: "Shoes",
    price: 790,
    status: "paid",
    version: 2,
    createdAt: "2026-10-16T04:00:00Z",
    shippingAddress: {
      recipientName: "Somchai",
      phone: "081",
      addressLine: "1 Road",
    },
  };
  apiFetch.mockImplementation((url) =>
    Promise.resolve(
      url.startsWith("/api/orders/mine")
        ? { items: [order], totalPages: 1 }
        : url === "/api/orders/paid-order"
          ? order
          : { items: [] },
    ),
  );
  render(<OrdersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "ดูรายละเอียด" }));
  expect(await screen.findByText("รายละเอียดคำสั่งซื้อ")).toBeInTheDocument();
  expect(await screen.findByText("Somchai")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "เปลี่ยนที่อยู่" }),
  ).toBeInTheDocument();
});

test("green review and red refund buttons keep their forms and deadline", async () => {
  apiFetch.mockImplementation((url) =>
    Promise.resolve(
      url.startsWith("/api/orders/mine")
        ? {
            items: [
              {
                id: "completed-order",
                buyerId: "buyer",
                productId: "product",
                price: 650,
                status: "completed",
                createdAt: new Date().toISOString(),
                deliveredAt: new Date().toISOString(),
              },
            ],
            totalPages: 1,
          }
        : { items: [] },
    ),
  );
  render(<OrdersPage />);
  const review = await screen.findByRole("button", { name: "ให้คะแนนร้านค้า" });
  const refund = screen.getByRole("button", { name: "ขอคืนเงิน/คืนสินค้า" });
  expect(review.parentElement).toHaveClass("flex", "flex-wrap", "items-start");
  expect(review.parentElement).not.toHaveClass("flex-col");
  expect(refund.parentElement.parentElement).toBe(review.parentElement);
  expect(review.parentElement).toHaveClass("[&>form]:w-full");
  expect(review).toHaveClass("!bg-emerald-50", "!text-emerald-800");
  expect(refund).toHaveClass("!bg-rose-50", "!text-rose-800");
  expect(refund).toHaveAccessibleDescription(/แจ้งปัญหาได้ภายในวันที่/);
  expect(refund.parentElement).toHaveClass(
    "flex-1",
    "items-center",
    "justify-between",
  );
  expect(screen.getByText(/แจ้งปัญหาได้ภายในวันที่/)).toHaveClass(
    "ml-auto",
    "text-right",
  );
  expect(refund).not.toHaveTextContent("ภายใน");
  fireEvent.click(review);
  expect(
    screen.getByText("ให้คะแนนร้านค้าสำหรับคำสั่งซื้อนี้"),
  ).toBeInTheDocument();
  fireEvent.click(refund);
  expect(
    screen.getByRole("heading", { name: "แจ้งปัญหาหลังรับสินค้า" }),
  ).toBeInTheDocument();
});
