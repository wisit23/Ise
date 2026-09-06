import { render, screen } from "@testing-library/react";
import DualTrendChart from "./DualTrendChart";

describe("DualTrendChart (Horizontal In-Bar)", () => {
  const mockData = [
    {
      label: "ม.ค.",
      fullLabel: "มกราคม 2569",
      gmv: 100000,
      platformRevenue: 10000,
      unavailable: false,
    },
    {
      label: "ก.พ.",
      fullLabel: "กุมภาพันธ์ 2569",
      gmv: 80000,
      platformRevenue: 8000,
      unavailable: false,
    },
    {
      label: "มี.ค.",
      fullLabel: "มีนาคม 2569",
      gmv: 0,
      platformRevenue: 0,
      unavailable: true,
    },
  ];

  it("renders with accessible role and aria-label", () => {
    render(<DualTrendChart data={mockData} />);

    const chart = screen.getByRole("img", {
      name: /แนวโน้มยอดขายรวม \(GMV\) และรายได้แพลตฟอร์ม/,
    });
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAccessibleName(/฿100,000/);
    expect(chart).toHaveAccessibleName(/฿10,000/);
  });

  it("shows legend and month labels", () => {
    render(<DualTrendChart data={mockData} />);

    expect(screen.getByText("ยอดขายรวม (GMV)")).toBeInTheDocument();
    expect(screen.getByText("รายได้แพลตฟอร์ม")).toBeInTheDocument();
    expect(screen.getByText("มกราคม 2569")).toBeInTheDocument();
    expect(screen.getByText("กุมภาพันธ์ 2569")).toBeInTheDocument();
    expect(screen.getByText("มีนาคม 2569")).toBeInTheDocument();
  });

  it("renders data values directly inside horizontal bars without needing hover", () => {
    render(<DualTrendChart data={mockData} />);

    // Values are directly in the DOM
    expect(screen.getByText("฿100,000")).toBeInTheDocument();
    expect(screen.getByText("฿10,000")).toBeInTheDocument();
    expect(screen.getByText("฿80,000")).toBeInTheDocument();
    expect(screen.getByText("฿8,000")).toBeInTheDocument();
    expect(screen.getAllByText("ไม่พร้อมใช้งาน").length).toBeGreaterThan(0);
  });
});
