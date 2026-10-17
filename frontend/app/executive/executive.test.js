import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import ExecutiveDashboardPage from "./page";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import { overviewPeriods } from "../../lib/executive";

jest.mock(
  "../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// A rate that is not 3%, so a label can only be right by reading it from the API.
const META = {
  definitionVersion: "v1",
  timezone: "Asia/Bangkok",
  platformFeeRate: 0.07,
};

// Six month buckets starting at Bangkok's first of each month (UTC+7).
const SERIES_ROWS = [4, 5, 6, 7, 8, 9].map((month, i) => ({
  period: new Date(Date.UTC(2026, month, 1) - 7 * 3600 * 1000).toISOString(),
  gmv: 11111 + i,
  platformRevenue: 333,
  completedOrders: 1,
}));

// Web usage per day: 3 then 1 people, so the period adds up to 4.
const AUTH_ROWS = [
  { period: "2026-09-30T17:00:00.000Z", activeUsers: 3 },
  { period: "2026-10-01T17:00:00.000Z", activeUsers: 1 },
];

/** Routes each provider path to a canned response; `overrides` replaces one. */
function mockProviders(overrides = {}) {
  apiFetch.mockImplementation((path) => {
    const key = Object.keys(overrides).find((prefix) =>
      path.startsWith(prefix),
    );
    if (key) return overrides[key](path);

    if (path.startsWith("/api/orders/executive/order-status")) {
      return Promise.resolve({
        data: { completed: 7, inProgress: 5, disputeRefund: 3, total: 15 },
        meta: META,
      });
    }
    if (path.startsWith("/api/orders/executive/metrics-series")) {
      return Promise.resolve({ data: SERIES_ROWS, meta: META });
    }
    if (path.startsWith("/api/orders/executive/metrics")) {
      return Promise.resolve({
        data: {
          gmv: 100000,
          gmvPurchase: 70000,
          gmvAuction: 30000,
          platformRevenue: 3000,
          completedOrders: 2,
        },
        meta: META,
      });
    }
    if (path.startsWith("/api/auth/executive/metrics-series")) {
      return Promise.resolve({ data: AUTH_ROWS, meta: META });
    }
    if (path.startsWith("/api/products/executive/top-catalog")) {
      return Promise.resolve({
        data: {
          categories: [{ id: "bags", label: "กระเป๋า", count: 3, gmv: 900 }],
          popularCategories: [
            { id: "tees", label: "เสื้อยืด", count: 6, gmv: 600 },
            { id: "bags", label: "กระเป๋า", count: 3, gmv: 900 },
          ],
          categoryTotal: { count: 9, gmv: 1500 },
        },
        meta: META,
      });
    }
    return Promise.reject(new Error(`unexpected request ${path}`));
  });
}

describe("ExecutiveDashboardPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    getAccessToken.mockReturnValue("token");
    getStoredUser.mockReturnValue({
      role: "EXECUTIVE",
      firstName: "อัสนัย",
    });
  });

  it("restricts the page to Executive accounts", async () => {
    getStoredUser.mockReturnValue({ role: "BUYER", firstName: "ผู้ซื้อ" });

    render(<ExecutiveDashboardPage />);

    expect(
      await screen.findByText("หน้านี้ใช้ได้เฉพาะบัญชีผู้บริหารเท่านั้น"),
    ).toBeInTheDocument();
  });

  it("renders KPI values once every provider responds", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);

    expect(await screen.findByText("฿70,000")).toBeInTheDocument();
    expect(screen.getByText("฿3,000")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("lists the most popular categories by pieces sold", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);

    const row = (await screen.findByText("เสื้อยืด")).closest("li");
    expect(row).toHaveTextContent("6 ชิ้น");
    expect(row).toHaveTextContent("67%");
    expect(row).toHaveTextContent("฿600");
    expect(screen.queryByText("สินค้าที่ทำรายได้สูงสุด")).toBeNull();
  });

  it("shows five popular categories, ten after 'ดูเพิ่มเติม', and back", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      label: `หมวด ${i + 1}`,
      count: 12 - i,
      gmv: 100,
    }));
    mockProviders({
      "/api/products/executive/top-catalog": () =>
        Promise.resolve({
          data: {
            categories: many.slice(0, 10),
            popularCategories: many.slice(0, 10),
            categoryTotal: { count: 78, gmv: 1200 },
          },
          meta: META,
        }),
    });

    render(<ExecutiveDashboardPage />);
    await screen.findAllByText("หมวด 1");

    const popular = screen
      .getByText("หมวดหมู่ที่นิยมสุด")
      .closest(".rounded-xl");
    const rowsIn = () => within(popular).getAllByRole("listitem").length;
    expect(rowsIn()).toBe(5);

    fireEvent.click(
      within(popular).getByRole("button", { name: "ดูเพิ่มเติม" }),
    );
    expect(rowsIn()).toBe(10);

    fireEvent.click(within(popular).getByRole("button", { name: "ดูน้อยลง" }));
    expect(rowsIn()).toBe(5);
  });

  it("names five categories in the ring, ten after 'ดูเพิ่มเติม'", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      label: `หมวด ${i + 1}`,
      count: 1,
      gmv: 100 - i,
    }));
    mockProviders({
      "/api/products/executive/top-catalog": () =>
        Promise.resolve({
          data: {
            categories: many.slice(0, 10),
            popularCategories: many.slice(0, 10),
            categoryTotal: { count: 12, gmv: 1000 },
          },
          meta: META,
        }),
    });

    render(<ExecutiveDashboardPage />);
    const share = (await screen.findByText("ประเภทสินค้ายอดขายสูงสุด")).closest(
      ".rounded-xl",
    );
    const slices = () => share.querySelectorAll("[data-slice]").length;
    // Five named slices and "other".
    expect(slices()).toBe(6);

    fireEvent.click(within(share).getByRole("button", { name: "ดูเพิ่มเติม" }));
    // Ten named slices and "other" (two categories past the top ten).
    expect(slices()).toBe(11);

    fireEvent.click(within(share).getByRole("button", { name: "ดูน้อยลง" }));
    expect(slices()).toBe(6);
  });

  it("splits sales into purchases and auctions, each with its own card", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);

    const purchase = (await screen.findByText("ยอดขายจากการสั่งซื้อ")).closest(
      "div",
    );
    expect(within(purchase).getByText("฿70,000")).toBeInTheDocument();
    const auction = screen.getByText("ยอดขายจากการประมูล").closest("div");
    expect(within(auction).getByText("฿30,000")).toBeInTheDocument();
    expect(screen.queryByText("ยอดขายรวม (GMV)")).toBeNull();
  });

  it("labels platform revenue with the fee rate the API sent", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);

    expect(await screen.findByText("รายได้แพลตฟอร์ม (7%)")).toBeInTheDocument();
  });

  it("replaces the completed-orders card with the order status donut", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);
    fireEvent.click(screen.getByRole("radio", { name: "เดือนนี้" }));

    await screen.findByText("฿70,000");
    expect(screen.queryByText("คำสั่งซื้อสำเร็จ")).toBeNull();

    expect(screen.getByText("สถานะคำสั่งซื้อ")).toBeInTheDocument();
    expect(screen.getByText("เฉพาะคำสั่งซื้อที่ชำระเงินแล้ว")).toBeVisible();
    expect(screen.getByText("15", { selector: "text" })).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(
      expect.arrayContaining([
        "สำเร็จ747%",
        "กำลังดำเนินการ533%",
        "ข้อพิพาทและคืนเงิน320%",
      ]),
    );

    const { current } = overviewPeriods("month");
    expect(apiFetch.mock.calls.map(([path]) => path)).toContain(
      `/api/orders/executive/order-status?from=${current.from}&to=${current.to}&timezone=Asia%2FBangkok`,
    );
  });

  it("marks only the donut unavailable when the order status request fails", async () => {
    mockProviders({
      "/api/orders/executive/order-status": () =>
        Promise.reject(new Error("order-service unreachable")),
    });

    render(<ExecutiveDashboardPage />);

    expect(await screen.findByText("฿70,000")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /คำสั่งซื้อที่ชำระเงินแล้ว/ }),
    ).toBe(null);
    expect(screen.getAllByText("ไม่พร้อมใช้งาน").length).toBeGreaterThan(0);
    // The sales trend is untouched.
    expect(screen.getByRole("img", { name: /แนวโน้มยอดขาย/ })).toBeVisible();
  });

  it("offers 7 days, this month, this year, then custom, with 7 days chosen", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);
    await screen.findByText("฿70,000");

    const group = screen.getByRole("radiogroup", { name: "ช่วงเวลา" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      "7 วันล่าสุด",
      "เดือนนี้",
      "ปีนี้",
      "กำหนดเอง",
    ]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
  });

  it("starts on the last 7 days, compared with the 7 days before", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);

    expect(await screen.findByText("ยอดรายวัน · 7 วันล่าสุด")).toBeVisible();
    expect(
      screen.getAllByText("เทียบกับ 7 วันก่อนหน้านี้").length,
    ).toBeGreaterThan(0);
    const { current, previous } = overviewPeriods("week");
    const paths = apiFetch.mock.calls.map(([path]) => path);
    expect(paths).toContain(
      `/api/orders/executive/metrics?from=${current.from}&to=${current.to}&timezone=Asia%2FBangkok`,
    );
    expect(paths).toContain(
      `/api/orders/executive/metrics?from=${previous.from}&to=${previous.to}&timezone=Asia%2FBangkok`,
    );
  });

  it("shows one chosen day, charted every hour, against the day before", async () => {
    // Twenty-four hourly slots of 16 Oct 2025 in Bangkok (UTC+7).
    const hours = Array.from({ length: 24 }, (_, i) => ({
      period: new Date(
        Date.UTC(2025, 9, 15, 17) + i * 3600 * 1000,
      ).toISOString(),
      gmv: i === 5 ? 500 : 0,
      platformRevenue: i === 5 ? 15 : 0,
      completedOrders: i === 5 ? 1 : 0,
    }));
    mockProviders({
      "/api/orders/executive/metrics-series": () =>
        Promise.resolve({ data: hours, meta: META }),
    });

    render(<ExecutiveDashboardPage />);
    await screen.findByText("฿70,000");

    fireEvent.click(screen.getByRole("radio", { name: "กำหนดเอง" }));
    fireEvent.change(screen.getByLabelText("เลือกวันที่"), {
      target: { value: "16/10/2568" },
    });

    expect(await screen.findByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("21:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
    // The hours between are points on the line, not named on the axis.
    expect(screen.queryByText("01:00")).toBeNull();
    expect(
      screen.getByText("ผู้ใช้งานเว็บ (16 ต.ค. 2568)"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("เทียบกับวันก่อนหน้า").length).toBeGreaterThan(
      0,
    );

    const paths = apiFetch.mock.calls.map(([path]) => path);
    expect(paths).toContain(
      "/api/orders/executive/metrics?from=2025-10-16&to=2025-10-17&timezone=Asia%2FBangkok",
    );
    expect(paths).toContain(
      "/api/orders/executive/metrics?from=2025-10-15&to=2025-10-16&timezone=Asia%2FBangkok",
    );
    expect(paths).toContain(
      "/api/orders/executive/metrics-series?from=2025-10-16&to=2025-10-17&granularity=hour&timezone=Asia%2FBangkok",
    );
  });

  it("has the date field waiting beside the buttons and applies it on 'กำหนดเอง'", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);
    await screen.findByText("฿70,000");

    // The field is there before "กำหนดเอง" is chosen, after the buttons.
    const field = screen.getByLabelText("เลือกวันที่");
    expect(field).toBeVisible();
    const group = screen.getByRole("radiogroup", { name: "ช่วงเวลา" });
    expect(
      group.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Picking a day alone changes nothing yet.
    const calls = apiFetch.mock.calls.length;
    fireEvent.change(field, { target: { value: "16/10/2568" } });
    expect(apiFetch.mock.calls.length).toBe(calls);
    expect(screen.queryByText("ยอดขายทุก 1 ชั่วโมง · 16 ต.ค. 2568")).toBeNull();

    // Pressing "กำหนดเอง" shows that day.
    fireEvent.click(screen.getByRole("radio", { name: "กำหนดเอง" }));
    expect(
      await screen.findByText("ยอดขายทุก 1 ชั่วโมง · 16 ต.ค. 2568"),
    ).toBeVisible();
    expect(apiFetch.mock.calls.map(([path]) => path)).toContain(
      "/api/orders/executive/metrics-series?from=2025-10-16&to=2025-10-17&granularity=hour&timezone=Asia%2FBangkok",
    );

    // While it is chosen, a new day applies straight away.
    fireEvent.change(field, { target: { value: "17/10/2568" } });
    expect(
      await screen.findByText("ยอดขายทุก 1 ชั่วโมง · 17 ต.ค. 2568"),
    ).toBeVisible();
  });

  it("refuses a future day and keeps the last good one", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);
    await screen.findByText("฿70,000");

    fireEvent.click(screen.getByRole("radio", { name: "กำหนดเอง" }));
    await screen.findByLabelText("เลือกวันที่");
    const calls = apiFetch.mock.calls.length;

    fireEvent.change(screen.getByLabelText("เลือกวันที่"), {
      target: { value: "01/01/3542" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "เลือกวันที่ในอนาคตไม่ได้",
    );
    // Nothing was fetched for the invalid day.
    expect(apiFetch.mock.calls.length).toBe(calls);
  });

  it("compares this month with last month when chosen", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);
    fireEvent.click(screen.getByRole("radio", { name: "เดือนนี้" }));

    await screen.findByText("฿70,000");
    expect(
      screen.getAllByText("เทียบกับวันเดียวกันของเดือนที่แล้ว").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("ยอดรวมรายเดือน · 6 เดือนล่าสุด")).toBeVisible();

    const { current, previous } = overviewPeriods("month");
    const paths = apiFetch.mock.calls.map(([path]) => path);
    expect(paths).toContain(
      `/api/orders/executive/metrics?from=${current.from}&to=${current.to}&timezone=Asia%2FBangkok`,
    );
    expect(paths).toContain(
      `/api/orders/executive/metrics?from=${previous.from}&to=${previous.to}&timezone=Asia%2FBangkok`,
    );
  });

  it("shows the amount gained, not a percentage, when the comparison period had no sales", async () => {
    const { previous } = overviewPeriods("month");
    mockProviders({
      "/api/orders/executive/metrics?": (path) =>
        Promise.resolve({
          data: path.includes(`from=${previous.from}`)
            ? {
                gmv: 0,
                gmvPurchase: 0,
                gmvAuction: 0,
                platformRevenue: 0,
                completedOrders: 0,
              }
            : {
                gmv: 450,
                gmvPurchase: 300,
                gmvAuction: 150,
                platformRevenue: 13.5,
                completedOrders: 1,
              },
          meta: META,
        }),
    });

    render(<ExecutiveDashboardPage />);
    fireEvent.click(screen.getByRole("radio", { name: "เดือนนี้" }));

    expect(await screen.findByText("+฿300")).toBeInTheDocument();
    expect(screen.getByText("+฿150")).toBeInTheDocument();
    expect(screen.getByText("+฿13.5")).toBeInTheDocument();
    expect(
      screen.getAllByText("วันเดียวกันของเดือนที่แล้วไม่มียอด").length,
    ).toBe(3);
    // The sales and revenue cards show amounts; only users has a real percent.
    expect(
      screen
        .getAllByTestId("delta")
        .filter((el) => el.textContent.includes("%")).length,
    ).toBe(1);
  });

  it("adds the daily users up and says what the figure counts", async () => {
    const { current, previous } = overviewPeriods("month");
    mockProviders({
      "/api/auth/executive/metrics-series": () =>
        Promise.resolve({
          data: [
            { period: "2026-09-30T17:00:00.000Z", activeUsers: 3 },
            { period: "2026-10-01T17:00:00.000Z", activeUsers: 4 },
          ],
          meta: META,
        }),
    });

    render(<ExecutiveDashboardPage />);
    fireEvent.click(screen.getByRole("radio", { name: "เดือนนี้" }));
    await screen.findByText("฿70,000");

    // 3 people one day and 4 the next read as 7: usage, not a headcount.
    const card = screen.getByText("ผู้ใช้งานเว็บ (เดือนนี้)").closest("div");
    expect(within(card).getByText("7")).toBeInTheDocument();
    expect(
      within(card).queryByText(/รวมรายวัน คนที่กลับมาซ้ำนับทุกวัน/),
    ).toBeNull();
    expect(screen.queryByText("ผู้ใช้งานที่ล็อกอิน")).toBeNull();

    const paths = apiFetch.mock.calls.map(([path]) => path);
    for (const range of [current, previous]) {
      expect(paths).toContain(
        `/api/auth/executive/metrics-series?from=${range.from}&to=${range.to}&granularity=day&timezone=Asia%2FBangkok`,
      );
    }
  });

  it("counts web usage the same way for the year, by day", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);
    await screen.findByText("฿70,000");

    fireEvent.click(screen.getByRole("radio", { name: "ปีนี้" }));

    expect(await screen.findByText("ผู้ใช้งานเว็บ (ปีนี้)")).toBeVisible();
    const { current } = overviewPeriods("year");
    expect(apiFetch.mock.calls.map(([path]) => path)).toContain(
      `/api/auth/executive/metrics-series?from=${current.from}&to=${current.to}&granularity=month&timezone=Asia%2FBangkok`,
    );
  });

  it("exposes the trend series to screen readers, since the tooltip is pointer-only", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);

    const chart = await screen.findByRole("img", {
      name: /แนวโน้มยอดขาย/,
    });
    expect(chart).toHaveAccessibleName(/฿11,111/);
    expect(chart).toHaveAccessibleName(/รายได้แพลตฟอร์ม ฿333/);
  });

  it("switches the whole overview to this year and to the last 7 days", async () => {
    mockProviders();

    render(<ExecutiveDashboardPage />);
    await screen.findByText("฿70,000");

    fireEvent.click(screen.getByRole("radio", { name: "ปีนี้" }));

    expect(
      await screen.findByText("ยอดรวมรายปี · เฉพาะปีที่มีข้อมูล"),
    ).toBeVisible();
    expect(
      screen.getAllByText("เทียบกับวันเดือนเดียวกันของปีที่แล้ว").length,
    ).toBeGreaterThan(0);
    const year = overviewPeriods("year");
    const yearPaths = apiFetch.mock.calls.map(([path]) => path);
    expect(yearPaths).toContain(
      `/api/orders/executive/metrics-series?from=${year.trend.from}&to=${year.trend.to}&granularity=month&timezone=Asia%2FBangkok`,
    );

    fireEvent.click(screen.getByRole("radio", { name: "7 วันล่าสุด" }));

    expect(await screen.findByText("ยอดรายวัน · 7 วันล่าสุด")).toBeVisible();
    expect(
      screen.getAllByText("เทียบกับ 7 วันก่อนหน้านี้").length,
    ).toBeGreaterThan(0);
    const week = overviewPeriods("week");
    await waitFor(() =>
      expect(apiFetch.mock.calls.map(([path]) => path)).toContain(
        `/api/orders/executive/metrics-series?from=${week.trend.from}&to=${week.trend.to}&granularity=day&timezone=Asia%2FBangkok`,
      ),
    );
  });

  it("shows an unavailable state for a provider that fails, without masking it as zero", async () => {
    mockProviders({
      "/api/auth/executive/metrics": () =>
        Promise.reject(new Error("auth-service unreachable")),
    });

    render(<ExecutiveDashboardPage />);

    expect(await screen.findByText("฿70,000")).toBeInTheDocument();
    expect(screen.getAllByText("ไม่พร้อมใช้งาน").length).toBeGreaterThan(0);
    // The failed provider's card says unavailable instead of showing a 0
    // (the chart's own scale starts at 0, so look at the card only).
    const card = screen.getByText(/ผู้ใช้งานเว็บ/).closest("div");
    expect(within(card).getByText("ไม่พร้อมใช้งาน")).toBeInTheDocument();
    expect(within(card).queryByText("0")).not.toBeInTheDocument();
  });

  it("marks only the trend unavailable when its series request fails", async () => {
    mockProviders({
      "/api/orders/executive/metrics-series": () =>
        Promise.reject(new Error("order-service unreachable")),
    });

    render(<ExecutiveDashboardPage />);

    expect(await screen.findByText("฿70,000")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /แนวโน้มยอดขาย/ })).toBeNull();
    expect(screen.getAllByText("ไม่พร้อมใช้งาน").length).toBeGreaterThan(0);
  });
});
