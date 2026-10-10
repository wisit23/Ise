import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CampaignsSection from "./CampaignsSection";
import { apiFetch } from "../../../lib/api";
import { fetchCategories } from "../../../lib/catalog";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../../lib/catalog", () => ({
  fetchCategories: jest.fn(),
}));

describe("CampaignsSection (Marketing Workspace)", () => {
  const mockToken = "mock-jwt-token";
  const mockUser = {
    id: "user-marketing",
    email: "marketing@example.com",
    role: "MARKETING",
  };

  const sampleCampaigns = [
    {
      id: "camp-1",
      name: "Super Summer 2026",
      code: "SUMMER26",
      description: "โปรโมชันต้อนรับหน้าร้อน",
      discountType: "PERCENT",
      discountValue: 15,
      maxDiscount: 150,
      minOrderPrice: 300,
      status: "published",
      startsAt: "2026-06-01T00:00:00.000Z",
      endsAt: "2026-06-30T23:59:59.000Z",
      usageLimit: 50,
      usedCount: 10,
      _count: { vouchers: 12 },
    },
    {
      id: "camp-2",
      name: "New Member Discount",
      code: "NEWMEM50",
      description: "ส่วนลดสมาชิกใหม่",
      discountType: "FIXED",
      discountValue: 50,
      maxDiscount: null,
      minOrderPrice: 200,
      status: "draft",
      startsAt: "2026-11-15T00:00:00.000Z",
      endsAt: "2026-12-15T23:59:59.000Z",
      usageLimit: 100,
      usedCount: 0,
      _count: { vouchers: 0 },
    },
    {
      id: "camp-3",
      name: "Winter Warmup",
      code: "WINTER100",
      description: "เตรียมต้อนรับหน้าหนาว",
      discountType: "FIXED",
      discountValue: 100,
      maxDiscount: null,
      minOrderPrice: 500,
      status: "pending_approval",
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: "2026-11-30T23:59:59.000Z",
      usageLimit: 200,
      usedCount: 0,
      _count: { vouchers: 0 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    fetchCategories.mockResolvedValue(["เสื้อผ้า", "รองเท้า", "กระเป๋า"]);
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.resolve({
          brands: ["Nike", "Adidas", "Uniqlo", "Zara"],
          styles: ["Streetwear", "Vintage", "Minimal"],
          sizes: ["S", "M", "L"],
        });
      }
      return Promise.resolve({ items: sampleCampaigns, total: 3 });
    });
  });

  it("renders KPI cards accurately based on campaign list", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    expect(await screen.findByText("Super Summer 2026")).toBeInTheDocument();
    expect(screen.getByText("แคมเปญทั้งหมด")).toBeInTheDocument();
    expect(screen.getByText("กำลังเผยแพร่ (Active)")).toBeInTheDocument();
    expect(screen.getAllByText("รออนุมัติ").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("สิทธิ์ที่ถูกเก็บไปแล้ว")).toBeInTheDocument();
  });

  it("renders campaigns in table with codes and status badges", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    expect(await screen.findByText("SUMMER26")).toBeInTheDocument();
    expect(screen.getByText("NEWMEM50")).toBeInTheDocument();
    expect(screen.getByText("WINTER100")).toBeInTheDocument();

    expect(screen.getAllByText("เผยแพร่อยู่").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ฉบับร่าง").length).toBeGreaterThanOrEqual(1);
  });

  it("opens modal when clicking 'สร้างแคมเปญใหม่'", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    await screen.findByText("Super Summer 2026");

    const createBtn = screen.getByRole("button", {
      name: /สร้างแคมเปญใหม่/i,
    });
    fireEvent.click(createBtn);

    expect(screen.getByText("สร้างแคมเปญโปรโมชันใหม่")).toBeInTheDocument();
    expect(screen.getByText(/ชื่อแคมเปญ \*/i)).toBeInTheDocument();
    expect(screen.getByText(/รหัสโค้ดโปรโมชัน/i)).toBeInTheDocument();
  });

  it("triggers confirm delete for draft campaign", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    await screen.findByText("Super Summer 2026");

    const deleteButtons = screen.getAllByRole("button", { name: /^ลบ$/i });
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText("ยืนยันการลบแคมเปญ")).toBeInTheDocument();
  });

  it("supports configuring and displaying buyer target segment in modal and table with multiple brands", async () => {
    const targetedCampaigns = [
      ...sampleCampaigns,
      {
        id: "camp-targeted-brands",
        name: "Sneakerhead Special",
        code: "SNEAKER26",
        description: "ส่วนลดสำหรับแฟนแบรนด์ดัง",
        discountType: "PERCENT",
        discountValue: 20,
        maxDiscount: 300,
        minOrderPrice: 500,
        status: "published",
        targetSegment: [
          {
            field: "brandPreference",
            operator: "in",
            value: ["Nike", "Adidas"],
          },
        ],
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-31T23:59:59.000Z",
        usageLimit: 50,
        usedCount: 5,
        _count: { vouchers: 5 },
      },
    ];
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.resolve({
          brands: ["Nike", "Adidas", "Uniqlo", "Zara"],
          styles: ["Streetwear", "Vintage", "Minimal"],
          sizes: ["S", "M", "L"],
        });
      }
      return Promise.resolve({ items: targetedCampaigns, total: 4 });
    });

    render(<CampaignsSection token={mockToken} user={mockUser} />);

    expect(await screen.findByText("SNEAKER26")).toBeInTheDocument();
    expect(screen.getByText(/แบรนด์ที่สนใจ: Nike, Adidas/)).toBeInTheDocument();
    expect(
      screen.getAllByText("กลุ่มเป้าหมาย: ทุกคน").length,
    ).toBeGreaterThanOrEqual(1);

    // Open modal and toggle target segment
    const createBtn = screen.getByRole("button", { name: /สร้างแคมเปญใหม่/i });
    fireEvent.click(createBtn);

    expect(
      screen.getByText("กลุ่มผู้ซื้อจากความสนใจ (Buyer interest targeting)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "ใช้กำหนดว่าผู้ซื้อกลุ่มใดเหมาะกับโปรโมชันนี้ ไม่ใช่การกำหนดว่าสินค้าแบรนด์ใดใช้คูปองได้",
      ),
    ).toBeInTheDocument();

    const targetedRadio = screen.getByLabelText("เฉพาะกลุ่มเป้าหมาย");
    fireEvent.click(targetedRadio);

    expect(screen.getByText("เงื่อนไขเป้าหมาย")).toBeInTheDocument();
    expect(screen.getByText("การเปรียบเทียบ")).toBeInTheDocument();
    expect(screen.getByText("ค่าเป้าหมาย")).toBeInTheDocument();

    // Verify UI does NOT have size options
    expect(screen.queryByText(/ไซส์เสื้อผ้า/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preferredSize/i)).not.toBeInTheDocument();

    // Verify brandPreference is default
    const fieldSelect = screen.getByLabelText("เลือกเงื่อนไขเป้าหมาย");
    expect(fieldSelect.value).toBe("brandPreference");

    // Verify operator labels for brand targeting
    expect(screen.getByText("ตรงกับแบรนด์ใดแบรนด์หนึ่ง")).toBeInTheDocument();
    expect(screen.getByText("ไม่รวมแบรนด์ที่เลือก")).toBeInTheDocument();
  });

  it("loads brands from /api/products/filters, allows searching, adding, preventing duplicates, and removing chips", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    await screen.findByText("Super Summer 2026");

    const createBtn = screen.getByRole("button", { name: /สร้างแคมเปญใหม่/i });
    fireEvent.click(createBtn);

    const targetedRadio = screen.getByLabelText("เฉพาะกลุ่มเป้าหมาย");
    fireEvent.click(targetedRadio);

    // Verify brand pills from loaded filters are rendered
    const nikePill = await screen.findByRole("button", { name: /\+ Nike/i });
    fireEvent.click(nikePill);

    // Verify Nike chip is displayed with remove button
    expect(screen.getByLabelText("ลบแบรนด์ Nike")).toBeInTheDocument();

    // Add another brand via search input
    const brandInput = screen.getByLabelText("ค้นหาหรือระบุแบรนด์");
    fireEvent.change(brandInput, { target: { value: "Adidas" } });
    const addBtn = screen.getByRole("button", { name: "เพิ่มแบรนด์" });
    fireEvent.click(addBtn);

    expect(screen.getByLabelText("ลบแบรนด์ Adidas")).toBeInTheDocument();

    // Attempt to add duplicate brand (case-insensitive and trimmed)
    fireEvent.change(brandInput, { target: { value: "  nike  " } });
    fireEvent.click(addBtn);

    // Verify there is still only one Nike chip
    const nikeChips = screen.getAllByLabelText("ลบแบรนด์ Nike");
    expect(nikeChips.length).toBe(1);

    // Remove Nike chip
    fireEvent.click(nikeChips[0]);
    expect(screen.queryByLabelText("ลบแบรนด์ Nike")).not.toBeInTheDocument();
    expect(screen.getByLabelText("ลบแบรนด์ Adidas")).toBeInTheDocument();
  });

  it("validates empty brand selection in targeted mode and submits campaign with operator and array value", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    await screen.findByText("Super Summer 2026");

    const createBtn = screen.getByRole("button", { name: /สร้างแคมเปญใหม่/i });
    fireEvent.click(createBtn);

    // Fill basic campaign fields
    fireEvent.change(screen.getByPlaceholderText("เช่น SUMMER20, DENIM50"), {
      target: { value: "BRANDSALE" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "เช่น ลดพิเศษต้อนรับซัมเมอร์สำหรับคนรักยีนส์",
      ),
      {
        target: { value: "Brand Lovers Campaign" },
      },
    );

    const targetedRadio = screen.getByLabelText("เฉพาะกลุ่มเป้าหมาย");
    fireEvent.click(targetedRadio);

    // Attempt to submit without selecting any brands
    const submitBtn = screen.getByRole("button", { name: "บันทึกแคมเปญ" });
    fireEvent.click(submitBtn);

    // Validation error must appear
    expect(
      await screen.findByText("กรุณาระบุหรือเลือกอย่างน้อย 1 แบรนด์เป้าหมาย"),
    ).toBeInTheDocument();

    // Now add a brand chip
    const brandInput = screen.getByLabelText("ค้นหาหรือระบุแบรนด์");
    fireEvent.change(brandInput, { target: { value: "Zara" } });
    const addBtn = screen.getByRole("button", { name: "เพิ่มแบรนด์" });
    fireEvent.click(addBtn);

    expect(screen.getByLabelText("ลบแบรนด์ Zara")).toBeInTheDocument();

    // Submit valid form
    apiFetch.mockResolvedValueOnce({ id: "new-camp-id", code: "BRANDSALE" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/products/campaigns",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            code: "BRANDSALE",
            name: "Brand Lovers Campaign",
            targetSegment: [
              {
                field: "brandPreference",
                operator: "in",
                value: ["Zara"],
              },
            ],
          }),
        }),
      );
    });
  });

  it("submits universal mode with targetSegment: null", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    await screen.findByText("Super Summer 2026");

    const createBtn = screen.getByRole("button", { name: /สร้างแคมเปญใหม่/i });
    fireEvent.click(createBtn);

    fireEvent.change(screen.getByPlaceholderText("เช่น SUMMER20, DENIM50"), {
      target: { value: "UNIVERSAL" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "เช่น ลดพิเศษต้อนรับซัมเมอร์สำหรับคนรักยีนส์",
      ),
      {
        target: { value: "Universal Campaign" },
      },
    );

    const submitBtn = screen.getByRole("button", { name: "บันทึกแคมเปญ" });
    apiFetch.mockResolvedValueOnce({ id: "new-camp-2", code: "UNIVERSAL" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/products/campaigns",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            code: "UNIVERSAL",
            targetSegment: null,
          }),
        }),
      );
    });
  });

  it("supports editing campaign with modern operator and populates brand chips", async () => {
    const editCampaign = {
      ...sampleCampaigns[1],
      targetSegment: [
        {
          field: "brandPreference",
          operator: "in",
          value: ["Nike", "Zara"],
        },
      ],
    };
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.resolve({
          brands: ["Nike", "Adidas", "Uniqlo", "Zara"],
          styles: [],
          sizes: [],
        });
      }
      return Promise.resolve({ items: [editCampaign], total: 1 });
    });

    render(<CampaignsSection token={mockToken} user={mockUser} />);

    expect(await screen.findByText("NEWMEM50")).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: "แก้ไข" });
    fireEvent.click(editBtn);

    expect(screen.getByText("แก้ไขแคมเปญฉบับร่าง")).toBeInTheDocument();
    expect(screen.getByLabelText("ลบแบรนด์ Nike")).toBeInTheDocument();
    expect(screen.getByLabelText("ลบแบรนด์ Zara")).toBeInTheDocument();
  });

  it("supports editing legacy campaign using op and legacy field without crashing", async () => {
    const legacyCampaign = {
      ...sampleCampaigns[1],
      targetSegment: [
        {
          field: "preferredSize",
          op: "eq",
          value: "M",
        },
      ],
    };
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.resolve({ brands: [], styles: [], sizes: [] });
      }
      return Promise.resolve({ items: [legacyCampaign], total: 1 });
    });

    render(<CampaignsSection token={mockToken} user={mockUser} />);

    expect(await screen.findByText("NEWMEM50")).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: "แก้ไข" });
    fireEvent.click(editBtn);

    expect(screen.getByText("แก้ไขแคมเปญฉบับร่าง")).toBeInTheDocument();
    expect(screen.getByDisplayValue("M")).toBeInTheDocument();
  });

  it("handles /api/products/filters failure gracefully, displays error state, and disables brand selection", async () => {
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.reject(new Error("Network Error"));
      }
      return Promise.resolve({ items: sampleCampaigns, total: 3 });
    });

    render(<CampaignsSection token={mockToken} user={mockUser} />);

    await screen.findByText("Super Summer 2026");

    const createBtn = screen.getByRole("button", { name: /สร้างแคมเปญใหม่/i });
    fireEvent.click(createBtn);

    const targetedRadio = screen.getByLabelText("เฉพาะกลุ่มเป้าหมาย");
    fireEvent.click(targetedRadio);

    // Modal is open and shows error message for brand loading failure
    expect(
      await screen.findByText("ไม่สามารถโหลดรายชื่อแบรนด์จากระบบได้"),
    ).toBeInTheDocument();

    const brandInput = screen.getByLabelText("ค้นหาหรือระบุแบรนด์");
    const addBtn = screen.getByRole("button", { name: "เพิ่มแบรนด์" });

    // Verify brand input and button are disabled
    expect(brandInput).toBeDisabled();
    expect(addBtn).toBeDisabled();

    // No chips should exist
    expect(screen.queryByLabelText(/ลบแบรนด์/i)).not.toBeInTheDocument();
  });

  it("supports editing legacy brandPreference campaign with op: neq and saves with operator: nin", async () => {
    const legacyCampaign = {
      ...sampleCampaigns[1],
      targetSegment: [
        {
          field: "brandPreference",
          op: "neq",
          value: "Nike",
        },
      ],
    };
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.resolve({
          brands: ["Nike", "Adidas", "Uniqlo", "Zara"],
          styles: [],
          sizes: [],
        });
      }
      return Promise.resolve({ items: [legacyCampaign], total: 1 });
    });

    render(<CampaignsSection token={mockToken} user={mockUser} />);

    expect(await screen.findByText("NEWMEM50")).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: "แก้ไข" });
    fireEvent.click(editBtn);

    expect(screen.getByText("แก้ไขแคมเปญฉบับร่าง")).toBeInTheDocument();

    // Verify operator was normalized to "nin"
    const opSelect = screen.getByLabelText("เลือกการเปรียบเทียบ");
    expect(opSelect.value).toBe("nin");

    // Verify brand Nike chip is rendered
    expect(screen.getByLabelText("ลบแบรนด์ Nike")).toBeInTheDocument();

    // Save campaign and verify payload
    const submitBtn = screen.getByRole("button", { name: "บันทึกแคมเปญ" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/products/campaigns/${legacyCampaign.id}`,
        expect.objectContaining({
          method: "PATCH",
          body: expect.objectContaining({
            code: "NEWMEM50",
            targetSegment: [
              {
                field: "brandPreference",
                operator: "nin",
                value: ["Nike"],
              },
            ],
          }),
        }),
      );
    });
  });

  it("cleans up targetSegment states cleanly when switching fields: brand -> category -> brand", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    await screen.findByText("Super Summer 2026");

    const createBtn = screen.getByRole("button", { name: /สร้างแคมเปญใหม่/i });
    fireEvent.click(createBtn);

    const targetedRadio = screen.getByLabelText("เฉพาะกลุ่มเป้าหมาย");
    fireEvent.click(targetedRadio);

    // Select Nike pill
    const nikePill = await screen.findByRole("button", { name: /\+ Nike/i });
    fireEvent.click(nikePill);
    expect(screen.getByLabelText("ลบแบรนด์ Nike")).toBeInTheDocument();

    // Type something in search
    const brandInput = screen.getByLabelText("ค้นหาหรือระบุแบรนด์");
    fireEvent.change(brandInput, { target: { value: "adi" } });
    expect(brandInput.value).toBe("adi");

    // Switch to favoriteCategory
    const fieldSelect = screen.getByLabelText("เลือกเงื่อนไขเป้าหมาย");
    fireEvent.change(fieldSelect, { target: { value: "favoriteCategory" } });

    // Brand chips and brand search input should be gone/reset
    expect(screen.queryByLabelText("ลบแบรนด์ Nike")).not.toBeInTheDocument();

    const categorySelect = screen.getByLabelText("เลือกหมวดหมู่ที่สนใจ");
    expect(categorySelect.value).toBe("");
    fireEvent.change(categorySelect, { target: { value: "เสื้อผ้า" } });
    expect(categorySelect.value).toBe("เสื้อผ้า");

    // Switch back to brandPreference
    fireEvent.change(fieldSelect, { target: { value: "brandPreference" } });

    // Verify brand starts clean: no chips, brand search empty, operator "in"
    expect(screen.queryByLabelText(/ลบแบรนด์/i)).not.toBeInTheDocument();
    const brandInputRestored = screen.getByLabelText("ค้นหาหรือระบุแบรนด์");
    expect(brandInputRestored.value).toBe("");

    const opSelect = screen.getByLabelText("เลือกการเปรียบเทียบ");
    expect(opSelect.value).toBe("in");
  });

  it("restricts brand selection to availableBrands only and does not create chips for unknown brands", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    await screen.findByText("Super Summer 2026");

    const createBtn = screen.getByRole("button", { name: /สร้างแคมเปญใหม่/i });
    fireEvent.click(createBtn);

    const targetedRadio = screen.getByLabelText("เฉพาะกลุ่มเป้าหมาย");
    fireEvent.click(targetedRadio);

    const brandInput = screen.getByLabelText("ค้นหาหรือระบุแบรนด์");
    const addBtn = screen.getByRole("button", { name: "เพิ่มแบรนด์" });

    // Type brand NOT in availableBrands
    fireEvent.change(brandInput, { target: { value: "UnknownBrand" } });

    // Button should be disabled because brand is not in availableBrands
    expect(addBtn).toBeDisabled();

    // Press Enter
    fireEvent.keyDown(brandInput, { key: "Enter" });

    // No chip should be added
    expect(screen.queryByText("UnknownBrand")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ลบแบรนด์/i)).not.toBeInTheDocument();

    // Now type an available brand (case-insensitive)
    fireEvent.change(brandInput, { target: { value: "nike" } });
    expect(addBtn).not.toBeDisabled();

    // Press Enter to add
    fireEvent.keyDown(brandInput, { key: "Enter" });

    // "Nike" chip should now be present
    expect(screen.getByLabelText("ลบแบรนด์ Nike")).toBeInTheDocument();
  });

  it("displays budget progress and 'ใช้แล้ว ฿X / ฿Budget' formatting in table", async () => {
    const budgetCampaign = {
      id: "camp-budget",
      name: "Budget Test Campaign",
      code: "BUDGET2026",
      discountType: "FIXED",
      discountValue: 100,
      budget: 5000,
      spentBudget: 1500,
      usageLimit: 50,
      usedCount: 15,
      status: "published",
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: "2026-11-30T23:59:59.000Z",
    };
    apiFetch.mockImplementation(() =>
      Promise.resolve({ items: [budgetCampaign], total: 1 }),
    );

    render(<CampaignsSection token={mockToken} user={mockUser} />);

    expect(await screen.findByText("BUDGET2026")).toBeInTheDocument();
    expect(screen.getByText("ใช้แล้ว ฿1,500 / ฿5,000")).toBeInTheDocument();
    expect(screen.getByTitle("สัดส่วนงบประมาณที่ใช้")).toBeInTheDocument();
  });

  it("enforces min attribute on datetime inputs and shows Thai validation errors for past dates", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);

    const createBtn = await screen.findByRole("button", {
      name: /สร้างแคมเปญใหม่/i,
    });
    fireEvent.click(createBtn);

    expect(screen.getByText("สร้างแคมเปญใหม่")).toBeInTheDocument();

    const startInput = screen.getByLabelText(/วันเวลาเริ่มต้น/i);
    const endInput = screen.getByLabelText(/วันเวลาสิ้นสุด/i);

    expect(startInput).toHaveAttribute("min");
    expect(endInput).toHaveAttribute("min");

    fireEvent.change(screen.getByPlaceholderText(/เช่น SUMMER20/i), {
      target: { value: "DATEVALID" },
    });
    fireEvent.change(screen.getByPlaceholderText(/เช่น ลดพิเศษต้อนรับ/i), {
      target: { value: "Date Validation Camp" },
    });

    const form = startInput.closest("form");

    // Test 1: endsAt in past
    fireEvent.change(startInput, {
      target: { value: "2026-01-01T10:00" },
    });
    fireEvent.change(endInput, {
      target: { value: "2026-01-02T10:00" },
    });
    fireEvent.submit(form);

    expect(
      screen.getByText(
        "ไม่สามารถกำหนดช่วงเวลาที่สิ้นสุดไปแล้วได้ วันเวลาสิ้นสุดต้องอยู่ในอนาคต",
      ),
    ).toBeInTheDocument();

    // Test 2: endsAt <= startsAt (in the future)
    fireEvent.change(startInput, {
      target: { value: "2027-01-10T10:00" },
    });
    fireEvent.change(endInput, {
      target: { value: "2027-01-05T10:00" },
    });
    fireEvent.submit(form);

    expect(
      screen.getByText("วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น"),
    ).toBeInTheDocument();

    // Test 3: startsAt in the past
    fireEvent.change(startInput, {
      target: { value: "2026-01-01T10:00" },
    });
    fireEvent.change(endInput, {
      target: { value: "2027-01-01T10:00" },
    });
    fireEvent.submit(form);

    expect(
      screen.getByText("ไม่สามารถกำหนดวันเวลาเริ่มต้นย้อนหลังในอดีตได้"),
    ).toBeInTheDocument();
  });
});
