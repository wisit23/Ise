import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CustomerInsightsSection from "./CustomerInsightsSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

const dimensions = {
  categories: ["รองเท้า"],
  brands: ["Nike"],
  styles: ["Running"],
  sizes: ["42"],
  sizesByCategory: { รองเท้า: ["42"] },
};

const insightResponse = {
  filters: {
    viewBy: "category",
    signal: "all",
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-18T00:00:00.000Z",
  },
  updatedAt: "2026-10-18T08:00:00.000Z",
  totalCustomers: 100,
  interestedCustomers: 40,
  interestedCustomersChangePercent: 25,
  topCategory: { value: "รองเท้า", changePercent: 25 },
  topBrand: { value: "Nike", changePercent: 10 },
  topStyle: { value: "Running", changePercent: -5 },
  ranking: [
    { value: "รองเท้า", interestedCustomers: 40, averageScore: 18, maximumObserved: 30, changePercent: 25 },
  ],
  categoryRanking: [
    { value: "รองเท้า", interestedCustomers: 40, averageScore: 18, maximumObserved: 30, changePercent: 25 },
  ],
  brandRanking: [
    { value: "Nike", interestedCustomers: 30, averageScore: 15, maximumObserved: 28, changePercent: 10 },
  ],
  rankings: {
    category: [
      { value: "รองเท้า", interestedCustomers: 40, averageScore: 18, maximumObserved: 30, changePercent: 25 },
    ],
    brand: [
      { value: "Nike", interestedCustomers: 30, averageScore: 15, maximumObserved: 28, changePercent: 10 },
    ],
    style: [
      { value: "Running", interestedCustomers: 20, averageScore: 12, maximumObserved: 20, changePercent: 5 },
    ],
  },
  selected: {
    criteria: { category: "รองเท้า" },
    interestedCustomers: 40,
    minimumObserved: 1,
    maximumObserved: 30,
    averageScore: 18,
    medianScore: 17,
    maximumPossible: 32,
    globalMaximum: 33,
    distribution: [
      { key: "none", label: "ไม่มีสัญญาณ", min: 0, max: 0, count: 60 },
      { key: "emerging", label: "เริ่มสนใจ", min: 1, max: 6, count: 10 },
      { key: "moderate", label: "สนใจปานกลาง", min: 7, max: 14, count: 15 },
      { key: "high", label: "สนใจสูง", min: 15, max: 24, count: 10 },
      { key: "very_high", label: "สนใจสูงมาก", min: 25, max: 33, count: 5 },
    ],
  },
  behaviorSummary: { search: 8, like: 5, purchase: 2 },
  trend: [{ date: "2026-10-18", interestedCustomers: 12 }],
  dimensions,
};

describe("CustomerInsightsSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/audience/options")) {
        return Promise.resolve({ dimensions, globalMaximum: 33 });
      }
      return Promise.resolve(insightResponse);
    });
  });

  test("renders scoped KPIs, ranking, trend, and agreed score bands", async () => {
    render(<CustomerInsightsSection token="token" />);

    expect((await screen.findAllByText("40 คน")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("รองเท้า").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nike").length).toBeGreaterThan(0);
    expect(screen.getByText("อันดับหมวดหมู่")).toBeInTheDocument();
    expect(screen.getByText("อันดับแบรนด์")).toBeInTheDocument();
    expect(screen.getByText("อันดับสไตล์")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "มุมมองกราฟหลัก" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("ตัวกรองเจาะลึก")).toBeInTheDocument();
    expect(screen.getByText("ยังไม่ได้เลือก")).toBeInTheDocument();
    expect(screen.getByLabelText("หมวดหมู่")).toBeVisible();
    expect(screen.getByLabelText("แบรนด์")).toBeVisible();
    expect(screen.getByLabelText("สไตล์")).toBeVisible();
    expect(screen.getByText(/30 คน/)).toBeInTheDocument();
    expect(screen.getByText("15–24")).toBeInTheDocument();
    expect(screen.getByText("25–33")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ไซซ์" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ไซซ์")).not.toBeInTheDocument();
    expect(screen.getByText("ขอบเขตกราฟ:")).toBeInTheDocument();
    expect(screen.getByText("หมวดหมู่: ทุกหมวดหมู่")).toBeInTheDocument();
    expect(screen.getByText("8 บัญชี")).toBeInTheDocument();
    expect(screen.getByText("5 บัญชี")).toBeInTheDocument();
    expect(screen.getByText("2 บัญชี")).toBeInTheDocument();
    expect(screen.getByText(/ไม่รวมค่าความชอบปัจจุบันจากโปรไฟล์/)).toBeInTheDocument();
    expect(screen.getAllByText("ทุกแหล่งสัญญาณ").length).toBeGreaterThan(1);
    expect(
      screen.getAllByText(/เพิ่ม 25% จากช่วงก่อนหน้า/).length,
    ).toBeGreaterThan(0);
  });

  test("explains that profile-only data has no daily trend", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/audience/options")) {
        return Promise.resolve({ dimensions, globalMaximum: 33 });
      }
      return Promise.resolve({
        ...insightResponse,
        filters: { ...insightResponse.filters, signal: "profile" },
        behaviorSummary: { search: 0, like: 0, purchase: 0 },
        trend: [],
      });
    });

    render(<CustomerInsightsSection token="token" />);

    expect(
      await screen.findByText(/ข้อมูลโปรไฟล์เป็นค่าความชอบปัจจุบัน จึงไม่มีแนวโน้มย้อนหลังรายวัน/),
    ).toBeInTheDocument();
  });

  test("shows an explanation instead of a flat zero line when no behavior occurred", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/audience/options")) {
        return Promise.resolve({ dimensions, globalMaximum: 33 });
      }
      return Promise.resolve({
        ...insightResponse,
        behaviorSummary: { search: 0, like: 0, purchase: 0 },
        trend: insightResponse.trend.map((point) => ({
          ...point,
          interestedCustomers: 0,
        })),
      });
    });

    render(<CustomerInsightsSection token="token" />);

    expect(
      await screen.findByText(/ยังไม่มีพฤติกรรมการค้นหา กดใจ หรือซื้อจริงในช่วงเวลาที่เลือก/),
    ).toBeInTheDocument();
  });

  test("keeps all three rankings visible when a category filter is applied", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/audience/options")) {
        return Promise.resolve({ dimensions, globalMaximum: 33 });
      }
      if (url.includes("category=")) {
        return Promise.resolve({
          ...insightResponse,
          filters: { ...insightResponse.filters, category: "รองเท้า" },
        });
      }
      return Promise.resolve(insightResponse);
    });

    render(<CustomerInsightsSection token="token" />);
    await screen.findByText("อันดับหมวดหมู่");
    fireEvent.change(screen.getByLabelText("หมวดหมู่"), {
      target: { value: "รองเท้า" },
    });
    fireEvent.click(screen.getByRole("button", { name: "แสดงผล" }));

    expect(await screen.findByText("อันดับสไตล์")).toBeInTheDocument();
    expect(screen.getByText("อันดับหมวดหมู่")).toBeInTheDocument();
    expect(screen.getByText("อันดับแบรนด์")).toBeInTheDocument();
    expect(screen.getByText("ต้องตรงครบทุกเงื่อนไข (AND):")).toBeInTheDocument();
    expect(screen.getByText("ลูกค้าที่สนใจครบทุกเงื่อนไข")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ล้างตัวกรองหมวดหมู่ รองเท้า" })).toBeInTheDocument();
  });

  test("passes the selected criteria and dashboard date range to campaign creation", async () => {
    const onCreateCampaign = jest.fn();
    render(
      <CustomerInsightsSection
        token="token"
        onCreateCampaign={onCreateCampaign}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "สร้างแคมเปญสำหรับกลุ่มนี้" }));
    await waitFor(() => {
      expect(onCreateCampaign).toHaveBeenCalledWith({
        category: "รองเท้า",
        from: insightResponse.filters.from,
        to: insightResponse.filters.to,
      });
    });
  });
});
