import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AuditTrailSection, {
  convertAuditDateFilter,
  renderDiffValue,
} from "./AuditTrailSection";
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
      screen.getByText("ประวัติการดำเนินงาน"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("สร้างแคมเปญใหม่ (ร่าง)")).toBeInTheDocument();
      expect(screen.getByText("สิ้นสุดแคมเปญ")).toBeInTheDocument();
    });

    // Verify actor rendering
    expect(screen.getByText("ไม่พบชื่อผู้ดำเนินการ")).toBeInTheDocument();
    expect(screen.getAllByText("ระบบอัตโนมัติ").length).toBeGreaterThanOrEqual(1);

    // Verify entity IDs
    expect(screen.queryByText("camp-001")).not.toBeInTheDocument();
    expect(screen.queryByText("camp-002")).not.toBeInTheDocument();

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
      expect(screen.getByText("สร้างแคมเปญใหม่ (ร่าง)")).toBeInTheDocument();
    });

    // Select action filter
    const actionSelect = document.querySelector("#actionFilter");
    fireEvent.change(actionSelect, { target: { value: "CAMPAIGN_CREATE" } });

    // Fill operator search query
    const actorInput = screen.getByPlaceholderText(
      /ค้นหาชื่อผู้ดำเนินการ/i,
    );
    fireEvent.change(actorInput, { target: { value: "user-123" } });

    // Submit filter form
    const filterBtn = screen.getByRole("button", { name: /กรองข้อมูล/i });
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(getMarketingAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CAMPAIGN_CREATE",
          actorQuery: "user-123",
          page: 1,
          limit: 20,
        }),
        mockToken,
      );
      const callArgs = getMarketingAuditLogs.mock.calls[0][0];
      expect(callArgs.actorId).toBeUndefined();
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
      expect(screen.getByText("สร้างแคมเปญใหม่ (ร่าง)")).toBeInTheDocument();
    });

    const actorInput = screen.getByPlaceholderText(
      /ค้นหาชื่อผู้ดำเนินการ/i,
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
      expect(screen.getByText("สร้างแคมเปญใหม่ (ร่าง)")).toBeInTheDocument();
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
      expect(screen.getByText("สร้างแคมเปญใหม่ (ร่าง)")).toBeInTheDocument();
    });

    const detailButtons = screen.getAllByRole("button", {
      name: /ดูรายละเอียด/i,
    });
    fireEvent.click(detailButtons[0]);

    // Modal title
    expect(
      screen.getByText("รายละเอียดการดำเนินงาน"),
    ).toBeInTheDocument();

    // Verify modal contents
    expect(
      screen.getAllByText("Summer Sale 2026", { exact: false })[0],
    ).toBeInTheDocument();

    // Close modal using close button
    const closeButtons = screen.getAllByRole("button", { name: /ปิด/i });
    fireEvent.click(closeButtons[0]);

    await waitFor(() => {
      expect(
        screen.queryByText("รายละเอียดการดำเนินงาน"),
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
      expect(screen.getByText("สร้างแคมเปญใหม่ (ร่าง)")).toBeInTheDocument();
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
      expect(screen.getByText("สร้างแคมเปญใหม่ (ร่าง)")).toBeInTheDocument();
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
      expect(screen.getByText("สร้างแคมเปญใหม่ (ร่าง)")).toBeInTheDocument();
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

  test("displays operator name and related entity name with rename indicator", async () => {
    const enrichedLogs = [
      {
        id: "audit-enrich-1",
        actorId: "u-999",
        actorName: "สมชาย ผู้จัดการ",
        actorRole: "MARKETING",
        action: "CAMPAIGN_UPDATE",
        entityType: "CAMPAIGN",
        entityId: "camp-099",
        entityName: "แคมเปญลดพิเศษ 2026",
        previousEntityName: "แคมเปญเดิม",
        newEntityName: "แคมเปญลดพิเศษ 2026",
        previousState: { name: "แคมเปญเดิม" },
        newState: { name: "แคมเปญลดพิเศษ 2026" },
        createdAt: "2026-06-01T10:00:00.000Z",
      },
    ];

    getMarketingAuditLogs.mockResolvedValueOnce({
      items: enrichedLogs,
      total: 1,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("สมชาย ผู้จัดการ")).toBeInTheDocument();
      expect(screen.getByText("แคมเปญลดพิเศษ 2026")).toBeInTheDocument();
      expect(screen.getByText("มีการเปลี่ยนชื่อรายการ")).toBeInTheDocument();
    });
  });

  test("detail modal renders structured Thai diff table, highlights, and reference info without raw JSON", async () => {
    const logWithDiff = {
      id: "audit-diff-1",
      actorId: "u-888",
      actorName: "กานดา การตลาด",
      actorRole: "MARKETING",
      action: "ARTICLE_UPDATE",
      entityType: "ARTICLE",
      entityId: "art-555",
      entityName: "เทรนด์แฟชั่นยั่งยืน",
      previousState: {
        title: "เทรนด์เก่า",
        status: "draft",
        content: "เนื้อหาบทความเดิมสั้นๆ",
        budget: 0,
        isActive: false,
      },
      newState: {
        title: "เทรนด์แฟชั่นยั่งยืน",
        status: "published",
        content: "เนื้อหาบทความใหม่ที่ปรับปรุงแล้วเพื่อความสมบูรณ์แบบในการเผยแพร่สู่ผู้อ่าน",
        budget: 5000,
        isActive: true,
      },
      metadata: {
        reason: "ปรับปรุงเนื้อหาตามข้อเสนอแนะของบรรณาธิการ",
        approvedBy: "หัวหน้าฝ่ายการตลาด",
      },
      createdAt: "2026-06-01T10:00:00.000Z",
    };

    getMarketingAuditLogs.mockResolvedValueOnce({
      items: [logWithDiff],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("เทรนด์แฟชั่นยั่งยืน")).toBeInTheDocument();
    });

    // Click view details
    const detailBtn = screen.getByRole("button", { name: /ดูรายละเอียด/i });
    fireEvent.click(detailBtn);

    // Modal is open
    expect(
      screen.getByText("รายละเอียดการดำเนินงาน"),
    ).toBeInTheDocument();

    // Verify user-facing Thai diff table headers
    expect(screen.getByText("ข้อมูล")).toBeInTheDocument();
    expect(screen.getByText("ก่อนดำเนินการ")).toBeInTheDocument();
    expect(screen.getByText("หลังดำเนินการ")).toBeInTheDocument();

    // Verify Thai translated values
    expect(screen.getByText("ใช่ / เปิดใช้งาน")).toBeInTheDocument();
    expect(screen.getByText("ไม่ใช่ / ปิดใช้งาน")).toBeInTheDocument();
    expect(screen.getByText("฿5,000")).toBeInTheDocument();

    // Verify user-facing note section rendered cleanly
    expect(
      screen.getByText("หมายเหตุเพิ่มเติม"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ปรับปรุงเนื้อหาตามข้อเสนอแนะของบรรณาธิการ"),
    ).toBeInTheDocument();

    // Internal references must not be displayed to Marketing users
    expect(screen.queryByText(/ข้อมูลอ้างอิงสำหรับการตรวจสอบ/i)).not.toBeInTheDocument();
    expect(screen.queryByText("audit-diff-1")).not.toBeInTheDocument();
    expect(screen.queryByText("art-555")).not.toBeInTheDocument();
    expect(screen.queryByText("ARTICLE_UPDATE")).not.toBeInTheDocument();

    // Ensure NO raw JSON code blocks or <pre> elements exist
    expect(document.querySelector("pre")).toBeNull();
  });

  test("detail modal correctly formats discountType switch (PERCENT -> FIXED), nested objects, and arrays without raw JSON", async () => {
    const campaignDiffLog = {
      id: "audit-camp-diff-1",
      actorId: "usr-marketing-01",
      actorName: "นารีรัตน์ การตลาด",
      actorRole: "MARKETING",
      action: "CAMPAIGN_UPDATE",
      entityType: "CAMPAIGN",
      entityId: "camp-777",
      entityName: "แคมเปญลดกระหน่ำกลางปี",
      previousState: {
        name: "แคมเปญลดกระหน่ำกลางปี",
        discountType: "PERCENT",
        discountValue: 15,
        targetSegment: { category: "FASHION", minOrders: 2 },
        tieredRewards: [{ tier: "GOLD", bonus: 50 }, { tier: "SILVER", bonus: 20 }],
      },
      newState: {
        name: "แคมเปญลดกระหน่ำกลางปี",
        discountType: "FIXED",
        discountValue: 100,
        targetSegment: { category: "ELECTRONICS", minOrders: 5 },
        tieredRewards: [{ tier: "PLATINUM", bonus: 100 }],
      },
      metadata: {
        reason: "เปลี่ยนเงื่อนไขส่วนลดเป็นจำนวนเงินคงที่",
      },
      createdAt: "2026-06-03T14:30:00.000Z",
    };

    getMarketingAuditLogs.mockResolvedValueOnce({
      items: [campaignDiffLog],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("แคมเปญลดกระหน่ำกลางปี")).toBeInTheDocument();
    });

    const detailBtn = screen.getByRole("button", { name: /ดูรายละเอียด/i });
    fireEvent.click(detailBtn);

    // Verify discountValue formatting respects each side's discountType
    // Before side: PERCENT -> 15%
    expect(screen.getByText("15%")).toBeInTheDocument();
    // After side: FIXED -> ฿100
    expect(screen.getByText("฿100")).toBeInTheDocument();

    // Verify discountType labels
    expect(screen.getByText("ลดเป็นเปอร์เซ็นต์ (%)")).toBeInTheDocument();
    expect(screen.getByText("ลดเป็นจำนวนเงินคงที่ (บาท)")).toBeInTheDocument();

    // Verify nested object rendered cleanly
    expect(screen.getByText("FASHION")).toBeInTheDocument();
    expect(screen.getByText("ELECTRONICS")).toBeInTheDocument();

    // Verify array of objects rendered without raw JSON
    expect(screen.getByText("GOLD")).toBeInTheDocument();
    expect(screen.getByText("PLATINUM")).toBeInTheDocument();

    // Verify no [object Object] or raw JSON braces
    const modalContent = screen.getByRole("dialog").textContent;
    expect(modalContent).not.toContain("[object Object]");
    expect(modalContent).not.toContain('{"category":');
    expect(document.querySelector("pre")).toBeNull();
  });

  test("hides backend-only search index fields in detail modal", async () => {
    const logWithSearchText = {
      id: "audit-searchtext-1",
      actorId: "usr-marketing-01",
      actorName: "สมชาย แอดมิน",
      actorRole: "MARKETING",
      action: "ARTICLE_UPDATE",
      entityType: "ARTICLE",
      entityId: "art-101",
      entityName: "เทคนิคการตั้งราคาประมูล",
      previousState: {
        title: "เทคนิคการตั้งราคา",
        searchText: "เทคนิค การตั้งราคา",
      },
      newState: {
        title: "เทคนิคการตั้งราคาประมูล",
        searchText: "เทคนิค การตั้งราคาประมูล สินค้า",
      },
      createdAt: "2026-06-03T14:30:00.000Z",
    };

    getMarketingAuditLogs.mockResolvedValueOnce({
      items: [logWithSearchText],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    render(<AuditTrailSection token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText("เทคนิคการตั้งราคาประมูล")).toBeInTheDocument();
    });

    const detailBtn = screen.getByRole("button", { name: /ดูรายละเอียด/i });
    fireEvent.click(detailBtn);

    expect(screen.queryByText("ข้อความสำหรับค้นหา")).not.toBeInTheDocument();
    expect(screen.queryByText("searchText")).not.toBeInTheDocument();
    expect(screen.queryByText("เทคนิค การตั้งราคา")).not.toBeInTheDocument();
  });
});

describe("renderDiffValue unit helper", () => {
  test("formats discountValue according to context discountType", () => {
    // PERCENT -> %
    const { container: percentContainer } = render(
      <div>{renderDiffValue("discountValue", 20, { discountType: "PERCENT" })}</div>,
    );
    expect(percentContainer.textContent).toBe("20%");

    // FIXED -> ฿
    const { container: fixedContainer } = render(
      <div>{renderDiffValue("discountValue", 50, { discountType: "FIXED" })}</div>,
    );
    expect(fixedContainer.textContent).toBe("฿50");

    // Unconfirmed discountType -> plain number, do not guess
    const { container: plainContainer } = render(
      <div>{renderDiffValue("discountValue", 30, null)}</div>,
    );
    expect(plainContainer.textContent).toBe("30");

    const { container: plainObjContainer } = render(
      <div>{renderDiffValue("discountValue", 45, {})}</div>,
    );
    expect(plainObjContainer.textContent).toBe("45");
  });

  test("formats nested objects without JSON.stringify or [object Object]", () => {
    const nested = {
      category: "BOOKS",
      minOrders: 3,
      verified: true,
    };
    const { container } = render(
      <div>{renderDiffValue("targetSegment", nested)}</div>,
    );
    expect(container.textContent).not.toContain("[object Object]");
    expect(container.textContent).not.toContain('{"category"');
    expect(container.textContent).toContain("BOOKS");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("ใช่ / เปิดใช้งาน");
  });

  test("formats array of objects into structured elements without raw JSON", () => {
    const objArray = [
      { id: "1", label: "ขั้นที่ 1", reward: 50 },
      { id: "2", label: "ขั้นที่ 2", reward: 100 },
    ];
    const { container } = render(
      <div>{renderDiffValue("tiers", objArray)}</div>,
    );
    expect(container.textContent).not.toContain("[object Object]");
    expect(container.textContent).not.toContain('{"id":');
    expect(container.textContent).toContain("ขั้นที่ 1");
    expect(container.textContent).toContain("ขั้นที่ 2");
  });

  test("preserves edge case falsy values: null, false, 0, and empty array", () => {
    // null -> '-'
    const { container: nullC } = render(<div>{renderDiffValue("notes", null)}</div>);
    expect(nullC.textContent).toBe("-");

    // false -> 'ไม่ใช่ / ปิดใช้งาน'
    const { container: falseC } = render(<div>{renderDiffValue("isActive", false)}</div>);
    expect(falseC.textContent).toBe("ไม่ใช่ / ปิดใช้งาน");

    // 0 -> '0'
    const { container: zeroC } = render(<div>{renderDiffValue("totalQuota", 0)}</div>);
    expect(zeroC.textContent).toBe("0");

    // empty array -> '(ไม่มีรายการ / ว่าง)'
    const { container: emptyArrC } = render(<div>{renderDiffValue("tags", [])}</div>);
    expect(emptyArrC.textContent).toBe("(ไม่มีรายการ / ว่าง)");
  });
});
