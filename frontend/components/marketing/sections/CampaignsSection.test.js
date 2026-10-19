import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

  it("only shows the publish action for approved campaigns that have not expired", async () => {
    const activeApprovedCampaign = {
      ...sampleCampaigns[1],
      id: "approved-active",
      code: "APPROVED-ACTIVE",
      name: "Approved active campaign",
      status: "approved",
      endsAt: "2099-12-31T23:59:59.000Z",
    };
    const expiredApprovedCampaign = {
      ...sampleCampaigns[1],
      id: "approved-expired",
      code: "APPROVED-EXPIRED",
      name: "Approved expired campaign",
      status: "approved",
      endsAt: "2020-01-01T00:00:00.000Z",
    };
    apiFetch.mockResolvedValue({
      items: [activeApprovedCampaign, expiredApprovedCampaign],
      total: 2,
    });

    render(<CampaignsSection token={mockToken} user={mockUser} />);

    const activeRow = (await screen.findByText("APPROVED-ACTIVE")).closest("tr");
    const expiredRow = screen.getByText("APPROVED-EXPIRED").closest("tr");

    expect(
      within(activeRow).getByRole("button", { name: "เผยแพร่ (Publish)" }),
    ).toBeEnabled();
    expect(
      within(activeRow).getByRole("button", { name: "ยกเลิกแคมเปญ" }),
    ).toBeEnabled();
    expect(
      within(expiredRow).queryByRole("button", { name: "เผยแพร่ (Publish)" }),
    ).not.toBeInTheDocument();
    expect(within(expiredRow).getAllByText("สิ้นสุดแล้ว").length).toBeGreaterThanOrEqual(1);
  });

  it("cancels an approved campaign through the audited end endpoint", async () => {
    const approvedCampaign = {
      ...sampleCampaigns[1],
      id: "approved-cancel",
      code: "APPROVED-CANCEL",
      name: "Approved campaign to cancel",
      status: "approved",
      endsAt: "2099-12-31T23:59:59.000Z",
    };
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.resolve({ brands: [], styles: [], sizes: [] });
      }
      return Promise.resolve({ items: [approvedCampaign], total: 1 });
    });

    render(<CampaignsSection token={mockToken} user={mockUser} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "ยกเลิกแคมเปญ" }),
    );
    const cancelDialog = screen.getByRole("dialog");
    fireEvent.change(screen.getByLabelText(/เหตุผลที่ยกเลิกแคมเปญ/), {
      target: { value: "ไม่พบผู้ซื้อในกลุ่มเป้าหมาย" },
    });
    fireEvent.click(
      within(cancelDialog).getByRole("button", { name: "ยกเลิกแคมเปญ" }),
    );

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/products/campaigns/${approvedCampaign.id}/end`,
        expect.objectContaining({
          method: "POST",
          body: { reason: "ไม่พบผู้ซื้อในกลุ่มเป้าหมาย" },
        }),
      ),
    );
  });

  it("retains all columns and draft actions when names and descriptions are long", async () => {
    const longName = "แคมเปญสำหรับชื่อที่ยาวมากและต้องไม่ดันปุ่มออกนอกตาราง".repeat(3);
    const longDescription = "รายละเอียดเงื่อนไขโปรโมชันที่ต้องอ่านได้ครบ".repeat(4);
    const campaign = { ...sampleCampaigns[1], name: longName, description: longDescription };
    apiFetch.mockResolvedValue({ items: [campaign], total: 1 });
    render(<CampaignsSection token={mockToken} user={mockUser} />);
    expect(await screen.findByText(longName)).toHaveAttribute("title", longName);
    expect(screen.getByText(longDescription)).toHaveAttribute("title", longDescription);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    const row = within(table).getAllByRole("row")[1];
    for (const name of ["แก้ไข", "ส่งขออนุมัติ", "ลบ"]) {
      expect(within(row).getByRole("button", { name, exact: true })).toBeEnabled();
    }
    fireEvent.click(within(row).getByRole("button", { name: "แก้ไข", exact: true }));
    expect(screen.getByPlaceholderText("เช่น ลดพิเศษต้อนรับซัมเมอร์สำหรับคนรักยีนส์")).toHaveValue(longName);
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
    expect(screen.getByText("การเลือกกลุ่มเป้าหมาย")).toBeInTheDocument();
    expect(screen.getByText("ค่าเป้าหมาย")).toBeInTheDocument();

    // Verify UI does NOT have size options
    expect(screen.queryByText(/ไซส์เสื้อผ้า/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preferredSize/i)).not.toBeInTheDocument();

    // Verify brandPreference is default
    const fieldSelect = screen.getByLabelText("เลือกเงื่อนไขเป้าหมาย");
    expect(fieldSelect.value).toBe("brandPreference");

    // Verify operator labels for brand targeting
    expect(
      screen.getAllByText("ให้เฉพาะกลุ่มนี้").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("ยกเว้นกลุ่มนี้").length,
    ).toBeGreaterThanOrEqual(1);
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
    const opSelect = screen.getByLabelText("เลือกวิธีกำหนดกลุ่มเป้าหมาย");
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

    const opSelect = screen.getByLabelText("เลือกวิธีกำหนดกลุ่มเป้าหมาย");
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

  it("displays unambiguous claimed, redeemed, and budget usage labels", async () => {
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
      claimedCount: 15,
      redeemedCount: 4,
      status: "published",
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: "2026-11-30T23:59:59.000Z",
    };
    apiFetch.mockImplementation(() =>
      Promise.resolve({ items: [budgetCampaign], total: 1 }),
    );

    render(<CampaignsSection token={mockToken} user={mockUser} />);

    expect(await screen.findByText("BUDGET2026")).toBeInTheDocument();
    expect(screen.getByText("เก็บ 15 / โควตา 50")).toBeInTheDocument();
    expect(screen.getByText("ใช้สำเร็จ 4 สิทธิ์")).toBeInTheDocument();
    expect(screen.getByText("ใช้งบ ฿1,500 / งบ ฿5,000")).toBeInTheDocument();
    expect(screen.getByTitle("สัดส่วนงบประมาณที่ใช้")).toBeInTheDocument();
  });

  it("shows a live coupon preview before saving a campaign", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /สร้างแคมเปญใหม่/i }),
    );
    expect(screen.getByText("ตัวอย่างคูปอง")).toBeInTheDocument();
    expect(screen.getByText("รหัสคูปอง")).toBeInTheDocument();
  });

  it("keeps audience statistics visible while score criteria are adjusted", async () => {
    const audiencePreview = {
      eligibleCustomers: 3,
      minimumObserved: 4,
      maximumObserved: 18,
      averageScore: 10,
      medianScore: 9,
      maximumPossible: 28,
      globalMaximum: 33,
      distribution: [
        { key: "none", min: 0, max: 0, count: 2 },
        { key: "emerging", min: 1, max: 6, count: 1 },
        { key: "moderate", min: 7, max: 14, count: 2 },
        { key: "high", min: 15, max: 24, count: 1 },
        { key: "very_high", min: 25, max: 33, count: 0 },
      ],
    };
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.resolve({ brands: ["Nike"], styles: [], sizes: [] });
      }
      if (typeof url === "string" && url.includes("/audience/options")) {
        return Promise.resolve({
          dimensions: { categories: ["กระเป๋า"], brands: ["Nike"], styles: [], sizesByCategory: {} },
          globalMaximum: 33,
        });
      }
      if (typeof url === "string" && url.includes("/audience/preview")) {
        return Promise.resolve(audiencePreview);
      }
      return Promise.resolve({ items: sampleCampaigns, total: 3 });
    });

    render(<CampaignsSection token={mockToken} user={mockUser} />);
    fireEvent.click(await screen.findByRole("button", { name: /สร้างแคมเปญใหม่/i }));
    fireEvent.click(screen.getByLabelText("ตามคะแนนความสนใจ"));

    expect(screen.queryByLabelText("ไซซ์")).not.toBeInTheDocument();
    expect(screen.getByLabelText("คะแนนสิ้นสุด")).toHaveAttribute("max", "33");

    expect(screen.getByText(/ยังไม่ได้คำนวณ/)).toBeInTheDocument();
    expect(screen.getByText("ได้สิทธิ์")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("หมวดหมู่"), {
      target: { value: "กระเป๋า" },
    });
    fireEvent.click(screen.getByRole("button", { name: "คำนวณสิทธิ์และสถิติ" }));
    expect(await screen.findByText("3 คน")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("คะแนนเริ่มต้น"), {
      target: { value: "7" },
    });
    expect(screen.getByText(/ผลด้านล่างเป็นผลก่อนหน้า/)).toBeInTheDocument();
    expect(screen.getByText("3 คน")).toBeInTheDocument();
  });

  it("blocks a fixed discount that reaches the minimum order amount", async () => {
    render(<CampaignsSection token={mockToken} user={mockUser} />);
    await screen.findByText("NEWMEM50");
    const draftRow = screen.getByText("NEWMEM50").closest("tr");
    fireEvent.click(
      within(draftRow).getByRole("button", { name: "แก้ไข", exact: true }),
    );
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "50" },
    });
    fireEvent.submit(screen.getByPlaceholderText("0").closest("form"));
    expect(
      screen.getByText(
        "ส่วนลดคงที่ต้องน้อยกว่ายอดซื้อขั้นต่ำ เพื่อไม่ให้ยอดชำระเป็นศูนย์หรือติดลบ",
      ),
    ).toBeInTheDocument();
  });

  it("requires a reason when Marketing closes a published campaign", async () => {
    const activeCampaign = {
      ...sampleCampaigns[0],
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    apiFetch.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/products/filters")) {
        return Promise.resolve({ brands: [], styles: [], sizes: [] });
      }
      return Promise.resolve({ items: [activeCampaign], total: 1 });
    });
    render(<CampaignsSection token={mockToken} user={mockUser} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "ปิดแคมเปญ" }),
    );
    const closeDialog = screen.getByRole("dialog");
    fireEvent.click(
      within(closeDialog).getByRole("button", { name: "ปิดแคมเปญ" }),
    );
    expect(screen.getByText("กรุณาระบุเหตุผลที่ปิดแคมเปญ")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/เหตุผลที่ปิดแคมเปญ/), {
      target: { value: "ยุติกิจกรรมตามแผน" },
    });
    fireEvent.click(
      within(closeDialog).getByRole("button", { name: "ปิดแคมเปญ" }),
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/products/campaigns/${activeCampaign.id}/end`,
        expect.objectContaining({
          method: "POST",
          body: { reason: "ยุติกิจกรรมตามแผน" },
        }),
      ),
    );
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

  describe("Pagination & Boundary Behavior", () => {
    it("renders pagination controls correctly for 45 items (3 pages)", async () => {
      apiFetch.mockImplementation((url) => {
        if (typeof url === "string" && url.includes("/api/products/filters")) {
          return Promise.resolve({ brands: [], styles: [], sizes: [] });
        }
        return Promise.resolve({
          items: sampleCampaigns,
          total: 45,
          page: 1,
          totalPages: 3,
        });
      });

      render(<CampaignsSection token={mockToken} user={mockUser} />);
      await screen.findByText("Super Summer 2026");

      const prevBtn = screen.getByRole("button", { name: /ก่อนหน้า/i });
      const nextBtn = screen.getByRole("button", { name: /ถัดไป/i });

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).not.toBeDisabled();
      expect(screen.getAllByText("45").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);

      // Click next page
      fireEvent.click(nextBtn);
      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("page=2"),
          expect.anything(),
        );
      });
    });

    it("resets page to 1 when changing status filter or searching", async () => {
      render(<CampaignsSection token={mockToken} user={mockUser} />);
      await screen.findByText("Super Summer 2026");

      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส/i);
      fireEvent.change(searchInput, { target: { value: "SUMMER" } });

      const searchForm = searchInput.closest("form");
      fireEvent.submit(searchForm);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("page=1"),
          expect.anything(),
        );
      });
    });

    it("clamps out-of-bounds page to the last valid page", async () => {
      apiFetch.mockImplementation((url) => {
        if (typeof url === "string" && url.includes("/api/products/filters")) {
          return Promise.resolve({ brands: [], styles: [], sizes: [] });
        }
        return Promise.resolve({
          items: sampleCampaigns,
          total: 20,
          page: 1,
          totalPages: 1,
        });
      });

      render(<CampaignsSection token={mockToken} user={mockUser} />);
      await screen.findByText("Super Summer 2026");

      expect(screen.getAllByText("20").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole("button", { name: /ก่อนหน้า/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /ถัดไป/i })).toBeDisabled();
    });

    it("maintains card summary counts across page navigation", async () => {
      const summaryFixture = {
        total: 45,
        published: 28,
        pending: 10,
        totalClaimed: 350,
      };

      apiFetch.mockImplementation((url) => {
        if (typeof url === "string" && url.includes("/api/products/filters")) {
          return Promise.resolve({ brands: [], styles: [], sizes: [] });
        }
        if (typeof url === "string" && url.includes("page=2")) {
          return Promise.resolve({
            items: sampleCampaigns,
            total: 45,
            page: 2,
            totalPages: 3,
            summary: summaryFixture,
          });
        }
        return Promise.resolve({
          items: sampleCampaigns,
          total: 45,
          page: 1,
          totalPages: 3,
          summary: summaryFixture,
        });
      });

      render(<CampaignsSection token={mockToken} user={mockUser} />);
      await screen.findByText("Super Summer 2026");

      // Verify Page 1 summary card values
      expect(screen.getByText("28")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("350")).toBeInTheDocument();

      // Navigate to Page 2
      const nextBtn = screen.getByRole("button", { name: /ถัดไป/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("page=2"),
          expect.anything(),
        );
      });

      // Verify Page 2 summary cards remain the same
      expect(screen.getByText("28")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("350")).toBeInTheDocument();
    });

    it("displays correct summary cards when filtering by draft (published=0, pending=0) and pending_approval (published=0)", async () => {
      apiFetch.mockImplementation((url) => {
        if (typeof url === "string" && url.includes("/api/products/filters")) {
          return Promise.resolve({ brands: [], styles: [], sizes: [] });
        }
        if (typeof url === "string" && url.includes("status=draft")) {
          return Promise.resolve({
            items: [
              {
                id: "camp-draft-1",
                code: "DRAFT10",
                name: "Draft Campaign",
                status: "draft",
                discountType: "PERCENT",
                discountValue: 10,
                startsAt: "2026-11-01T00:00:00.000Z",
                endsAt: "2026-11-30T00:00:00.000Z",
                usedCount: 5,
              },
            ],
            total: 1,
            page: 1,
            totalPages: 1,
            summary: {
              total: 1,
              published: 0,
              pending: 0,
              totalClaimed: 5,
            },
          });
        }
        if (typeof url === "string" && url.includes("status=pending_approval")) {
          return Promise.resolve({
            items: [
              {
                id: "camp-pending-1",
                code: "PENDING10",
                name: "Pending Campaign",
                status: "pending_approval",
                discountType: "PERCENT",
                discountValue: 10,
                startsAt: "2026-11-01T00:00:00.000Z",
                endsAt: "2026-11-30T00:00:00.000Z",
                usedCount: 0,
              },
            ],
            total: 1,
            page: 1,
            totalPages: 1,
            summary: {
              total: 1,
              published: 0,
              pending: 1,
              totalClaimed: 0,
            },
          });
        }
        return Promise.resolve({
          items: sampleCampaigns,
          total: 2,
          page: 1,
          totalPages: 1,
          summary: { total: 2, published: 1, pending: 1, totalClaimed: 15 },
        });
      });

      render(<CampaignsSection token={mockToken} user={mockUser} />);
      await screen.findByText("Super Summer 2026");

      // 1. Filter by status: draft
      const statusContainer = screen.getByText("สถานะ:").closest("div");
      const statusTrigger = within(statusContainer).getByRole("button");
      fireEvent.click(statusTrigger);
      const draftListbox = within(statusContainer).getByRole("listbox");
      const draftOption = within(draftListbox).getByText("ฉบับร่าง");
      fireEvent.click(draftOption);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("status=draft"),
          expect.anything(),
        );
      });

      expect(await screen.findByText("DRAFT10")).toBeInTheDocument();
      // Published card must be 0, Pending card must be 0, totalClaimed must be 5
      expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("5")).toBeInTheDocument();

      // 2. Filter by status: pending_approval
      fireEvent.click(statusTrigger);
      const pendingListbox = within(statusContainer).getByRole("listbox");
      const pendingOption = within(pendingListbox).getByText("รออนุมัติ");
      fireEvent.click(pendingOption);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          expect.stringContaining("status=pending_approval"),
          expect.anything(),
        );
      });

      expect(await screen.findByText("PENDING10")).toBeInTheDocument();
      // Published card must be 0, Pending card must be 1
      expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    });
  });
});
