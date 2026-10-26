import { fireEvent, render, screen } from "@testing-library/react";
import HomePage from "./page";
import { apiFetch } from "../lib/api";
import { fetchActiveCategories } from "../lib/catalog";

jest.mock("../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../lib/catalog", () => ({ fetchActiveCategories: jest.fn() }));
jest.mock("../lib/useCatalogLiveRefresh", () => jest.fn());
jest.mock("../components/home/useHomeEntrance", () => jest.fn());
jest.mock("../components/NavBar", () => () => null);
jest.mock("../components/Footer", () => () => null);
jest.mock("../components/home/FannedHeroCards", () => () => null);
jest.mock("../components/home/RecommendedProducts", () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockResolvedValue({ items: [], total: 61 });
});

it("shows the actual count and category browsing links", async () => {
  fetchActiveCategories.mockResolvedValue([{ name: "กระเป๋า", count: 12 }]);
  render(<HomePage />);
  const link = await screen.findByRole("link", { name: /กระเป๋า.*12 ชิ้น/ });
  expect(link).toHaveAttribute(
    "href",
    `/products?category=${encodeURIComponent("กระเป๋า")}`,
  );
  expect(
    screen.getByText("หมวดหมู่", { exact: false, selector: "span" }),
  ).toHaveTextContent("1 หมวดหมู่");
});

it("shows a retry on category failure and recovers without showing a false zero", async () => {
  fetchActiveCategories
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([{ name: "รองเท้า", count: 4 }]);
  render(<HomePage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "โหลดหมวดหมู่ไม่สำเร็จ",
  );
  expect(screen.queryByText(/0\s*หมวดหมู่/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }));
  expect(
    await screen.findByRole("link", { name: /รองเท้า.*4 ชิ้น/ }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
