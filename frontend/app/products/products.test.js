import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProductsPage from "./page";
import { apiFetch } from "../../lib/api";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
function MockNavBar() {
  return <nav />;
}
function MockFooter() {
  return <footer />;
}
function MockProductCard() {
  return <article />;
}
function MockReveal({ children }) {
  return <div>{children}</div>;
}
function MockPagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <button aria-label="ไปหน้าถัดไป" onClick={() => onChange(page + 1)}>
      next
    </button>
  );
}
function MockButton({ children, ...props }) {
  return <button {...props}>{children}</button>;
}
function MockEmptyState() {
  return null;
}
function MockErrorState() {
  return null;
}
function MockSkeleton() {
  return null;
}
jest.mock("../../components/NavBar", () => MockNavBar);
jest.mock("../../components/Footer", () => MockFooter);
jest.mock("../../components/ProductCard", () => MockProductCard);
jest.mock("../../components/ui/Reveal", () => MockReveal);
jest.mock("../../components/Pagination", () => MockPagination);
jest.mock("../../components/ui/Button", () => MockButton);
jest.mock("../../components/ui/EmptyState", () => MockEmptyState);
jest.mock("../../components/ui/ErrorState", () => MockErrorState);
jest.mock("../../components/ui/Skeleton", () => ({ CardGrid: MockSkeleton }));
jest.mock("../../lib/catalog", () => ({
  fetchCategories: () => Promise.resolve([]),
  fetchConditions: () => Promise.resolve([{ value: "Good", label: "Good" }]),
}));
jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn((path) => {
    if (path === "/api/products/filters")
      return Promise.resolve({
        brands: ["Nike"],
        styles: ["vintage"],
        sizes: ["M"],
      });
    return Promise.resolve({
      items: [{ id: "mock-product" }],
      totalPages: path.includes("minPrice") ? 2 : 1,
    });
  }),
}));

beforeEach(() => {
  window.scrollTo = jest.fn();
});

test("renders accessible controls for the catalog filters", async () => {
  render(<ProductsPage />);
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "Nike" })).toBeInTheDocument(),
  );
  expect(screen.getByRole("combobox", { name: "สไตล์" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "แบรนด์" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "ขนาด" })).toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "สภาพสินค้า" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("spinbutton", { name: "ราคาต่ำสุด" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("spinbutton", { name: "ราคาสูงสุด" }),
  ).toBeInTheDocument();
});

test("requests combined filters, retains them on page two, and clear resets the feed", async () => {
  render(<ProductsPage />);
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "Nike" })).toBeInTheDocument(),
  );
  const change = (name, value) =>
    fireEvent.change(
      screen.getByRole(
        name === "min" || name === "max" ? "spinbutton" : "combobox",
        {
          name: {
            style: "สไตล์",
            brand: "แบรนด์",
            size: "ขนาด",
            condition: "สภาพสินค้า",
            min: "ราคาต่ำสุด",
            max: "ราคาสูงสุด",
          }[name],
        },
      ),
      { target: { value } },
    );
  change("style", "vintage");
  change("brand", "Nike");
  change("size", "M");
  change("condition", "Good");
  change("min", "100");
  change("max", "900");
  const beforeApply = apiFetch.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));
  await waitFor(() =>
    expect(apiFetch.mock.calls.length).toBeGreaterThan(beforeApply),
  );
  const applied = apiFetch.mock.calls.at(-1)[0];
  expect(applied).toEqual(expect.stringContaining("style=vintage"));
  expect(applied).toEqual(expect.stringContaining("brand=Nike"));
  expect(applied).toEqual(expect.stringContaining("size=M"));
  expect(applied).toEqual(expect.stringContaining("condition=Good"));
  expect(applied).toEqual(expect.stringContaining("minPrice=100"));
  expect(applied).toEqual(expect.stringContaining("maxPrice=900"));
  fireEvent.click(screen.getByRole("button", { name: "ไปหน้าถัดไป" }));
  await waitFor(() =>
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("page=2"),
  );
  expect(apiFetch.mock.calls.at(-1)[0]).toEqual(
    expect.stringContaining("brand=Nike"),
  );
  expect(apiFetch.mock.calls.at(-1)[0]).toEqual(
    expect.stringContaining("style=vintage"),
  );
  expect(apiFetch.mock.calls.at(-1)[0]).toEqual(
    expect.stringContaining("size=M"),
  );
  expect(apiFetch.mock.calls.at(-1)[0]).toEqual(
    expect.stringContaining("condition=Good"),
  );
  expect(apiFetch.mock.calls.at(-1)[0]).toEqual(
    expect.stringContaining("minPrice=100"),
  );
  expect(apiFetch.mock.calls.at(-1)[0]).toEqual(
    expect.stringContaining("maxPrice=900"),
  );
  change("max", "800");
  fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));
  await waitFor(() =>
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("page=1"),
  );
  expect(apiFetch.mock.calls.at(-1)[0]).toContain("maxPrice=800");
  fireEvent.click(screen.getAllByRole("button", { name: "ล้างตัวกรอง" })[0]);
  await waitFor(() =>
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("/api/products/feed"),
  );
  expect(screen.getByRole("combobox", { name: "แบรนด์" })).toHaveValue("");
  expect(screen.getByRole("spinbutton", { name: "ราคาต่ำสุด" })).toHaveValue(
    null,
  );
});
