import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import RecommendedProducts from "./RecommendedProducts";
import { apiFetch } from "../../lib/api";

jest.mock("../../lib/useCatalogLiveRefresh", () => jest.fn());

jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock(
  "../ProductCard",
  () =>
    function Card({ product }) {
      return <a href={`/products/${product.id}`}>{product.title}</a>;
    },
);

beforeEach(() => apiFetch.mockReset());

it("shows personalized products, match reasons and profile link", async () => {
  apiFetch.mockResolvedValue({
    personalized: true,
    items: [
      {
        id: "p1",
        title: "Vintage shirt",
        recommendation: {
          reasons: ["สไตล์ที่คุณชอบ", "ไซซ์ที่คุณเลือกในหมวดนี้"],
        },
      },
    ],
  });
  render(<RecommendedProducts />);
  expect(await screen.findByText("Vintage shirt")).toBeInTheDocument();
  expect(screen.getByText(/สไตล์ที่คุณชอบ · ไซซ์/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "ปรับความสนใจ" })).toHaveAttribute(
    "href",
    "/profile",
  );
});

it.each([
  "guest",
  "no-profile",
  "no-matches",
  "profile-unavailable",
  "non-customer",
])("labels %s fallback honestly", async (fallbackReason) => {
  apiFetch.mockResolvedValue({
    personalized: false,
    fallbackReason,
    items: [{ id: "p", title: "New shirt" }],
  });
  render(<RecommendedProducts />);
  expect(await screen.findByText("New shirt")).toBeInTheDocument();
  expect(screen.getByText("สินค้าใหม่ที่คุณอาจสนใจ")).toBeInTheDocument();
  if (fallbackReason === "guest")
    expect(
      screen.getByRole("link", { name: /เข้าสู่ระบบเพื่อ/ }),
    ).toHaveAttribute("href", "/login");
  expect(screen.queryByText(/คัดจากความสนใจ การค้นหา/)).not.toBeInTheDocument();
});

it("shows empty catalog and allows retry after product API errors", async () => {
  apiFetch
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ items: [], fallbackReason: "guest" });
  render(<RecommendedProducts />);
  expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }));
  expect(
    await screen.findByText(/ยังไม่มีสินค้าพร้อมขายสำหรับแนะนำ/),
  ).toBeInTheDocument();
});

it("clears prior account results and ignores responses arriving after logout", async () => {
  let resolveOld;
  apiFetch
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce({
      items: [{ id: "new", title: "Guest product" }],
      fallbackReason: "guest",
    });
  const { unmount } = render(<RecommendedProducts />);
  act(() => window.dispatchEvent(new Event("reloop:auth")));
  expect(await screen.findByText("Guest product")).toBeInTheDocument();
  await act(async () =>
    resolveOld({
      personalized: true,
      items: [{ id: "old", title: "Old private match" }],
    }),
  );
  expect(screen.queryByText("Old private match")).not.toBeInTheDocument();
  expect(apiFetch.mock.calls[0][1].signal.aborted).toBe(true);
  unmount();
  await waitFor(() =>
    expect(apiFetch.mock.calls[1][1].signal.aborted).toBe(true),
  );
});
