import { render, screen, waitFor } from "@testing-library/react";
import ProductDetailPage from "./page";
import { apiFetch } from "../../../lib/api";

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "p" }),
  useRouter: () => mockRouter,
}));
jest.mock(
  "../../../components/NavBar",
  () =>
    function Nav() {
      return null;
    },
);
jest.mock(
  "../../../components/Footer",
  () =>
    function Footer() {
      return null;
    },
);
jest.mock(
  "../../../components/MediaGallery",
  () =>
    function Media() {
      return null;
    },
);
jest.mock(
  "../../../components/ReviewMediaGallery",
  () =>
    function Reviews() {
      return null;
    },
);
jest.mock(
  "../../../components/ReportModal",
  () =>
    function Report() {
      return null;
    },
);
jest.mock(
  "../../../components/chat/ContactSellerButton",
  () =>
    function Contact() {
      return <button>ติดต่อผู้ขาย</button>;
    },
);
jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../../lib/catalog", () => ({
  fetchConditions: () => Promise.resolve([]),
}));
jest.mock("../../../lib/auth", () => ({
  getAccessToken: () => "token",
  getAccessTokenClaims: () => ({ sub: "buyer" }),
  getStoredUser: () => ({ id: "buyer" }),
  getCurrentRoles: () => ["BUYER"],
  isCustomerAccountRoles: () => true,
  canPurchaseProduct: () => true,
}));

function setup(status) {
  apiFetch.mockImplementation((path) => {
    if (path === "/api/products/p")
      return Promise.resolve({
        id: "p",
        title: "Test listing",
        sellerId: "seller",
        status,
        price: 100,
        media: [],
        tags: [],
      });
    if (path.includes("/public"))
      return Promise.resolve({ firstName: "Seller", lastName: "Test" });
    if (path.includes("/summary"))
      return Promise.resolve({ total: 0, averageRating: 0 });
    if (path.includes("campaigns")) return Promise.resolve([]);
    return Promise.resolve({ items: [], totalPages: 1 });
  });
  return render(<ProductDetailPage />);
}

beforeEach(() => jest.clearAllMocks());

test("TC19: sold listing keeps its sold badge but has no new-chat button", async () => {
  setup("sold");
  await screen.findByRole("heading", { name: "Test listing" });
  expect(screen.getByText("ขายแล้ว")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "ติดต่อผู้ขาย" }),
  ).not.toBeInTheDocument();
});

test("available listing still offers contact seller", async () => {
  setup("available");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "ติดต่อผู้ขาย" }),
    ).toBeInTheDocument(),
  );
});
