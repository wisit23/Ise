import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ProductsPage from "./page";
import { apiFetch } from "../../lib/api";

let mockSearchQuery = "";
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearchQuery),
}));
function MockNavBar() {
  return <nav />;
}
function MockFooter() {
  return <footer />;
}
function MockProductCard({ product }) {
  return <article>{product.title}</article>;
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
  localStorage.clear();
  mockSearchQuery = "";
  apiFetch.mockClear();
});

test("renders accessible controls for the catalog filters", async () => {
  render(<ProductsPage />);
  await waitFor(() =>
    expect(
      screen.getByRole("option", { name: "Nike", hidden: true }),
    ).toBeInTheDocument(),
  );
  expect(screen.getByLabelText("สไตล์")).toBeInTheDocument();
  expect(screen.getByLabelText("แบรนด์")).toBeInTheDocument();
  expect(screen.getByLabelText("ขนาด")).toBeInTheDocument();
  expect(screen.getByLabelText("สภาพสินค้า")).toBeInTheDocument();
  expect(
    screen.getByRole("spinbutton", { name: "ราคาต่ำสุด" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("spinbutton", { name: "ราคาสูงสุด" }),
  ).toBeInTheDocument();
});

test("submitted search is recorded before personalized results; paging does not record again", async () => {
  localStorage.setItem(
    "reloop_access_token",
    `header.${btoa(JSON.stringify({ sub: "buyer", roles: ["BUYER"] }))}.signature`,
  );
  mockSearchQuery = "q=Nike";
  render(<ProductsPage />);
  await waitFor(() =>
    expect(
      apiFetch.mock.calls.some(([path]) =>
        path.startsWith("/api/products/recommendations?"),
      ),
    ).toBe(true),
  );
  const writes = apiFetch.mock.calls.filter(([path]) =>
    path.endsWith("/search-events"),
  );
  expect(writes).toHaveLength(1);
  expect(writes[0][1]).toEqual(
    expect.objectContaining({ method: "POST", body: { query: "Nike" } }),
  );
  const ranked = apiFetch.mock.calls.find(([path]) =>
    path.startsWith("/api/products/recommendations?"),
  );
  expect(ranked[0]).toContain("q=Nike");
  const firstSeed = new URLSearchParams(ranked[0].split("?")[1]).get("seed");
  expect(firstSeed).toBeTruthy();
  fireEvent.change(screen.getByRole("spinbutton", { name: "ราคาต่ำสุด" }), {
    target: { value: "100" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ใช้ตัวกรอง" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "ไปหน้าถัดไป" }),
    ).toBeInTheDocument(),
  );
  const countBeforePage = apiFetch.mock.calls.filter(([path]) =>
    path.endsWith("/search-events"),
  ).length;
  fireEvent.click(screen.getByRole("button", { name: "ไปหน้าถัดไป" }));
  await waitFor(() =>
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("page=2"),
  );
  expect(
    apiFetch.mock.calls.filter(([path]) => path.endsWith("/search-events")),
  ).toHaveLength(countBeforePage);
  expect(
    new URLSearchParams(apiFetch.mock.calls.at(-1)[0].split("?")[1]).get(
      "seed",
    ),
  ).toBe(firstSeed);
});

test("account changes cancel old results and show only the current account's catalog", async () => {
  const original = apiFetch.getMockImplementation();
  let resolveOld;
  let reads = 0;
  apiFetch.mockImplementation((path, options) => {
    if (path.startsWith("/api/products/recommendations?")) {
      reads++;
      if (reads === 1)
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return Promise.resolve({
        items: [{ id: "new", title: "New account result" }],
        totalPages: 1,
        personalized: true,
      });
    }
    return original(path, options);
  });
  try {
    render(<ProductsPage />);
    act(() => window.dispatchEvent(new Event("reloop:auth")));
    expect(await screen.findByText("New account result")).toBeInTheDocument();
    await act(async () =>
      resolveOld({
        items: [{ id: "old", title: "Old account result" }],
        totalPages: 1,
      }),
    );
    expect(screen.queryByText("Old account result")).not.toBeInTheDocument();
    expect(screen.getByText(/เรียงตามความสนใจ/)).toBeInTheDocument();
  } finally {
    apiFetch.mockImplementation(original);
  }
});

test("requests personalized catalog, keeps all filters on page two, and clear resets filters", async () => {
  render(<ProductsPage />);
  await waitFor(() =>
    expect(
      screen.getByRole("option", { name: "Nike", hidden: true }),
    ).toBeInTheDocument(),
  );
  const change = (name, value) =>
    fireEvent.change(
      screen.getByLabelText(
        {
          style: "สไตล์",
          brand: "แบรนด์",
          size: "ขนาด",
          condition: "สภาพสินค้า",
          min: "ราคาต่ำสุด",
          max: "ราคาสูงสุด",
        }[name],
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
    expect(apiFetch.mock.calls.at(-1)[0]).toContain(
      "/api/products/recommendations?",
    ),
  );
  expect(screen.getByLabelText("แบรนด์")).toHaveValue("");
  expect(screen.getByRole("spinbutton", { name: "ราคาต่ำสุด" })).toHaveValue(
    null,
  );
});
