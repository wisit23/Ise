import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import ProductDetailPage from "./page";
import { apiFetch } from "../../../lib/api";

const mockRouter = { push: jest.fn() };
let currentRouteId = "p";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: currentRouteId }),
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
    function Report({ open, title, targetId, productId, productLabel }) {
      return open ? (
        <div
          role="dialog"
          aria-label={title}
          data-target-id={targetId}
          data-product-id={productId}
        >
          {productLabel}
        </div>
      ) : null;
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

let currentAuth = {
  token: "buyer-token",
  claims: { sub: "buyer" },
  user: { id: "buyer" },
  roles: ["BUYER"],
  isCustomerAccountRoles: true,
  canPurchase: true,
};

jest.mock("../../../lib/auth", () => ({
  getAccessToken: () => currentAuth.token,
  getAccessTokenClaims: () => currentAuth.claims,
  getStoredUser: () => currentAuth.user,
  getCurrentRoles: () => currentAuth.roles,
  isCustomerAccountRoles: () => currentAuth.isCustomerAccountRoles,
  canPurchaseProduct: (params) => {
    if (params?.userId && params.userId === params?.sellerId) return false;
    if (!params?.isAuthenticated) return true;
    return Boolean(currentAuth.canPurchase);
  },
}));

function mockApiResponses({
  productId = "p",
  sellerId = "seller",
  price = 100,
  status = "available",
  applicable = [],
  available = [],
} = {}) {
  apiFetch.mockImplementation((path) => {
    if (path === `/api/products/${productId}`) {
      return Promise.resolve({
        id: productId,
        title: `Listing ${productId}`,
        sellerId,
        status,
        price,
        media: [],
        tags: [],
        category: "Clothing",
      });
    }
    if (path.includes("/public")) {
      return Promise.resolve({ firstName: "Seller", lastName: "Test", shopName: "Best Shop" });
    }
    if (path.includes("/summary")) {
      return Promise.resolve({ total: 0, averageRating: 0 });
    }
    if (path === "/api/products/campaigns/applicable") {
      return Promise.resolve(applicable);
    }
    if (path === "/api/products/campaigns/available") {
      return Promise.resolve(available);
    }
    if (path.includes("/orders/mine")) {
      return Promise.resolve({ items: [] });
    }
    return Promise.resolve({ items: [], totalPages: 1 });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  currentRouteId = "p";
  currentAuth = {
    token: "buyer-token",
    claims: { sub: "buyer" },
    user: { id: "buyer" },
    roles: ["BUYER"],
    isCustomerAccountRoles: true,
    canPurchase: true,
  };
});

test("TC19: sold listing keeps its sold badge but has no new-chat button", async () => {
  mockApiResponses({ status: "sold" });
  render(<ProductDetailPage />);
  await screen.findByRole("heading", { name: "Listing p" });
  expect(screen.getByText("ขายแล้ว")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ติดต่อผู้ขาย" })).not.toBeInTheDocument();
});

test("seller cannot edit or delete a sold product from the board", async () => {
  currentAuth.user = { id: "seller" };
  currentAuth.claims = { sub: "seller" };
  currentAuth.roles = ["SELLER"];
  mockApiResponses({ status: "sold" });
  render(<ProductDetailPage />);
  expect(await screen.findByText("สินค้านี้ขายแล้ว ไม่สามารถแก้ไขหรือลบได้")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "แก้ไขสินค้านี้" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ลบสินค้านี้" })).not.toBeInTheDocument();
});

test("reports the current product with its seller so it enters the product report queue", async () => {
  mockApiResponses({ productId: "p-report", sellerId: "seller-report" });
  currentRouteId = "p-report";
  render(<ProductDetailPage />);
  fireEvent.click(await screen.findByRole("button", { name: "รายงานสินค้า" }));
  const dialog = screen.getByRole("dialog", { name: "รายงานสินค้า" });
  expect(dialog).toHaveAttribute("data-product-id", "p-report");
  expect(dialog).toHaveAttribute("data-target-id", "seller-report");
  expect(dialog).toHaveTextContent("Listing p-report");
  expect(screen.queryByRole("button", { name: "รายงานผู้ขายรายนี้" })).toBeNull();
});

test("available listing still offers contact seller", async () => {
  mockApiResponses({ status: "available" });
  render(<ProductDetailPage />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "ติดต่อผู้ขาย" })).toBeInTheDocument();
  });
});

test("shows why an owned voucher is unavailable and does not offer to claim it again", async () => {
  const campaign = {
    id: "campaign-tete",
    code: "TETE",
    name: "team",
    discountType: "PERCENT",
    discountValue: 15,
    maxDiscount: 200,
  };
  mockApiResponses({
    price: 450,
    applicable: {
      applicable: [],
      unavailable: [
        {
          id: "voucher-tete",
          campaignId: campaign.id,
          campaign,
          eligible: false,
          reasonCode: "BUDGET_INSUFFICIENT",
          reasonMessage:
            "โค้ดนี้ใช้ไม่ได้กับสินค้านี้ เพราะวงเงินส่วนลดของแคมเปญคงเหลือไม่เพียงพอ",
        },
      ],
    },
    available: [campaign],
  });

  render(<ProductDetailPage />);

  expect(
    await screen.findByText("คุณมีโค้ดส่วนลดในกระเป๋า (1 ใบ)"),
  ).toBeInTheDocument();
  expect(screen.getByText("กดเพื่อดูโค้ดและเงื่อนไขการใช้")).toBeInTheDocument();
  expect(
    screen.queryByText(
      "โค้ดนี้ใช้ไม่ได้กับสินค้านี้ เพราะวงเงินส่วนลดของแคมเปญคงเหลือไม่เพียงพอ",
    ),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "เก็บโค้ด" })).not.toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledWith(
    "/api/products/campaigns/applicable",
    expect.objectContaining({
      body: expect.objectContaining({ includeUnavailable: true }),
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "เลือกโค้ดส่วนลด" }));
  expect(screen.getByText("โค้ดที่ใช้กับสินค้านี้ไม่ได้ (1 ใบ):")).toBeInTheDocument();
  expect(
    screen.getByText(
      "โค้ดนี้ใช้ไม่ได้กับสินค้านี้ เพราะวงเงินส่วนลดของแคมเปญคงเหลือไม่เพียงพอ",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ใช้ไม่ได้" })).toBeDisabled();
});

describe("MKT Coupon State Regression Suite - Account Switching & Ownership", () => {
  test("1 & 2. A มีคูปองและเปิด Modal → สลับเป็น B ที่ไม่ใช่เจ้าของ → คูปองเดิมหาย Modal ปิด และราคากลับเป็นราคาปกติทันที แม้ API ของ B ยังไม่ตอบ และเมื่อ API ของ B ตอบ แสดงเฉพาะคูปองของ B", async () => {
    // ผู้ใช้ A มีคูปองและเปิด Modal
    currentAuth = {
      token: "token-a",
      claims: { sub: "buyer-a" },
      user: { id: "buyer-a" },
      roles: ["BUYER"],
      isCustomerAccountRoles: true,
      canPurchase: true,
    };

    let resolveB;
    const pendingPromiseB = new Promise((resolve) => {
      resolveB = resolve;
    });

    apiFetch.mockImplementation((path, options) => {
      if (path === "/api/products/p") {
        return Promise.resolve({
          id: "p",
          title: "Listing p",
          sellerId: "seller-store",
          status: "available",
          price: 1000,
          media: [],
          tags: [],
          category: "Fashion",
        });
      }
      if (path.includes("/public")) return Promise.resolve({ shopName: "Seller Store" });
      if (path.includes("/summary")) return Promise.resolve({ total: 0, averageRating: 0 });
      if (path === "/api/products/campaigns/applicable") {
        if (options?.token === "token-a") {
          return Promise.resolve([
            {
              id: "v-a",
              campaignId: "c-a",
              finalPrice: 800,
              estimatedDiscount: 200,
              campaign: { code: "VOUCHER_A", name: "คูปอง A ลด 200" },
            },
          ]);
        }
        if (options?.token === "token-b") {
          return pendingPromiseB;
        }
      }
      if (path === "/api/products/campaigns/available") return Promise.resolve([]);
      return Promise.resolve({ items: [] });
    });

    render(<ProductDetailPage />);
    await screen.findByText("฿800");
    expect(screen.getByText("VOUCHER_A")).toBeInTheDocument();

    // เปิด Modal ทิ้งไว้
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนโค้ด" }));
    expect(screen.getByText("เลือกโค้ดส่วนลด")).toBeInTheDocument();

    // สลับเป็นบัญชี B (ไม่ใช่เจ้าของ)
    currentAuth = {
      token: "token-b",
      claims: { sub: "buyer-b" },
      user: { id: "buyer-b" },
      roles: ["BUYER"],
      isCustomerAccountRoles: true,
      canPurchase: true,
    };

    act(() => {
      window.dispatchEvent(new Event("reloop:auth"));
    });

    // 1. คูปองเดิมหาย Modal ปิด และราคากลับเป็นราคาปกติ ฿1,000 ทันที แม้ API ของ B ยังไม่ตอบ
    expect(screen.queryByText("฿800")).not.toBeInTheDocument();
    expect(screen.queryByText("VOUCHER_A")).not.toBeInTheDocument();
    expect(screen.queryByText("เลือกโค้ดส่วนลด")).not.toBeInTheDocument(); // modal ปิด
    expect(screen.getByText("฿1,000")).toBeInTheDocument(); // แสดงราคาปกติ

    // 2. เมื่อ API ของ B ตอบ แสดงเฉพาะคูปองของ B
    await act(async () => {
      resolveB([
        {
          id: "v-b",
          campaignId: "c-b",
          finalPrice: 700,
          estimatedDiscount: 300,
          campaign: { code: "VOUCHER_B", name: "คูปอง B ลด 300" },
        },
      ]);
    });

    await screen.findByText("฿700");
    expect(screen.getByText("VOUCHER_B")).toBeInTheDocument();
    expect(screen.queryByText("VOUCHER_A")).not.toBeInTheDocument();
    expect(screen.queryByText("฿800")).not.toBeInTheDocument();
  });

  test("3. API ของ A ตอบช้าหลังเปลี่ยนบัญชี ต้องไม่เขียนทับข้อมูล B", async () => {
    currentAuth = {
      token: "token-a",
      claims: { sub: "buyer-a" },
      user: { id: "buyer-a" },
      roles: ["BUYER"],
      isCustomerAccountRoles: true,
      canPurchase: true,
    };

    let resolveA;
    const pendingPromiseA = new Promise((resolve) => {
      resolveA = resolve;
    });

    apiFetch.mockImplementation((path, options) => {
      if (path === "/api/products/p") {
        return Promise.resolve({
          id: "p",
          title: "Listing p",
          sellerId: "seller-store",
          status: "available",
          price: 500,
          media: [],
          tags: [],
          category: "Fashion",
        });
      }
      if (path.includes("/public")) return Promise.resolve({ shopName: "Store" });
      if (path.includes("/summary")) return Promise.resolve({ total: 0, averageRating: 0 });
      if (path === "/api/products/campaigns/applicable") {
        if (options?.token === "token-a") {
          return pendingPromiseA;
        }
        if (options?.token === "token-b") {
          return Promise.resolve([
            {
              id: "v-b",
              campaignId: "c-b",
              finalPrice: 350,
              estimatedDiscount: 150,
              campaign: { code: "B_QUICK", name: "คูปอง B" },
            },
          ]);
        }
      }
      if (path === "/api/products/campaigns/available") return Promise.resolve([]);
      return Promise.resolve({ items: [] });
    });

    render(<ProductDetailPage />);
    await screen.findByRole("heading", { name: "Listing p" });

    // ขณะที่ API ของ A ยังค้างอยู่ สลับเป็น B ทันที
    currentAuth = {
      token: "token-b",
      claims: { sub: "buyer-b" },
      user: { id: "buyer-b" },
      roles: ["BUYER"],
      isCustomerAccountRoles: true,
      canPurchase: true,
    };

    act(() => {
      window.dispatchEvent(new Event("reloop:auth"));
    });

    // B ตอบกลับและแสดงคูปองของ B
    await screen.findByText("฿350");
    expect(screen.getByText("B_QUICK")).toBeInTheDocument();

    // ตอนนี้ให้ API ช้าของ A ตอบกลับ
    await act(async () => {
      resolveA([
        {
          id: "v-a-late",
          campaignId: "c-a-late",
          finalPrice: 200,
          estimatedDiscount: 300,
          campaign: { code: "A_LATE", name: "คูปองมาช้าของ A" },
        },
      ]);
    });

    // ข้อมูลของ A ที่มาช้าต้องไม่เขียนทับ B
    expect(screen.queryByText("A_LATE")).not.toBeInTheDocument();
    expect(screen.queryByText("฿200")).not.toBeInTheDocument();
    expect(screen.getByText("B_QUICK")).toBeInTheDocument();
    expect(screen.getByText("฿350")).toBeInTheDocument();
  });

  test("4. ออกจากระบบแล้วไม่มีคูปองส่วนบุคคลของบัญชีเก่าค้าง", async () => {
    currentAuth = {
      token: "token-a",
      claims: { sub: "buyer-a" },
      user: { id: "buyer-a" },
      roles: ["BUYER"],
      isCustomerAccountRoles: true,
      canPurchase: true,
    };

    mockApiResponses({
      productId: "p",
      sellerId: "seller-store",
      price: 500,
      status: "available",
      applicable: [
        {
          id: "v-a",
          campaignId: "c-a",
          finalPrice: 400,
          estimatedDiscount: 100,
          campaign: { code: "SECRET100", name: "คูปองส่วนตัว A" },
        },
      ],
      available: [
        {
          id: "c-guest",
          discountType: "FIXED",
          discountValue: 20,
          name: "โปรส่วนลดทั่วไป",
        },
      ],
    });

    render(<ProductDetailPage />);
    await screen.findByText("฿400");
    expect(screen.getByText("SECRET100")).toBeInTheDocument();

    // ผู้ใช้ออกจากระบบ
    currentAuth = {
      token: null,
      claims: null,
      user: null,
      roles: [],
      isCustomerAccountRoles: false,
      canPurchase: true,
    };

    act(() => {
      window.dispatchEvent(new Event("reloop:auth"));
    });

    // คูปองส่วนตัวของ A หายไปทันที และแสดงราคาปกติ ฿500
    await waitFor(() => {
      expect(screen.queryByText("SECRET100")).not.toBeInTheDocument();
      expect(screen.queryByText("฿400")).not.toBeInTheDocument();
      expect(screen.getByText("฿500")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "เปลี่ยนโค้ด" })).not.toBeInTheDocument();
  });

  test("5. auth event หรือ token refresh ของบัญชีเดิม ไม่ทำให้คูปองที่เลือกหายโดยไม่จำเป็น", async () => {
    currentAuth = {
      token: "token-initial",
      claims: { sub: "buyer-same" },
      user: { id: "buyer-same" },
      roles: ["BUYER"],
      isCustomerAccountRoles: true,
      canPurchase: true,
    };

    mockApiResponses({
      productId: "p",
      sellerId: "seller-store",
      price: 500,
      status: "available",
      applicable: [
        {
          id: "v-1",
          campaignId: "c-1",
          finalPrice: 450,
          estimatedDiscount: 50,
          campaign: { code: "KEEP50", name: "คูปอง 50" },
        },
      ],
      available: [],
    });

    render(<ProductDetailPage />);
    await screen.findByText("฿450");
    expect(screen.getByText("KEEP50")).toBeInTheDocument();

    // เปิด Modal ทิ้งไว้
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนโค้ด" }));
    expect(screen.getByText("เลือกโค้ดส่วนลด")).toBeInTheDocument();

    // จำลอง token refresh ของบัญชีเดิม (sub เดิม, user เดิม)
    currentAuth.token = "token-refreshed";
    act(() => {
      window.dispatchEvent(new Event("reloop:auth"));
    });

    // คูปองและราคาที่เลือกไว้ต้องยังอยู่ และ Modal ยังเปิดอยู่ ไม่ถูกรีเซ็ตทิ้ง
    expect(screen.getAllByText("KEEP50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("฿450").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("เลือกโค้ดส่วนลด")).toBeInTheDocument();
  });

  test("6. เจ้าของสินค้าและผู้ขายที่ซื้อร้านอื่นยังทำงานถูกต้อง", async () => {
    // 6.1 เจ้าของสินค้า: เห็นราคาปกติ ไม่เห็น UI คูปองและไม่เรียก API คูปอง
    currentAuth = {
      token: "seller-owner-token",
      claims: { sub: "my-seller-id" },
      user: { id: "my-seller-id" },
      roles: ["SELLER"],
      isCustomerAccountRoles: true,
      canPurchase: false,
    };

    mockApiResponses({
      productId: "p",
      sellerId: "my-seller-id",
      price: 800,
      status: "available",
      applicable: [
        {
          id: "v-hidden",
          campaignId: "c-h",
          finalPrice: 600,
          estimatedDiscount: 200,
          campaign: { code: "NO_SEE", name: "ห้ามเห็น" },
        },
      ],
      available: [],
    });

    const { rerender } = render(<ProductDetailPage />);
    await screen.findByRole("heading", { name: "Listing p" });

    expect(screen.getByText("฿800")).toBeInTheDocument();
    expect(screen.queryByText("NO_SEE")).not.toBeInTheDocument();
    expect(screen.queryByText("฿600")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "แก้ไขสินค้านี้" })).toBeInTheDocument();

    // 6.2 ผู้ขายคนเดิมไปดูสินค้าร้านอื่น (other-store): ต้องเห็นและใช้คูปองได้ตามปกติ ไม่ถูกบล็อกด้วย Role SELLER
    currentRouteId = "p-other-store";
    apiFetch.mockImplementation((path) => {
      if (path === "/api/products/p-other-store") {
        return Promise.resolve({
          id: "p-other-store",
          title: "Other Shop Listing",
          sellerId: "other-seller-id",
          status: "available",
          price: 1200,
          media: [],
          tags: [],
          category: "Fashion",
        });
      }
      if (path.includes("/public")) return Promise.resolve({ shopName: "Other Shop" });
      if (path.includes("/summary")) return Promise.resolve({ total: 0, averageRating: 0 });
      if (path === "/api/products/campaigns/applicable") {
        return Promise.resolve([
          {
            id: "v-other",
            campaignId: "c-other",
            finalPrice: 1000,
            estimatedDiscount: 200,
            campaign: { code: "SELLER_CAN_BUY", name: "ผู้ขายซื้อร้านอื่นได้" },
          },
        ]);
      }
      return Promise.resolve({ items: [] });
    });

    rerender(<ProductDetailPage />);
    await screen.findByRole("heading", { name: "Other Shop Listing" });
    await screen.findByText("฿1,000");
    expect(screen.getByText("SELLER_CAN_BUY")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เปลี่ยนโค้ด" })).toBeInTheDocument();
  });

  test("7. ป้องกัน selectedVoucher ค้างเมื่อเปลี่ยนสินค้า: จากสินค้าร้านอื่นไปยังสินค้าของตัวเอง", async () => {
    currentAuth = {
      token: "seller-01-token",
      claims: { sub: "seller-01" },
      user: { id: "seller-01" },
      roles: ["SELLER"],
      isCustomerAccountRoles: true,
      canPurchase: true,
    };

    currentRouteId = "p-other";
    apiFetch.mockImplementation((path) => {
      if (path === "/api/products/p-other") {
        return Promise.resolve({
          id: "p-other",
          title: "Other Product",
          sellerId: "seller-02",
          status: "available",
          price: 200,
          media: [],
          tags: [],
          category: "Electronics",
        });
      }
      if (path === "/api/products/p-own") {
        return Promise.resolve({
          id: "p-own",
          title: "My Own Product",
          sellerId: "seller-01",
          status: "available",
          price: 900,
          media: [],
          tags: [],
          category: "Electronics",
        });
      }
      if (path.includes("/public")) return Promise.resolve({ firstName: "Shop", lastName: "Owner" });
      if (path.includes("/summary")) return Promise.resolve({ total: 0, averageRating: 0 });
      if (path === "/api/products/campaigns/applicable") {
        return Promise.resolve([
          {
            id: "v-other",
            campaignId: "c-other",
            finalPrice: 160,
            estimatedDiscount: 40,
            campaign: { code: "FLASH40", name: "ลด 40" },
          },
        ]);
      }
      if (path === "/api/products/campaigns/available") return Promise.resolve([]);
      return Promise.resolve({ items: [] });
    });

    const { rerender } = render(<ProductDetailPage />);
    await screen.findByRole("heading", { name: "Other Product" });
    await screen.findByText("฿160");
    expect(screen.getByText("FLASH40")).toBeInTheDocument();

    // นำทางไปยังสินค้าของตัวเอง (p-own)
    currentRouteId = "p-own";
    rerender(<ProductDetailPage />);

    await screen.findByRole("heading", { name: "My Own Product" });
    await waitFor(() => {
      expect(screen.queryByText("฿160")).not.toBeInTheDocument();
      expect(screen.queryByText("FLASH40")).not.toBeInTheDocument();
      expect(screen.getByText("฿900")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "เปลี่ยนโค้ด" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เลือกโค้ดส่วนลด" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "แก้ไขสินค้านี้" })).toBeInTheDocument();
  });
});

test("adding a product reserves a cart item without creating an order", async () => {
  mockApiResponses({ status: "available" });
  render(<ProductDetailPage />);
  fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลงตะกร้า" }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith("/api/orders/cart", {
      method: "POST",
      token: "buyer-token",
      body: { productId: "p", campaignId: null },
    }),
  );
  expect(
    apiFetch.mock.calls.some(
      ([path, options]) => path === "/api/orders" && options?.method === "POST",
    ),
  ).toBe(false);
});

test("displays view count badge with accurate count", async () => {
  apiFetch.mockImplementation((path) => {
    if (path.startsWith("/api/products/p"))
      return Promise.resolve({
        id: "p",
        title: "View count test listing",
        sellerId: "seller-123",
        status: "available",
        price: 100,
        viewCount: 42,
        media: [],
        tags: [],
      });
    if (path.includes("/public"))
      return Promise.resolve({ firstName: "Seller", lastName: "Test" });
    if (path.includes("/summary"))
      return Promise.resolve({ total: 0, averageRating: 0 });
    return Promise.resolve({ items: [], totalPages: 1 });
  });

  render(<ProductDetailPage />);
  expect(await screen.findByTestId("product-view-count")).toBeInTheDocument();
  expect(screen.getByText(/เข้าชม 42 ครั้ง/)).toBeInTheDocument();
});

test("displays 0 views when viewCount is 0", async () => {
  apiFetch.mockImplementation((path) => {
    if (path.startsWith("/api/products/p"))
      return Promise.resolve({
        id: "p",
        title: "View count test listing",
        sellerId: "seller-123",
        status: "available",
        price: 100,
        viewCount: 0,
        media: [],
        tags: [],
      });
    if (path.includes("/public"))
      return Promise.resolve({ firstName: "Seller", lastName: "Test" });
    if (path.includes("/summary"))
      return Promise.resolve({ total: 0, averageRating: 0 });
    return Promise.resolve({ items: [], totalPages: 1 });
  });

  render(<ProductDetailPage />);
  expect(await screen.findByTestId("product-view-count")).toBeInTheDocument();
  expect(screen.getByText(/เข้าชม 0 ครั้ง/)).toBeInTheDocument();
});

test("shows 'หมด' and shipped banner when seller product order is shipped", async () => {
  currentAuth = {
    token: "seller-token",
    claims: { sub: "user-1" },
    user: { id: "user-1" },
    roles: ["SELLER"],
    isCustomerAccountRoles: false,
    canPurchase: false,
  };

  apiFetch.mockImplementation((path) => {
    if (path === "/api/products/p") {
      return Promise.resolve({
        id: "p",
        title: "Listing p",
        sellerId: "user-1",
        status: "available",
        price: 100,
        media: [],
        tags: [],
        category: "Clothing",
      });
    }
    if (path.includes("/orders/selling")) {
      return Promise.resolve({
        items: [{
          id: "order-1",
          productId: "p",
          status: "in_transit",
        }],
      });
    }
    if (path.includes("/public")) {
      return Promise.resolve({ firstName: "Seller", lastName: "Test", shopName: "Best Shop" });
    }
    if (path.includes("/summary")) {
      return Promise.resolve({ total: 0, averageRating: 0 });
    }
    return Promise.resolve({ items: [], totalPages: 1 });
  });

  render(<ProductDetailPage />);
  await screen.findByRole("heading", { name: "Listing p" });
  await waitFor(() => {
    expect(screen.getByText("หมด")).toBeInTheDocument();
  });
  expect(screen.getByText(/สินค้านี้อยู่ระหว่างการขนส่ง/)).toBeInTheDocument();
});
