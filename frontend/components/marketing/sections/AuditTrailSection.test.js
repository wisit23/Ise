import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AuditTrailSection, { convertAuditDateFilter } from "./AuditTrailSection";
import { getMarketingAuditLogs } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  getMarketingAuditLogs: jest.fn(),
}));

describe("convertAuditDateFilter unit helper", () => {
  test("handles empty inputs", () => {
    expect(convertAuditDateFilter("", "")).toEqual({
      from: undefined,
      to: undefined,
    });
  });

  test("converts same-day filter to inclusive Bangkok day [00:00:00+07:00, next-day 00:00:00+07:00)", () => {
    const range = convertAuditDateFilter("2026-06-01", "2026-06-01");
    expect(range).toEqual({
      from: "2026-06-01T00:00:00+07:00",
      to: "2026-06-02T00:00:00+07:00",
    });
  });

  test("handles month boundary correctly (Jan 31 -> Feb 01)", () => {
    const range = convertAuditDateFilter("2026-01-31", "2026-01-31");
    expect(range).toEqual({
      from: "2026-01-31T00:00:00+07:00",
      to: "2026-02-01T00:00:00+07:00",
    });
  });

  test("throws error when from date is after to date", () => {
    expect(() => convertAuditDateFilter("2026-06-05", "2026-06-01")).toThrow(
      "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด",
    );
  });
});

describe("AuditTrailSection", () => {
  const mockToken = "marketing-test-token";

  const sampleLogs = [
    {
      id: "audit-1",
      actorId: "user-123",
      actorRole: "MARKETING",
      action: "CAMPAIGN_CREATE",
      entityType: "CAMPAIGN",
      entityId: "camp-001",
      previousState: null,
      newState: { id: "camp-001", name: "Summer Sale 2026", status: "draft" },
      metadata: { source: "marketing-portal" },
      idempotencyKey: null,
      createdAt: "2026-06-01T10:00:00.000Z",
    },
    {
      id: "audit-2",
      actorId: "SYSTEM",
      actorRole: "SYSTEM",
      action: "CAMPAIGN_END",
      entityType: "CAMPAIGN",
      entityId: "camp-002",
      previousState: { id: "camp-002", status: "published" },
      newState: { id: "camp-002", status: "expired" },
      metadata: { reason: "SCHEDULED_EXPIRY" },
      idempotencyKey: "CAMPAIGN_END:camp-002",
      createdAt: "2026-06-02T12:00:00.000Z",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows loading state and then renders table with audit logs", async () => {
    getMarketingAuditLogs.mockResolvedValueOnce({
      items: sampleLogs,
      total: 2,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    // Initially loading
    expect(
      screen.getByText("ประวัติการดำเนินงาน (Marketing Audit Trail)"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("CAMPAIGN_CREATE")).toBeInTheDocument();
      expect(screen.getByText("CAMPAIGN_END")).toBeInTheDocument();
    });

    // Verify actor rendering
    expect(screen.getByText("user-123")).toBeInTheDocument();
    expect(screen.getByText("ระบบอัตโนมัติ (SYSTEM)")).toBeInTheDocument();

    // Verify entity IDs
    expect(screen.getByText("camp-001")).toBeInTheDocument();
    expect(screen.getByText("camp-002")).toBeInTheDocument();

    // Verify pagination summary
    expect(screen.getByText(/ทั้งหมด/)).toBeInTheDocument();
  });

  test("submits filters and calls API with filter params", async () => {
    getMarketingAuditLogs.mockResolvedValue({
      items: sampleLogs,
      total: 2,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("CAMPAIGN_CREATE")).toBeInTheDocument();
    });

    // Select action filter
    const actionSelect = screen.getByLabelText(/คำสั่ง \(Action\)/i);
    fireEvent.change(actionSelect, { target: { value: "CAMPAIGN_CREATE" } });

    // Fill actor ID
    const actorInput = screen.getByPlaceholderText(
      /e\.g\. SYSTEM หรือ user id/i,
    );
    fireEvent.change(actorInput, { target: { value: "user-123" } });

    // Submit filter form
    const filterBtn = screen.getByRole("button", { name: /กรองข้อมูล/i });
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(getMarketingAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CAMPAIGN_CREATE",
          actorId: "user-123",
          page: 1,
          limit: 20,
        }),
        mockToken,
      );
    });
  });

  test("resets filters on clicking reset button", async () => {
    getMarketingAuditLogs.mockResolvedValue({
      items: sampleLogs,
      total: 2,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("CAMPAIGN_CREATE")).toBeInTheDocument();
    });

    const actorInput = screen.getByPlaceholderText(
      /e\.g\. SYSTEM หรือ user id/i,
    );
    fireEvent.change(actorInput, { target: { value: "custom-user" } });
    expect(actorInput.value).toBe("custom-user");

    const resetBtn = screen.getByRole("button", { name: /ล้างตัวกรอง/i });
    fireEvent.click(resetBtn);

    expect(actorInput.value).toBe("");
  });

  test("renders empty state when no logs returned", async () => {
    getMarketingAuditLogs.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("ไม่พบประวัติการดำเนินงาน")).toBeInTheDocument();
      expect(
        screen.getByText(
          "ไม่พบรายการบันทึกที่ตรงตามเงื่อนไขตัวกรองที่คุณกำหนด",
        ),
      ).toBeInTheDocument();
    });
  });

  test("renders error state on API failure and retries on clicking retry", async () => {
    getMarketingAuditLogs.mockRejectedValueOnce(new Error("เครือข่ายขัดข้อง"));

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(
        screen.getByText("โหลดประวัติการดำเนินงานไม่สำเร็จ"),
      ).toBeInTheDocument();
      expect(screen.getByText("เครือข่ายขัดข้อง")).toBeInTheDocument();
    });

    // Click retry
    getMarketingAuditLogs.mockResolvedValueOnce({
      items: sampleLogs,
      total: 2,
      page: 1,
      totalPages: 1,
    });

    const retryBtn = screen.getByRole("button", { name: /ลองใหม่/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("CAMPAIGN_CREATE")).toBeInTheDocument();
    });
  });

  test("opens detail modal with previous/new state and metadata when clicking view details", async () => {
    getMarketingAuditLogs.mockResolvedValueOnce({
      items: sampleLogs,
      total: 2,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("CAMPAIGN_CREATE")).toBeInTheDocument();
    });

    const detailButtons = screen.getAllByRole("button", {
      name: /ดูรายละเอียด/i,
    });
    fireEvent.click(detailButtons[0]);

    // Modal title
    expect(
      screen.getByText("รายละเอียดบันทึกการดำเนินงาน (Audit Detail)"),
    ).toBeInTheDocument();

    // Verify modal contents
    expect(
      screen.getByText("Summer Sale 2026", { exact: false }),
    ).toBeInTheDocument();

    // Close modal using close button
    const closeButtons = screen.getAllByRole("button", { name: /ปิด/i });
    fireEvent.click(closeButtons[0]);

    await waitFor(() => {
      expect(
        screen.queryByText("รายละเอียดบันทึกการดำเนินงาน (Audit Detail)"),
      ).not.toBeInTheDocument();
    });
  });

  test("navigates pagination when multiple pages exist", async () => {
    getMarketingAuditLogs.mockResolvedValueOnce({
      items: sampleLogs,
      total: 40,
      page: 1,
      totalPages: 2,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("CAMPAIGN_CREATE")).toBeInTheDocument();
    });

    getMarketingAuditLogs.mockResolvedValueOnce({
      items: sampleLogs,
      total: 40,
      page: 2,
      totalPages: 2,
    });

    const nextBtn = screen.getByRole("button", { name: /ถัดไป/i });
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(getMarketingAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        mockToken,
      );
    });
  });

  test("submits same-day date filter and converts to Bangkok boundary range", async () => {
    getMarketingAuditLogs.mockResolvedValue({
      items: sampleLogs,
      total: 2,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("CAMPAIGN_CREATE")).toBeInTheDocument();
    });

    const fromInput = screen.getByLabelText(/ตั้งแต่วันที่/i);
    const toInput = screen.getByLabelText(/ถึงวันที่/i);

    fireEvent.change(fromInput, { target: { value: "2026-06-01" } });
    fireEvent.change(toInput, { target: { value: "2026-06-01" } });

    const filterBtn = screen.getByRole("button", { name: /กรองข้อมูล/i });
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(getMarketingAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "2026-06-01T00:00:00+07:00",
          to: "2026-06-02T00:00:00+07:00",
          page: 1,
        }),
        mockToken,
      );
    });
  });

  test("validates invalid date range where from > to and displays error", async () => {
    getMarketingAuditLogs.mockResolvedValue({
      items: sampleLogs,
      total: 2,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("CAMPAIGN_CREATE")).toBeInTheDocument();
    });

    const fromInput = screen.getByLabelText(/ตั้งแต่วันที่/i);
    const toInput = screen.getByLabelText(/ถึงวันที่/i);

    fireEvent.change(fromInput, { target: { value: "2026-06-10" } });
    fireEvent.change(toInput, { target: { value: "2026-06-05" } });

    const filterBtn = screen.getByRole("button", { name: /กรองข้อมูล/i });
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(
        screen.getByText("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด"),
      ).toBeInTheDocument();
    });
  });
});
