import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditProductPage from "./page";
import { apiFetch } from "../../../../lib/api";

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "p" }),
  useRouter: () => mockRouter,
}));
jest.mock(
  "../../../../components/NavBar",
  () =>
    function Nav() {
      return null;
    },
);
jest.mock(
  "../../../../components/Footer",
  () =>
    function Footer() {
      return null;
    },
);
jest.mock(
  "../../../../components/MediaUploader",
  () =>
    function Media() {
      return null;
    },
);
jest.mock(
  "../../../../components/TagInput",
  () =>
    function Tags() {
      return null;
    },
);
jest.mock("../../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../../../lib/auth", () => ({
  getAccessToken: () => "token",
  getStoredUser: () => ({ id: "seller" }),
}));
jest.mock("../../../../lib/catalog", () => ({
  fetchCategories: () => Promise.resolve([]),
  fetchConditions: () => Promise.resolve([]),
}));

function setup(status, preRemovalStatus) {
  apiFetch.mockImplementation((path, options) =>
    Promise.resolve(
      options?.method === "DELETE"
        ? null
        : {
            id: "p",
            sellerId: "seller",
            title: "Test product",
            price: 100,
            status,
            preRemovalStatus,
            description: "",
            category: "",
            condition: "Good",
            media: [],
            tags: [],
          },
    ),
  );
  return render(<EditProductPage />);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

test.each([["sold", null], ["hidden", "sold"]])(
  "%s sold product is read-only even when opening the edit URL directly",
  async (status, previous) => {
    setup(status, previous);
    expect(await screen.findByText("สินค้านี้ขายแล้ว ไม่สามารถแก้ไขหรือลบได้")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ลบสินค้า" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "กลับไปดูสินค้า" })).toHaveAttribute("href", "/products/p");
    expect(apiFetch.mock.calls.some(([, options]) => ["PATCH", "DELETE"].includes(options?.method))).toBe(false);
  },
);

test.each([
  ["reserved", null],
  ["hidden", "reserved"],
])(
  "TC18: %s locked product has a disabled delete button and explanation",
  async (status, previous) => {
    setup(status, previous);
    const button = await screen.findByRole("button", { name: "ลบสินค้า" });
    expect(button).toBeDisabled();
    expect(
      screen.getByText("ไม่สามารถลบสินค้าที่อยู่ระหว่างการสั่งซื้อได้"),
    ).toBeInTheDocument();
    fireEvent.click(button);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(
      apiFetch.mock.calls.some(([, options]) => options?.method === "DELETE"),
    ).toBe(false);
  },
);

test("an available product can still be deleted after confirmation in pop-up", async () => {
  setup("available");
  fireEvent.click(await screen.findByRole("button", { name: "ลบสินค้า" }));
  expect(screen.getByText("ยืนยันการลบสินค้า")).toBeInTheDocument();

  // Click confirm inside pop-up
  fireEvent.click(await screen.findByRole("button", { name: "ยืนยันการลบ" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/store/seller"));
  expect(apiFetch).toHaveBeenCalledWith("/api/products/p", {
    method: "DELETE",
    token: "token",
  });
});

test("canceling in the delete pop-up does not delete product", async () => {
  setup("available");
  fireEvent.click(await screen.findByRole("button", { name: "ลบสินค้า" }));
  expect(screen.getByText("ยืนยันการลบสินค้า")).toBeInTheDocument();

  // Click cancel inside pop-up
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(
    apiFetch.mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  expect(mockPush).not.toHaveBeenCalled();
});

test("changing price when product is reserved shows error that price cannot be changed", async () => {
  setup("reserved");
  expect(
    await screen.findByText(
      "สินค้านี้อยู่ในตะกร้าหรืออยู่ระหว่างการสั่งซื้อ ไม่สามารถเปลี่ยนราคาได้",
    ),
  ).toBeInTheDocument();

  const priceInput = await screen.findByLabelText(/ราคา/);
  fireEvent.change(priceInput, { target: { value: "200" } });
  fireEvent.submit(priceInput.closest("form"));

  expect(
    await screen.findByText("ไม่สามารถเปลี่ยนราคาสินค้าที่อยู่ระหว่างการสั่งซื้อได้"),
  ).toBeInTheDocument();
  expect(
    apiFetch.mock.calls.some(([, options]) => options?.method === "PATCH"),
  ).toBe(false);
});

test("editing other fields when product is reserved shows error that product cannot be edited", async () => {
  setup("reserved");
  const priceInput = await screen.findByLabelText(/ราคา/);
  fireEvent.submit(priceInput.closest("form"));

  expect(
    await screen.findByText("ไม่สามารถแก้ไขสินค้าที่อยู่ระหว่างการสั่งซื้อได้"),
  ).toBeInTheDocument();
  expect(
    apiFetch.mock.calls.some(([, options]) => options?.method === "PATCH"),
  ).toBe(false);
});
