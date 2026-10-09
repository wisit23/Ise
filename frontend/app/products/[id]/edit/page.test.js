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

test("an available product can still be deleted after confirmation", async () => {
  setup("available");
  fireEvent.click(await screen.findByRole("button", { name: "ลบสินค้า" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/store/seller"));
  expect(apiFetch).toHaveBeenCalledWith("/api/products/p", {
    method: "DELETE",
    token: "token",
  });
});
