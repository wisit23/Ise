import { render, screen } from "@testing-library/react";
import HorizontalTrendChart from "./HorizontalTrendChart";

describe("HorizontalTrendChart", () => {
  const mockData = [
    {
      label: "ม.ค.",
      shortLabel: "ม.ค.",
      fullLabel: "มกราคม 2569",
      value: 100000,
      unavailable: false,
    },
    {
      label: "ก.พ.",
      shortLabel: "ก.พ.",
      fullLabel: "กุมภาพันธ์ 2569",
      value: 80000,
      unavailable: false,
    },
    {
      label: "มี.ค.",
      shortLabel: "มี.ค.",
      fullLabel: "มีนาคม 2569",
      value: 0,
      unavailable: true,
    },
  ];

  it("renders with accessible role and aria-label", () => {
    render(
      <HorizontalTrendChart
        data={mockData}
        label="แนวโน้มยอดขายรวม (GMV)"
      />,
    );

    const chart = screen.getByRole("img", {
      name: /แนวโน้มยอดขายรวม \(GMV\)/,
    });
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAccessibleName(/฿100,000/);
    expect(chart).toHaveAccessibleName(/฿80,000/);
  });

  it("renders month labels and in-bar values directly without hover", () => {
    render(
      <HorizontalTrendChart
        data={mockData}
        label="แนวโน้มยอดขายรวม (GMV)"
      />,
    );

    expect(screen.getByText("ม.ค.")).toBeInTheDocument();
    expect(screen.getByText("ก.พ.")).toBeInTheDocument();
    expect(screen.getByText("มี.ค.")).toBeInTheDocument();
    expect(screen.getByText("฿100,000")).toBeInTheDocument();
    expect(screen.getByText("฿80,000")).toBeInTheDocument();
    expect(screen.getByText("ไม่พร้อมใช้งาน")).toBeInTheDocument();
  });
});
