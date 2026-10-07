import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DashboardSection, {
  convertThaiDateFilterToRange,
  formatPeakHour,
  formatHourLabel,
} from "./DashboardSection";
import { apiFetch, getMarketingUserAnalytics } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  getMarketingUserAnalytics: jest.fn(),
}));

jest.mock("../../charts/DonutChart", () => {
  return function MockDonutChart() {
    return <div data-testid="mock-donut-chart">DonutChart</div>;
  };
});

jest.mock("../../charts/TrendBarChart", () => {
  return function MockTrendBarChart({ data }) {
    return (
      <div data-testid="mock-trend-chart">
        TrendBarChart ({data ? data.length : 0} items)
      </div>
    );
  };
});

describe("DashboardSection date & time helper utilities", () => {
  describe("convertThaiDateFilterToRange", () => {
    test("converts standard date range with next-day exclusive boundary in Asia/Bangkok", () => {
      const res = convertThaiDateFilterToRange("2026-06-01", "2026-06-07");
      expect(res).toEqual({
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-08T00:00:00+07:00",
        timezone: "Asia/Bangkok",
      });
    });

    test("converts single-day filter to 24-hour midnight boundary", () => {
      const res = convertThaiDateFilterToRange("2026-06-01", "2026-06-01");
      expect(res).toEqual({
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-02T00:00:00+07:00",
        timezone: "Asia/Bangkok",
      });
    });

    test("handles month boundary correctly (May 31 -> June 1)", () => {
      const res = convertThaiDateFilterToRange("2026-05-25", "2026-05-31");
      expect(res).toEqual({
        from: "2026-05-25T00:00:00+07:00",
        to: "2026-06-01T00:00:00+07:00",
        timezone: "Asia/Bangkok",
      });
    });

    test("handles leap year boundary correctly (Feb 28 in 2024 -> Feb 29)", () => {
      const res = convertThaiDateFilterToRange("2024-02-28", "2024-02-28");
      expect(res).toEqual({
        from: "2024-02-28T00:00:00+07:00",
        to: "2024-02-29T00:00:00+07:00",
        timezone: "Asia/Bangkok",
      });
    });

    test("handles non-leap year boundary correctly (Feb 28 in 2025 -> March 1)", () => {
      const res = convertThaiDateFilterToRange("2025-02-28", "2025-02-28");
      expect(res).toEqual({
        from: "2025-02-28T00:00:00+07:00",
        to: "2025-03-01T00:00:00+07:00",
        timezone: "Asia/Bangkok",
      });
    });

    test("handles year boundary correctly (Dec 31 -> Jan 1 next year)", () => {
      const res = convertThaiDateFilterToRange("2026-12-25", "2026-12-31");
      expect(res).toEqual({
        from: "2026-12-25T00:00:00+07:00",
        to: "2027-01-01T00:00:00+07:00",
        timezone: "Asia/Bangkok",
      });
    });

    test("returns null for missing, empty, or malformed inputs", () => {
      expect(convertThaiDateFilterToRange("", "2026-06-07")).toBeNull();
      expect(convertThaiDateFilterToRange("2026-06-01", "")).toBeNull();
      expect(convertThaiDateFilterToRange(null, "2026-06-07")).toBeNull();
      expect(
        convertThaiDateFilterToRange("invalid-date", "2026-06-07"),
      ).toBeNull();
    });
  });

  describe("formatPeakHour and formatHourLabel", () => {
    test("formatPeakHour formats Bangkok time without UTC string", () => {
      const formatted = formatPeakHour({
        hour: "2026-06-03T14:00:00+07:00",
        usageCount: 18,
      });
      expect(formatted).not.toContain("UTC");
      expect(formatted).toContain("น.");
    });

    test("formatPeakHour returns dash for null or missing hour", () => {
      expect(formatPeakHour(null)).toBe("—");
      expect(formatPeakHour({ hour: null })).toBe("—");
      expect(formatPeakHour({ hour: "invalid" })).toBe("—");
    });

    test("formatHourLabel formats Bangkok hour without UTC string", () => {
      const formatted = formatHourLabel("2026-06-03T14:00:00+07:00");
      expect(formatted).not.toContain("UTC");
    });

    test("formatHourLabel returns dash for null or empty input", () => {
      expect(formatHourLabel(null)).toBe("—");
      expect(formatHourLabel("")).toBe("—");
    });
  });
});

describe("DashboardSection (Responsive Layout & Functionality)", () => {
  const mockToken = "test-token";
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOverview = {
    completedOrders: 120,
    grossRevenue: 45000,
    totalDiscount: 5000,
    netRevenue: 40000,
    totalClaimed: 300,
    totalRedeemed: 150,
    overallConversionRate: 50,
  };

  const mockTrends = {
    series: [
      { date: "2026-06-01", orders: 10, grossRevenue: 3000 },
      { date: "2026-06-02", orders: 15, grossRevenue: 4500 },
    ],
  };

  const mockCompare = {
    comparisons: [
      {
        campaignId: "camp-1",
        campaignName: "Mid Year Sale",
        campaignCode: "MID2026",
        status: "published",
        completedOrders: 50,
        grossRevenue: 15000,
        totalDiscount: 1500,
        netRevenue: 13500,
        conversionRate: 60,
      },
    ],
  };

  const mockUserAnalytics = {
    range: {
      from: "2026-06-01T00:00:00+07:00",
      to: "2026-06-08T00:00:00+07:00",
      timezone: "Asia/Bangkok",
    },
    activeUsers: 42,
    newUsers: 15,
    peakHour: {
      hour: "2026-06-03T14:00:00+07:00",
      usageCount: 18,
    },
    hourlyUsage: [
      { hour: "2026-06-03T13:00:00+07:00", usageCount: 5 },
      { hour: "2026-06-03T14:00:00+07:00", usageCount: 18 },
      { hour: "2026-06-03T15:00:00+07:00", usageCount: 10 },
    ],
  };

  function setupApiFetch() {
    getMarketingUserAnalytics.mockResolvedValue(mockUserAnalytics);
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/campaigns/metrics/overview")) {
        return Promise.resolve(mockOverview);
      }
      if (url.includes("/api/products/campaigns/metrics/trends")) {
        return Promise.resolve(mockTrends);
      }
      if (url.includes("/api/products/campaigns/metrics/compare")) {
        return Promise.resolve(mockCompare);
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ total: 5 });
      }
      return Promise.resolve({});
    });
  }

  test("renders KPI cards, comparison table and charts after loading", async () => {
    setupApiFetch();

    render(<DashboardSection token={mockToken} onNavigate={mockNavigate} />);

    // Initially shows filter bar
    expect(
      screen.getByText("ช่วงเวลาการวัดผล (Attribution Window)"),
    ).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText("ยอดขายสุทธิ (Net)")).toBeInTheDocument();
      expect(screen.getByText("คำสั่งซื้อสำเร็จ")).toBeInTheDocument();
      expect(screen.getByText("Mid Year Sale")).toBeInTheDocument();
    });

    // Check responsive table and charts
    expect(screen.getByTestId("mock-donut-chart")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("mock-trend-chart").length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("triggers onNavigate when clicking on auction pipeline KPI card", async () => {
    setupApiFetch();

    render(<DashboardSection token={mockToken} onNavigate={mockNavigate} />);

    await waitFor(() => {
      expect(screen.getByText("Mid Year Sale")).toBeInTheDocument();
    });

    const pendingKpi = screen.getByText("รอการอนุมัติ (Marketing)");
    fireEvent.click(pendingKpi);

    expect(mockNavigate).toHaveBeenCalledWith("auctions");
  });

  test("renders user analytics KPI cards, peak hour, and hourly usage chart", async () => {
    setupApiFetch();

    render(<DashboardSection token={mockToken} onNavigate={mockNavigate} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "สถิติผู้ใช้งานและช่วงเวลาการใช้งาน (User & Peak-Usage Analytics)",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("ผู้ใช้งานที่มีการใช้งาน (Active Users)"),
      ).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("ผู้ใช้งานใหม่ (New Users)")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(
        screen.getByText("ช่วงเวลาใช้งานสูงสุด (Peak Usage Hour)"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/18 ผู้ใช้งาน active ในชั่วโมงนี้/),
      ).toBeInTheDocument();
      expect(
        screen.getByText("กราฟแสดงการใช้งานรายชั่วโมง (Hourly Usage)"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByLabelText("ตารางสถิติการใช้งานรายชั่วโมง"),
    ).toBeInTheDocument();
  });

  test("converts Thai date inputs to Bangkok boundaries when filter button is clicked", async () => {
    setupApiFetch();

    const { container } = render(
      <DashboardSection token={mockToken} onNavigate={mockNavigate} />,
    );

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const fromInput = dateInputs[0];
    const toInput = dateInputs[1];

    fireEvent.change(fromInput, { target: { value: "2026-06-01" } });
    fireEvent.change(toInput, { target: { value: "2026-06-07" } });

    const searchBtn = screen.getByRole("button", { name: /ค้นหา \/ รีเฟรช/i });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(getMarketingUserAnalytics).toHaveBeenCalledWith(
        {
          from: "2026-06-01T00:00:00+07:00",
          to: "2026-06-08T00:00:00+07:00",
          timezone: "Asia/Bangkok",
        },
        mockToken,
      );
    });
  });

  test("shows validation error and does not call API when only one date filter is provided", async () => {
    setupApiFetch();

    const { container } = render(
      <DashboardSection token={mockToken} onNavigate={mockNavigate} />,
    );

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const fromInput = dateInputs[0];

    fireEvent.change(fromInput, { target: { value: "2026-06-01" } });

    getMarketingUserAnalytics.mockClear();

    const searchBtn = screen.getByRole("button", { name: /ค้นหา \/ รีเฟรช/i });
    fireEvent.click(searchBtn);

    expect(
      screen.getByText("กรุณาระบุทั้งวันที่เริ่มต้นและวันที่สิ้นสุด"),
    ).toBeInTheDocument();
    expect(getMarketingUserAnalytics).not.toHaveBeenCalled();
  });

  test("shows validation error when from date is greater than to date", async () => {
    setupApiFetch();

    const { container } = render(
      <DashboardSection token={mockToken} onNavigate={mockNavigate} />,
    );

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-06-10" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-06-01" } });

    getMarketingUserAnalytics.mockClear();

    const searchBtn = screen.getByRole("button", { name: /ค้นหา \/ รีเฟรช/i });
    fireEvent.click(searchBtn);

    expect(
      screen.getByText("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด"),
    ).toBeInTheDocument();
    expect(getMarketingUserAnalytics).not.toHaveBeenCalled();
  });

  test("resets filters and restores default range when reset button is clicked", async () => {
    setupApiFetch();

    const { container } = render(
      <DashboardSection token={mockToken} onNavigate={mockNavigate} />,
    );

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const fromInput = dateInputs[0];
    fireEvent.change(fromInput, { target: { value: "2026-06-01" } });

    const resetBtn = screen.getByRole("button", { name: /ล้างตัวกรอง/i });
    fireEvent.click(resetBtn);

    expect(fromInput.value).toBe("");

    await waitFor(() => {
      expect(getMarketingUserAnalytics).toHaveBeenCalledWith(
        { timezone: "Asia/Bangkok" },
        mockToken,
      );
    });
  });

  test("renders explicit error state when user analytics fails (KPIs show '—', not 0, and not empty state)", async () => {
    setupApiFetch();
    getMarketingUserAnalytics.mockRejectedValue(
      new Error("403 Forbidden - Marketing permission required"),
    );

    render(<DashboardSection token={mockToken} onNavigate={mockNavigate} />);

    await waitFor(() => {
      expect(
        screen.getByText("403 Forbidden - Marketing permission required"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "ไม่สามารถแสดงกราฟได้เนื่องจากเกิดข้อผิดพลาดในการโหลดข้อมูล",
        ),
      ).toBeInTheDocument();
    });

    // Check KPIs show "—" and "ไม่พร้อมใช้งาน", NOT "0"
    const activeUsersCard = screen
      .getByText("ผู้ใช้งานที่มีการใช้งาน (Active Users)")
      .closest("div");
    expect(activeUsersCard).toHaveTextContent("—");
    expect(activeUsersCard).not.toHaveTextContent("0");

    const newUsersCard = screen
      .getByText("ผู้ใช้งานใหม่ (New Users)")
      .closest("div");
    expect(newUsersCard).toHaveTextContent("—");
    expect(newUsersCard).not.toHaveTextContent("0");

    const peakHourCard = screen
      .getByText("ช่วงเวลาใช้งานสูงสุด (Peak Usage Hour)")
      .closest("div");
    expect(peakHourCard).toHaveTextContent("ไม่พร้อมใช้งาน");

    // Empty state should NOT be rendered when there is an error
    expect(
      screen.queryByText("ยังไม่มีข้อมูลกิจกรรมผู้ใช้ในช่วงเวลาที่เลือก"),
    ).not.toBeInTheDocument();

    // Test retry button restores data on success
    getMarketingUserAnalytics.mockResolvedValueOnce(mockUserAnalytics);
    const retryButtons = screen.getAllByRole("button", { name: /ลองใหม่/i });
    fireEvent.click(retryButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(
        screen.queryByText("403 Forbidden - Marketing permission required"),
      ).not.toBeInTheDocument();
    });
  });

  test("renders empty state when user analytics has zero activities (shows 0 as legitimate count)", async () => {
    setupApiFetch();
    getMarketingUserAnalytics.mockResolvedValue({
      range: {
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-08T00:00:00+07:00",
        timezone: "Asia/Bangkok",
      },
      activeUsers: 0,
      newUsers: 0,
      peakHour: { hour: null, usageCount: 0 },
      hourlyUsage: [{ hour: "2026-06-01T00:00:00+07:00", usageCount: 0 }],
    });

    render(<DashboardSection token={mockToken} onNavigate={mockNavigate} />);

    await waitFor(() => {
      expect(
        screen.getByText("ยังไม่มีข้อมูลกิจกรรมผู้ใช้ในช่วงเวลาที่เลือก"),
      ).toBeInTheDocument();
      // In legitimate empty state, 0 is displayed for counts
      const activeUsersCard = screen
        .getByText("ผู้ใช้งานที่มีการใช้งาน (Active Users)")
        .closest("div");
      expect(activeUsersCard).toHaveTextContent("0");

      const newUsersCard = screen
        .getByText("ผู้ใช้งานใหม่ (New Users)")
        .closest("div");
      expect(newUsersCard).toHaveTextContent("0");
    });
  });
});
