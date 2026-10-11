import { render, screen } from "@testing-library/react";
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
jest.mock(
  "../../components/OrderLine",
  () =>
    function Line({ actions, status }) {
      return (
        <div>
          {status}
          {actions}
        </div>
      );
    },
);
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
              { ...base, id: "normal-order", status: "completed" },
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
      name: "มีปัญหากับคำสั่งซื้อนี้? ขอคืนเงิน/คืนสินค้า",
    }),
  ).toHaveLength(1);
  expect(screen.getByText("พักเงินเพื่อตรวจสอบ")).toBeInTheDocument();
});
