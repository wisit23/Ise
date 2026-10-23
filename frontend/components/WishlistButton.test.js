import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WishlistButton from "./WishlistButton";
import { apiFetch } from "../lib/api";

const push = jest.fn();
let token = "buyer-token";
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../lib/auth", () => ({
  getAccessToken: () => token,
  getCurrentRoles: () => ["BUYER"],
  isCustomerAccountRoles: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  token = "buyer-token";
});

test("saves, reflects the persisted count, and removes a favorite", async () => {
  apiFetch.mockImplementation((_path, options = {}) =>
    Promise.resolve(
      options.method === "PUT"
        ? { saved: true, count: 6 }
        : { saved: false, count: 5 },
    ),
  );
  render(<WishlistButton productId="p1" title="เสื้อ" />);
  await screen.findByText("5");
  fireEvent.click(
    screen.getByRole("button", { name: "บันทึกรายการโปรด เสื้อ" }),
  );
  const saved = await screen.findByRole("button", {
    name: "นำออกจากรายการโปรด เสื้อ",
  });
  expect(saved).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("6")).toBeInTheDocument();
  fireEvent.click(saved);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "บันทึกรายการโปรด เสื้อ" }),
    ).toHaveAttribute("aria-pressed", "false"),
  );
  expect(apiFetch).toHaveBeenCalledWith("/api/products/wishlist/p1", {
    method: "PUT",
  });
  expect(apiFetch).toHaveBeenCalledWith("/api/products/wishlist/p1", {
    method: "DELETE",
  });
});

test("guest is sent back to the same product after signing in without saving", () => {
  token = null;
  render(<WishlistButton productId="p1" title="เสื้อ" />);
  fireEvent.click(
    screen.getByRole("button", { name: "บันทึกรายการโปรด เสื้อ" }),
  );
  expect(push).toHaveBeenCalledWith("/login?next=%2Fproducts%2Fp1");
  expect(apiFetch).not.toHaveBeenCalled();
});

test("a failed save leaves the heart unselected and displays an error", async () => {
  apiFetch.mockImplementation((_path, options = {}) =>
    options.method
      ? Promise.reject(new Error("บันทึกไม่สำเร็จ"))
      : Promise.resolve({ saved: false, count: 5 }),
  );
  render(<WishlistButton productId="p1" title="เสื้อ" />);
  await screen.findByText("5");
  fireEvent.click(
    screen.getByRole("button", { name: "บันทึกรายการโปรด เสื้อ" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกไม่สำเร็จ");
  expect(
    screen.getByRole("button", { name: "บันทึกรายการโปรด เสื้อ" }),
  ).toHaveAttribute("aria-pressed", "false");
});
