import { render, screen, within, fireEvent } from "@testing-library/react";
import ReportsSection from "./ReportsSection";
import { apiFetch } from "../../../lib/api";
import { downloadCsv } from "../../../lib/csv";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

jest.mock("../../../lib/csv", () => ({
  ...jest.requireActual("../../../lib/csv"),
  downloadCsv: jest.fn(),
}));

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

describe("ReportsSection", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    downloadCsv.mockReset();
    jest.useFakeTimers({ doNotFake: ["setTimeout", "queueMicrotask"] });
    jest.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders one row per day, merging the order and auth series by period", async () => {
    serveSeries();

    render(<ReportsSection token="token" />);

    const day1Row = (await screen.findByText("1. 01/ส.ค./69")).closest("tr");
    expect(within(day1Row).getByText("฿500")).toBeInTheDocument();
    expect(within(day1Row).getByText("฿50")).toBeInTheDocument();
    expect(within(day1Row).getByText("2")).toBeInTheDocument();
    expect(within(day1Row).getByText("3")).toBeInTheDocument();

    const day2Row = screen.getByText("2. 02/ส.ค./69").closest("tr");
    expect(within(day2Row).getAllByText("฿0")).toHaveLength(2);

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

    render(<ReportsSection token="token" />);

    fireEvent.change(screen.getByLabelText("รูปแบบรายงาน"), {
      target: { value: "year" },
    });

    expect(await screen.findByText("1. มกราคม")).toBeInTheDocument();
    expect(screen.getByText("2. กุมภาพันธ์")).toBeInTheDocument();
    expect(screen.queryByLabelText("เดือน")).not.toBeInTheDocument();

    expect(
      screen.getByText(/ผลการดำเนินงานรายเดือน — ปี 2569/),
    ).toBeInTheDocument();

    const orderCalls = apiFetch.mock.calls.filter(([path]) =>
      path.startsWith("/api/orders/executive/metrics-series"),
    );
    expect(orderCalls.at(-1)[0]).toContain("granularity=month");
  });

  it("shows unavailable only for the column whose provider failed", async () => {
    serveSeries({ order: new Error("order-service unreachable") });

    render(<ReportsSection token="token" />);

    const day1Row = (await screen.findByText("1. 01/ส.ค./69")).closest("tr");
    expect(within(day1Row).getAllByText("ไม่พร้อมใช้งาน").length).toBe(3);
    expect(within(day1Row).getByText("3")).toBeInTheDocument();
  });

  it("shows a page-level message rather than an empty table when both providers fail", async () => {
    serveSeries({
      order: new Error("order-service unreachable"),
      auth: new Error("auth-service unreachable"),
    });

    render(<ReportsSection token="token" />);

    expect(
      await screen.findByText(/ไม่สามารถโหลดข้อมูลได้ในขณะนี้/),
    ).toBeInTheDocument();
  });

  it("exports one row per day with one column per metric, each column a single unit", async () => {
    serveSeries();

    render(<ReportsSection token="token" />);
    await screen.findByText("1. 01/ส.ค./69");

    fireEvent.click(screen.getByRole("button", { name: /ดาวน์โหลด CSV/ }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadCsv.mock.calls[0];
    expect(filename).toBe("reloop-executive-report-2026-08.csv");

    const lines = content.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      "ช่วงเวลา,ยอดขาย (บาท),รายได้แพลตฟอร์ม (บาท),คำสั่งซื้อ (รายการ),ผู้ใช้งานที่ล็อกอิน (คน)",
    );
    expect(lines[1]).toBe("01/ส.ค./69,500,50,2,3");
    expect(lines[2]).toBe("02/ส.ค./69,0,0,0,1");
  });
});
