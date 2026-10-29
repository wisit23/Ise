import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import ProfilePage from "./page";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";

jest.mock(
  "../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock(
  "../../components/Footer",
  () =>
    function MockFooter() {
      return <footer aria-label="footer" />;
    },
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace };
const mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: (url) => url,
}));

jest.mock("../../lib/products", () => ({
  fetchProduct: jest.fn((id) =>
    Promise.resolve({
      id,
      media: [{ type: "image", url: `/uploads/${id}.jpg` }],
    }),
  ),
}));
jest.mock("../../lib/sellers", () => ({
  fetchSellerSummary: jest.fn(() => Promise.resolve({ shopName: "ร้านทดสอบ" })),
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
  getRefreshToken: jest.fn(),
  saveSession: jest.fn(),
}));

const USER = {
  id: "u-1",
  firstName: "สมชาย",
  lastName: "ใจดี",
  email: "somchai@example.com",
  phone: "0812345678",
  role: "BUYER",
};

const ORDERS_RESPONSE = {
  items: [
    {
      id: "order-1",
      productId: "product-1",
      productTitle: "เสื้อเชิ้ตจากฐานข้อมูล",
      price: 890,
      status: "pending_payment",
      checkoutSessionId: "checkout-qr-1",
      createdAt: "2025-04-12T00:00:00.000Z",
    },
    {
      id: "order-2",
      productId: "product-2",
      productTitle: "กระเป๋าที่ซื้อสำเร็จ",
      price: 1290,
      status: "completed",
      dispute: null,
      deliveredAt: new Date().toISOString(),
      createdAt: "2025-04-11T00:00:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  totalPages: 1,
};

const SAVED_ADDRESSES = [
  {
    id: "address-1",
    recipientName: "สมชาย ใจดี",
    phone: "0812345678",
    addressLine: "99 ถนนสุขุมวิท",
    subdistrict: "คลองเตย",
    district: "คลองเตย",
    province: "กรุงเทพมหานคร",
    postalCode: "10110",
    isDefault: true,
  },
];

const VOUCHERS = [
  {
    id: "voucher-1",
    campaignId: "campaign-1",
    status: "CLAIMED",
    usedOrderId: null,
    campaign: {
      code: "SAVE200",
      name: "ลดสองร้อย",
      description: "แคมเปญจาก Marketing",
      discountType: "FIXED",
      discountValue: 200,
      minOrderPrice: 500,
      applicableCategory: null,
      endsAt: "2099-12-31T23:59:59.000Z",
    },
  },
];

describe("ProfilePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.delete("tab");
    getAccessToken.mockReturnValue("test-token");
    getStoredUser.mockReturnValue(USER);
    apiFetch.mockImplementation((path, options) => {
      if (path === "/api/auth/me") return Promise.resolve(USER);
      if (path === "/api/auth/me/style-profile") {
        return Promise.resolve(
          options?.body || {
            categories: [],
            styles: [],
            brands: [],
            sizes: [],
            unassignedSizes: [],
          },
        );
      }
      if (path === "/api/products/categories") {
        return Promise.resolve({ items: ["เสื้อ"] });
      }
      if (path === "/api/products/filters") {
        return Promise.resolve({
          brands: ["Uniqlo"],
          styles: ["minimal"],
          sizes: ["M"],
          sizesByCategory: [{ category: "เสื้อ", values: ["M"] }],
        });
      }
      if (path === "/api/auth/me/addresses") {
        return Promise.resolve(SAVED_ADDRESSES);
      }
      if (path === "/api/products/conditions") {
        return Promise.resolve({ items: [] });
      }
      if (path.startsWith("/api/orders/mine?")) {
        const status = new URLSearchParams(path.split("?")[1]).get("status");
        return Promise.resolve({
          ...ORDERS_RESPONSE,
          items: ORDERS_RESPONSE.items.filter(
            (order) => !status || status.split(",").includes(order.status),
          ),
        });
      }
      if (path.startsWith("/api/orders/order-")) {
        return Promise.resolve(
          ORDERS_RESPONSE.items.find(
            (order) => path === `/api/orders/${order.id}`,
          ),
        );
      }
      if (path.startsWith("/api/reviews/mine?")) {
        return Promise.resolve({ items: [], totalPages: 1 });
      }
      if (path === "/api/products/campaigns/my-vouchers") {
        return Promise.resolve(VOUCHERS);
      }
      return Promise.resolve(null);
    });
  });

  it("redirects to login when unauthenticated", () => {
    getAccessToken.mockReturnValue(null);
    render(<ProfilePage />);
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("loads profile, addresses, and real orders from Docker-backed APIs", async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/me", {
        token: "test-token",
      });
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/me/addresses", {
        token: "test-token",
      });
      expect(apiFetch).toHaveBeenCalledWith("/api/orders/mine?limit=50", {
        token: "test-token",
      });
    });
  });

  it("opens the orders section directly from the profile deep link", async () => {
    mockSearchParams.set("tab", "orders");
    render(<ProfilePage />);
    expect(await screen.findByRole("region", { name: "คำสั่งซื้อของฉัน" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("สมชาย")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ดูประวัติทั้งหมด/ })).toHaveAttribute("href", "/profile?tab=orders");
  });

  it("opens orders when the query changes on an already mounted profile", async () => {
    const { rerender } = render(<ProfilePage />);
    expect(await screen.findByDisplayValue("สมชาย")).toBeInTheDocument();
    mockSearchParams.set("tab", "orders");
    rerender(<ProfilePage />);
    expect(await screen.findByRole("region", { name: "คำสั่งซื้อของฉัน" })).toBeInTheDocument();
    mockSearchParams.delete("tab");
    rerender(<ProfilePage />);
    expect(await screen.findByDisplayValue("สมชาย")).toBeInTheDocument();
  });

  it("keeps tab navigation URLs in sync after opening orders", async () => {
    mockSearchParams.set("tab", "orders");
    render(<ProfilePage />);
    await screen.findByRole("region", { name: "คำสั่งซื้อของฉัน" });
    fireEvent.click(screen.getByRole("button", { name: /ข้อมูลส่วนตัว/ }));
    expect(mockReplace).toHaveBeenCalledWith("/profile?tab=profile", { scroll: false });
    expect(await screen.findByDisplayValue("สมชาย")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /คำสั่งซื้อของฉัน/ }));
    expect(mockReplace).toHaveBeenCalledWith("/profile?tab=orders", { scroll: false });
    expect(await screen.findByRole("region", { name: "คำสั่งซื้อของฉัน" })).toBeInTheDocument();
  });

  it("opens personal information directly from its explicit tab URL", async () => {
    mockSearchParams.set("tab", "profile");
    render(<ProfilePage />);
    expect(await screen.findByDisplayValue("สมชาย")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "คำสั่งซื้อของฉัน" })).not.toBeInTheDocument();
  });

  it("uses personal information for an unknown tab", async () => {
    mockSearchParams.set("tab", "unknown");
    render(<ProfilePage />);
    expect(await screen.findByDisplayValue("สมชาย")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "คำสั่งซื้อของฉัน" })).not.toBeInTheDocument();
  });

  it("shows Style Profile in the personal tab and saves it separately", async () => {
    render(<ProfilePage />);
    const styleGroup = within(
      await screen.findByRole("group", { name: "สไตล์ที่ชอบ" }),
    );
    fireEvent.click(styleGroup.getByRole("button", { name: /เพิ่ม \/ แก้ไข/ }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("checkbox", { name: "minimal" }));
    fireEvent.click(dialog.getByRole("button", { name: "ยืนยัน" }));
    fireEvent.click(screen.getByRole("button", { name: /บันทึกความสนใจ/ }));
    expect(await screen.findByText("บันทึกความสนใจสำเร็จ")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/me/style-profile", {
      method: "PATCH",
      token: "test-token",
      body: {
        categories: [],
        styles: ["minimal"],
        brands: [],
        sizes: [],
        unassignedSizes: [],
      },
    });
    expect(screen.getByDisplayValue("สมชาย")).toBeInTheDocument();
    expect(
      apiFetch.mock.calls.filter(
        ([path, options]) =>
          path === "/api/auth/me" && options?.method === "PATCH",
      ),
    ).toHaveLength(0);
  });

  it("does not show Style Profile for staff accounts", async () => {
    const previous = apiFetch.getMockImplementation();
    const staff = { ...USER, role: "MARKETING" };
    getStoredUser.mockReturnValue(staff);
    apiFetch.mockImplementation((path, options) =>
      path === "/api/auth/me"
        ? Promise.resolve(staff)
        : previous(path, options),
    );
    render(<ProfilePage />);
    await screen.findByText("การตลาด");
    expect(
      screen.queryByRole("heading", { name: "ความสนใจของฉัน" }),
    ).not.toBeInTheDocument();
    expect(
      apiFetch.mock.calls.some(
        ([path]) => path === "/api/auth/me/style-profile",
      ),
    ).toBe(false);
  });

  it("renders profile summary and 4 order status shortcuts", async () => {
    render(<ProfilePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "สมชาย ใจดี",
    );
    expect(screen.getByText(/somchai@example\.com/)).toBeInTheDocument();
    expect(screen.getByText("ผู้ซื้อ")).toBeInTheDocument();

    // 4 statuses provided by order-service
    expect(screen.getByText("รอชำระเงิน")).toBeInTheDocument();
    expect(screen.getByText("รอผู้ขายยืนยัน")).toBeInTheDocument();
    expect(screen.getByText("กำลังจัดส่ง")).toBeInTheDocument();
    expect(screen.getByText("สำเร็จ")).toBeInTheDocument();
    await screen.findByRole("button", { name: /บันทึกความสนใจ/ });
  });

  it("shows only order-service data when clicking a status shortcut", async () => {
    render(<ProfilePage />);

    const pendingPaymentButton = screen.getByRole("button", {
      name: /รอชำระเงิน/i,
    });
    fireEvent.click(pendingPaymentButton);

    expect(
      screen.getByRole("heading", { name: "คำสั่งซื้อของฉัน" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("เสื้อเชิ้ตจากฐานข้อมูล"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปชำระเงิน/i })).toHaveAttribute(
      "href",
      "/payment/checkout-qr-1",
    );
    expect(screen.queryByText(/Levi's 90s Vintage/)).not.toBeInTheDocument();
  });

  it("shows review and report actions for an unreviewed completed order", async () => {
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /สำเร็จ/i }));

    expect(await screen.findByText("กระเป๋าที่ซื้อสำเร็จ")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ให้คะแนนร้านค้า" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ขอคืนเงิน/คืนสินค้า" }),
    ).toBeInTheDocument();
  });

  it("embeds the full orders UI with product photos and opens details without leaving profile", async () => {
    render(<ProfilePage />);
    const ordersTab = screen.getByRole("button", { name: /คำสั่งซื้อของฉัน/ });
    expect(ordersTab.parentElement).not.toHaveClass("mb-6");
    fireEvent.click(ordersTab);
    const orders = within(
      screen.getByRole("region", { name: "คำสั่งซื้อของฉัน" }),
    );
    expect(
      await orders.findByRole("img", { name: "เสื้อเชิ้ตจากฐานข้อมูล" }),
    ).toHaveAttribute("src", "/uploads/product-1.jpg");
    expect(
      orders.getAllByRole("button", { name: "ติดต่อผู้ขาย" }),
    ).toHaveLength(2);
    expect(
      screen.queryByText("หน้าคำสั่งซื้อเต็มรูปแบบ"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("navigation", { name: "main navigation" }),
    ).toHaveLength(1);
    fireEvent.click(orders.getAllByRole("button", { name: "ดูรายละเอียด" })[0]);
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByRole("heading", { name: "รายละเอียดคำสั่งซื้อ" }),
    ).toBeInTheDocument();
    expect(await dialog.findByText("ร้านทดสอบ")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("uses the shared status filters and resets pagination when the filter changes", async () => {
    const previous = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => {
      if (path.startsWith("/api/orders/mine?page=")) {
        const status = new URLSearchParams(path.split("?")[1]).get("status");
        return Promise.resolve({
          ...ORDERS_RESPONSE,
          items: ORDERS_RESPONSE.items.filter(
            (order) => !status || status.split(",").includes(order.status),
          ),
          totalPages: 2,
        });
      }
      return previous(path, options);
    });
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /คำสั่งซื้อของฉัน/ }));
    const orders = within(
      screen.getByRole("region", { name: "คำสั่งซื้อของฉัน" }),
    );
    fireEvent.click(await orders.findByRole("button", { name: "ถัดไป" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/orders/mine?page=2&limit=8", {
        token: "test-token",
      }),
    );
    fireEvent.click(orders.getByRole("button", { name: "สำเร็จ" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/orders/mine?page=1&limit=8&status=delivered%2Ccompleted",
        { token: "test-token" },
      ),
    );
    await waitFor(() =>
      expect(
        orders.queryByText("เสื้อเชิ้ตจากฐานข้อมูล"),
      ).not.toBeInTheDocument(),
    );
    expect(orders.getByText("กระเป๋าที่ซื้อสำเร็จ")).toBeInTheDocument();
    expect(orders.getByRole("button", { name: "สำเร็จ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reopens the requested shortcut after changing the embedded filter", async () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /สำเร็จ/ }));
    let orders = within(
      screen.getByRole("region", { name: "คำสั่งซื้อของฉัน" }),
    );
    await orders.findByText("กระเป๋าที่ซื้อสำเร็จ");
    fireEvent.click(orders.getByRole("button", { name: "ทั้งหมด" }));
    await orders.findByText("เสื้อเชิ้ตจากฐานข้อมูล");
    fireEvent.click(screen.getAllByRole("button", { name: /สำเร็จ/ })[0]);
    orders = within(screen.getByRole("region", { name: "คำสั่งซื้อของฉัน" }));
    expect(orders.getByRole("button", { name: "สำเร็จ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await orders.findByText("กระเป๋าที่ซื้อสำเร็จ");
    expect(
      orders.queryByText("เสื้อเชิ้ตจากฐานข้อมูล"),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["รอชำระเงิน", "pending_payment"],
    ["รอผู้ขายยืนยัน", "paid"],
    ["ขนส่งกำลังเข้ารับสินค้า", "pickup_in_progress"],
    ["กำลังจัดส่ง", "in_transit"],
    ["กำลังเตรียมสินค้า", "confirmed%2Cready_to_ship"],
    ["สำเร็จ", "delivered%2Ccompleted"],
  ])(
    "opens the matching shared filter from the %s shortcut",
    async (label, status) => {
      render(<ProfilePage />);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
      await waitFor(() =>
        expect(apiFetch).toHaveBeenCalledWith(
          `/api/orders/mine?page=1&limit=8&status=${status}`,
          { token: "test-token" },
        ),
      );
      const orders = within(
        screen.getByRole("region", { name: "คำสั่งซื้อของฉัน" }),
      );
      expect(orders.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      if (status === "pending_payment") {
        expect(
          await orders.findByText("เสื้อเชิ้ตจากฐานข้อมูล"),
        ).toBeInTheDocument();
      } else if (status === "delivered%2Ccompleted") {
        expect(
          await orders.findByText("กระเป๋าที่ซื้อสำเร็จ"),
        ).toBeInTheDocument();
      } else {
        expect(
          await orders.findByText("ไม่มีคำสั่งซื้อในหมวดนี้"),
        ).toBeInTheDocument();
      }
    },
  );

  it("switches to addresses tab and shows address list and allows adding address", async () => {
    render(<ProfilePage />);

    const addressTabBtn = screen.getByRole("button", {
      name: /ที่อยู่จัดส่ง/i,
    });
    fireEvent.click(addressTabBtn);

    expect(screen.getByText("ที่อยู่สำหรับจัดส่ง")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("สมชาย ใจดี").length).toBeGreaterThanOrEqual(
        2,
      );
      expect(screen.getByText("ค่าเริ่มต้น")).toBeInTheDocument();
    });

    // Open add address modal
    const addBtn = screen.getByRole("button", { name: /เพิ่มที่อยู่ใหม่/i });
    fireEvent.click(addBtn);

    expect(screen.getByText("เพิ่มที่อยู่จัดส่งใหม่")).toBeInTheDocument();
  });

  it("TC05: shows field-specific errors, blocks invalid addresses, and allows a corrected retry", async () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /ที่อยู่จัดส่ง/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /เพิ่มที่อยู่ใหม่/i }),
    );
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "บันทึกที่อยู่" }));
    expect(dialog.getByText("กรุณากรอกชื่อผู้รับ")).toBeInTheDocument();
    expect(
      dialog.getByText("เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก"),
    ).toBeInTheDocument();
    expect(
      dialog.getByText("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก"),
    ).toBeInTheDocument();
    const change = (label, value) =>
      fireEvent.change(dialog.getByLabelText(label), { target: { value } });
    change(/ชื่อ-นามสกุล ผู้รับ/, "ผู้รับทดสอบ");
    change(/เบอร์โทรศัพท์/, "12345");
    change(/รหัสไปรษณีย์/, "ABCDE");
    fireEvent.click(dialog.getByRole("button", { name: "บันทึกที่อยู่" }));
    expect(
      apiFetch.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(0);
    expect(dialog.getByLabelText(/เบอร์โทรศัพท์/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    change(/เบอร์โทรศัพท์/, "0812345678");
    change(/รหัสไปรษณีย์/, "10110");
    change(/ที่อยู่ \(บ้านเลขที่/, "99 Main Road");
    change(/แขวง \/ ตำบล/, "คลองเตย");
    change(/เขต \/ อำเภอ/, "คลองเตย");
    change(/จังหวัด/, "กรุงเทพมหานคร");
    fireEvent.click(dialog.getByRole("button", { name: "บันทึกที่อยู่" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      apiFetch.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
  });

  it("shows vouchers loaded from the Marketing campaign API", async () => {
    render(<ProfilePage />);

    const couponTabBtn = screen.getByRole("button", {
      name: /โค้ดส่วนลดของฉัน/i,
    });
    fireEvent.click(couponTabBtn);

    expect(
      screen.getByRole("heading", { name: "โค้ดส่วนลดของฉัน" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/products/campaigns/my-vouchers",
        { token: "test-token" },
      );
      expect(screen.getByText("SAVE200")).toBeInTheDocument();
      expect(screen.getByText("แคมเปญจาก Marketing")).toBeInTheDocument();
    });
  });
});
