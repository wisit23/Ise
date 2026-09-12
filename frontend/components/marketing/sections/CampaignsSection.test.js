import { render, screen, fireEvent } from "@testing-library/react";
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
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-07-31T23:59:59.000Z",
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
    apiFetch.mockResolvedValue({ items: sampleCampaigns, total: 3 });
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

    expect(
      screen.getByText("สร้างแคมเปญโปรโมชันใหม่"),
    ).toBeInTheDocument();
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
});
