import { render, screen, fireEvent } from "@testing-library/react";
import OrdersPage from "./page";
import { apiFetch } from "../../lib/api";
const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
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
  default: function Line({ actions, status }) {
    return (
      <div>
        {status}
        {actions}
      </div>
    );
  },
  ProductThumb: function Thumb() {
    return null;
  },
}));
jest.mock(
  "../../components/chat/ContactSellerButton",
  () =>
    function Contact() {
      return null;
    },
);
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
              { ...base, id: "shipped-order", status: "shipped" },
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
