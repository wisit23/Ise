import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ProductsSection from "./ProductsSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../ui/ToastProvider", () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

beforeEach(() => jest.clearAllMocks());

test("lists removed products without a search term and opens owner details", async () => {
  apiFetch.mockImplementation((path) => {
    if (path.startsWith("/api/products/admin/search")) return Promise.resolve({
      items: [{ id: "product-full-id", title: "กระเป๋าทดสอบ", sellerId: "seller-full-id", price: 490, status: "removed", description: "สภาพดี", media: [] }],
      totalPages: 1,
    });
    if (path === "/api/auth/admin/users/seller-full-id") return Promise.resolve({ firstName: "สมใจ", lastName: "ขายดี" });
    return Promise.reject(new Error("unexpected request"));
  });

  render(<ProductsSection token="token" />);
  fireEvent.click(screen.getByRole("button", { name: "ดูรายการที่ลบแล้ว" }));
  expect(await screen.findByText("กระเป๋าทดสอบ")).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/products\/admin\/search\?.*status=removed/), { token: "token" });
  expect(screen.getByPlaceholderText("ค้นหาในสินค้าที่ถูกลบ...")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ดูรายละเอียดสินค้า" }));
  expect(within(await screen.findByRole("dialog")).getByText(/product-full-id/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/สมใจ ขายดี/)).toBeInTheDocument());
});

test("returns from removed products to normal product search", async () => {
  apiFetch.mockResolvedValue({ items: [], totalPages: 1 });

  render(<ProductsSection token="token" />);
  fireEvent.click(screen.getByRole("button", { name: "ดูรายการที่ลบแล้ว" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "กลับไปค้นหาสินค้า" }));

  expect(screen.getByPlaceholderText("ค้นหาชื่อสินค้า, แท็ก, หมวดหมู่...")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ค้นหา" })).toBeDisabled();
});
