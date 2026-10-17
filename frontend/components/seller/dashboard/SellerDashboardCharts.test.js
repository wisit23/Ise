import { render, screen } from "@testing-library/react";
import SellerDashboardCharts from "./SellerDashboardCharts";

describe("SellerDashboardCharts", () => {
  const mockStats = {
    totalRevenue: 5000,
    regularRevenue: 3000,
    regularGrossRevenue: 3092,
    regularCompletedCount: 2,
    auctionRevenue: 2000,
    auctionGrossRevenue: 2061,
    auctionCompletedCount: 1,
    activeCount: 5,
    soldCount: 3,
    trend: [
      { label: "1/10", value: 1000 },
      { label: "2/10", value: 4000 },
    ],
  };

  const mockOrders = [
    {
      id: "ord-1",
      productTitle: "เสื้อยืดวินเทจ",
      price: 1500,
      finalPrice: 1500,
      status: "completed",
      createdAt: "2026-10-15T10:00:00.000Z",
      orderType: "NORMAL",
      productId: "prod-1",
    },
    {
      id: "ord-2",
      productTitle: "นาฬิกาสะสม",
      price: 3500,
      finalPrice: 3500,
      status: "completed",
      createdAt: "2026-10-15T12:00:00.000Z",
      orderType: "AUCTION",
      auctionId: "auc-1",
      productId: "prod-2",
    },
  ];

  const mockProducts = [
    { id: "prod-1", category: "เสื้อผ้า", status: "sold" },
    { id: "prod-2", category: "ของสะสม", status: "sold" },
  ];

  it("renders all 3 charts in the overview section directly below KPI cards", () => {
    render(
      <SellerDashboardCharts
        stats={mockStats}
        orders={mockOrders}
        products={mockProducts}
        orderCount={2}
      />,
    );

    // KPI cards
    expect(screen.getByText("ยอดขายสำเร็จทั้งหมด")).toBeInTheDocument();
    expect(screen.getByText("฿5,153")).toBeInTheDocument();
    expect(screen.getByText("คำสั่งซื้อทั้งหมด")).toBeInTheDocument();
    expect(screen.getByText("สินค้าพร้อมขาย")).toBeInTheDocument();
    expect(screen.getByText("ขายแล้ว (ชิ้น)")).toBeInTheDocument();

    // All 3 charts visible together
    expect(screen.getByText("ยอดขายสุทธิ (12 เดือน)")).toBeInTheDocument();
    expect(screen.getByText("รายรับสะสมตลอดปี")).toBeInTheDocument();
    expect(screen.getByText("หมวดสินค้าที่ขายดี")).toBeInTheDocument();

    // Sales breakdown
    expect(screen.getByText("ยอดขายทั่วไป (ขายปกติ)")).toBeInTheDocument();
    expect(screen.getByText("ยอดขายระบบประมูล")).toBeInTheDocument();
  });

  it("toggles to 7-day daily trend bar chart", () => {
    const { fireEvent } = require("@testing-library/react");
    render(
      <SellerDashboardCharts
        stats={mockStats}
        orders={mockOrders}
        products={mockProducts}
        orderCount={2}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "รายวัน" }));
    expect(screen.getByText("ยอดขายสุทธิ (7 วัน)")).toBeInTheDocument();
    expect(screen.getByText(/ยอดรวม 7 วัน:/)).toBeInTheDocument();
  });

  it("allows selecting custom date range independently for Chart 1 without affecting others", () => {
    const { fireEvent } = require("@testing-library/react");
    render(
      <SellerDashboardCharts
        stats={mockStats}
        orders={mockOrders}
        products={mockProducts}
        orderCount={2}
      />,
    );

    // Chart 1 and Chart 3 have "เลือกวัน" buttons (2 charts have custom date selection)
    const customButtons = screen.getAllByRole("button", { name: /เลือกวัน/ });
    expect(customButtons.length).toBe(2);

    // Click Chart 1's "เลือกวัน"
    fireEvent.click(customButtons[0]);

    // Check custom toolbar appears for Chart 1 with presets
    expect(screen.getAllByRole("button", { name: "เลือกวันเดียว" }).length).toBe(1);

    // Chart 2 and Chart 3 remain unchanged
    expect(screen.getByText("รายรับสะสมตลอดปี")).toBeInTheDocument();
    expect(screen.getByText("หมวดสินค้าที่ขายดี")).toBeInTheDocument();
  });

  it("keeps Chart 2 in yearly view and shows month and monthly revenue when clicking a point on the line chart", () => {
    const { fireEvent } = require("@testing-library/react");
    const { container } = render(
      <SellerDashboardCharts
        stats={mockStats}
        orders={mockOrders}
        products={mockProducts}
        orderCount={2}
      />,
    );

    // Chart 2 displays original yearly cumulative line
    expect(screen.getByText("รายรับสะสมตลอดปี")).toBeInTheDocument();
    expect(screen.getByText(/สะสมสุทธิล่าสุด: ฿5,000/)).toBeInTheDocument();

    // Bottom text shows the month and revenue earned from that month (e.g. ตุลาคม: ฿4,850)
    expect(screen.getByText("ตุลาคม:")).toBeInTheDocument();
    expect(screen.getAllByText("฿4,850").length).toBeGreaterThanOrEqual(1);

    // Clicking another point on the line chart updates to that month (e.g. มกราคม: ฿0)
    const hitTargets = container.querySelectorAll("circle[r='12']");
    expect(hitTargets.length).toBeGreaterThan(0);
    // Click on January (index 0)
    fireEvent.click(hitTargets[0]);
    expect(screen.getByText("มกราคม:")).toBeInTheDocument();
  });

  it("displays month and net revenue below bar chart and updates on click, matching line chart format", () => {
    const { fireEvent } = require("@testing-library/react");
    const { container } = render(
      <SellerDashboardCharts
        stats={mockStats}
        orders={mockOrders}
        products={mockProducts}
        orderCount={2}
      />,
    );

    // Initial default in bar chart shows the latest month (ธันวาคม)
    expect(screen.getByText("ธันวาคม:")).toBeInTheDocument();

    // Click on October (index 9 in monthly revenue)
    const barHitTargets = container.querySelectorAll("rect[fill='transparent']");
    expect(barHitTargets.length).toBeGreaterThanOrEqual(12);
    fireEvent.click(barHitTargets[9]);

    // Bottom text updates to October in bar chart (now both bar chart and line chart show ตุลาคม:)
    expect(screen.getAllByText("ตุลาคม:").length).toBe(2);
    expect(screen.getAllByText("฿4,850").length).toBeGreaterThanOrEqual(1);
  });

  it("allows independent date selection for Chart 3 (Product Category Donut)", () => {
    const { fireEvent } = require("@testing-library/react");
    render(
      <SellerDashboardCharts
        stats={mockStats}
        orders={mockOrders}
        products={mockProducts}
        orderCount={2}
      />,
    );

    // Click "เดือนนี้" on Chart 3
    fireEvent.click(screen.getByRole("button", { name: "เดือนนี้" }));
    expect(screen.getByText("หมวดสินค้าที่ขายดี (เดือนนี้)")).toBeInTheDocument();

    // Chart 1 and Chart 2 remain in default state
    expect(screen.getByText("ยอดขายสุทธิ (12 เดือน)")).toBeInTheDocument();
    expect(screen.getByText("รายรับสะสมตลอดปี")).toBeInTheDocument();

    // Click Chart 3's "เลือกวัน" (index 1 out of 2)
    const customButtons = screen.getAllByRole("button", { name: /เลือกวัน/ });
    fireEvent.click(customButtons[1]);
    expect(screen.getByText(/หมวดสินค้าที่ขายดี/)).toBeInTheDocument();
  });
});
