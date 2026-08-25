import { render, screen, within, fireEvent } from "@testing-library/react";
import ExecutiveReportsPage from "./page";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { downloadCsv } from "../../../lib/csv";

jest.mock(
  "../../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

jest.mock("../../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

jest.mock("../../../lib/csv", () => ({
  ...jest.requireActual("../../../lib/csv"),
  downloadCsv: jest.fn(),
}));

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const META = { definitionVersion: "v1", timezone: "Asia/Bangkok" };

const ORDER_SERIES = [
  {
    period: "2026-08-01T00:00:00.000Z",
    gmv: 500,
    platformRevenue: 50,
    completedOrders: 2,
  },
  {
    period: "2026-08-02T00:00:00.000Z",
    gmv: 0,
    platformRevenue: 0,
    completedOrders: 0,
  },
];
const AUTH_SERIES = [
  { period: "2026-08-01T00:00:00.000Z", activeUsers: 3 },
  { period: "2026-08-02T00:00:00.000Z", activeUsers: 1 },
];

function serveSeries({ order = ORDER_SERIES, auth = AUTH_SERIES } = {}) {
  apiFetch.mockImplementation((path) => {
    if (path.startsWith("/api/orders/executive/metrics-series")) {
      if (order instanceof Error) return Promise.reject(order);
      return Promise.resolve({ data: order, meta: META });
    }
    if (path.startsWith("/api/auth/executive/metrics-series")) {
      if (auth instanceof Error) return Promise.reject(auth);
      return Promise.resolve({ data: auth, meta: META });
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

describe("ExecutiveReportsPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    downloadCsv.mockReset();
    getAccessToken.mockReturnValue("token");
    getStoredUser.mockReturnValue({ role: "EXECUTIVE", firstName: "อัสนัย" });
    // Freeze "now" so the default selection (this month) is known.
    jest.useFakeTimers({ doNotFake: ["setTimeout", "queueMicrotask"] });
    jest.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("restricts the page to Executive accounts", async () => {
    getStoredUser.mockReturnValue({ role: "BUYER", firstName: "ผู้ซื้อ" });

    render(<ExecutiveReportsPage />);

    expect(
      await screen.findByText("หน้านี้ใช้ได้เฉพาะบัญชีผู้บริหารเท่านั้น"),
    ).toBeInTheDocument();
  });

  it("renders one row per day, merging the order and auth series by period", async () => {
    serveSeries();

    render(<ExecutiveReportsPage />);

    const day1Row = (await screen.findByText("1. 01/ส.ค./69")).closest("tr");
    expect(within(day1Row).getByText("฿500")).toBeInTheDocument();
    expect(within(day1Row).getByText("฿50")).toBeInTheDocument();
    expect(within(day1Row).getByText("2")).toBeInTheDocument();
    expect(within(day1Row).getByText("3")).toBeInTheDocument();

    const day2Row = screen.getByText("2. 02/ส.ค./69").closest("tr");
    // Both gmv and platformRevenue are 0 on this day, so "฿0" legitimately
    // appears twice in the row.
    expect(within(day2Row).getAllByText("฿0")).toHaveLength(2);

    // No MoM/YoY column — the user asked for the daily breakdown instead.
    expect(screen.queryByText(/MoM/)).not.toBeInTheDocument();
    expect(screen.queryByText(/YoY/)).not.toBeInTheDocument();
  });

  it("switches to one row per month, with full Thai month names, for a yearly report", async () => {
    const monthOrderSeries = [
      {
        period: "2026-01-01T00:00:00.000Z",
        gmv: 100,
        platformRevenue: 10,
        completedOrders: 1,
      },
      {
        period: "2026-02-01T00:00:00.000Z",
        gmv: 200,
        platformRevenue: 20,
        completedOrders: 2,
      },
    ];
    const monthAuthSeries = [
      { period: "2026-01-01T00:00:00.000Z", activeUsers: 5 },
      { period: "2026-02-01T00:00:00.000Z", activeUsers: 6 },
    ];
    serveSeries({ order: monthOrderSeries, auth: monthAuthSeries });

    render(<ExecutiveReportsPage />);

    fireEvent.change(screen.getByLabelText("รูปแบบรายงาน"), {
      target: { value: "year" },
    });

    expect(await screen.findByText("1. มกราคม")).toBeInTheDocument();
    expect(screen.getByText("2. กุมภาพันธ์")).toBeInTheDocument();
    expect(screen.queryByLabelText("เดือน")).not.toBeInTheDocument();

    // The heading follows the granularity switch too — "รายวัน" (daily)
    // must not linger once the table is actually broken down by month.
    expect(
      screen.getByText(/ผลการดำเนินงานรายเดือน — ปี 2569/),
    ).toBeInTheDocument();

    // Requests a month-bucketed series after the switch, not the initial
    // day-bucketed one from the default month view.
    const orderCalls = apiFetch.mock.calls.filter(([path]) =>
      path.startsWith("/api/orders/executive/metrics-series"),
    );
    expect(orderCalls.at(-1)[0]).toContain("granularity=month");
  });

  it("shows unavailable only for the column whose provider failed", async () => {
    serveSeries({ order: new Error("order-service unreachable") });

    render(<ExecutiveReportsPage />);

    const day1Row = (await screen.findByText("1. 01/ส.ค./69")).closest("tr");
    expect(within(day1Row).getAllByText("ไม่พร้อมใช้งาน").length).toBe(3);
    // Active users still came from the auth series, which did succeed.
    expect(within(day1Row).getByText("3")).toBeInTheDocument();
  });

  it("shows a page-level message rather than an empty table when both providers fail", async () => {
    serveSeries({
      order: new Error("order-service unreachable"),
      auth: new Error("auth-service unreachable"),
    });

    render(<ExecutiveReportsPage />);

    expect(
      await screen.findByText(/ไม่สามารถโหลดข้อมูลได้ในขณะนี้/),
    ).toBeInTheDocument();
  });

  it("exports one row per day with one column per metric, each column a single unit", async () => {
    serveSeries();

    render(<ExecutiveReportsPage />);
    await screen.findByText("1. 01/ส.ค./69");

    fireEvent.click(screen.getByRole("button", { name: /ดาวน์โหลด CSV/ }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadCsv.mock.calls[0];
    expect(filename).toBe("reloop-executive-report-2026-08.csv");

    const lines = content.trim().split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 fixture days
    expect(lines[0]).toBe(
      "ช่วงเวลา,ยอดขาย (บาท),รายได้แพลตฟอร์ม (บาท),คำสั่งซื้อ (รายการ),ผู้ใช้งานที่ล็อกอิน (คน)",
    );
    expect(lines[1]).toBe("01/ส.ค./69,500,50,2,3");
    expect(lines[2]).toBe("02/ส.ค./69,0,0,0,1");
  });
});
