import { fireEvent, render, screen } from "@testing-library/react";
import TrendLineChart, {
  formatAxisTick,
  getLinePath,
  niceAxis,
} from "./TrendLineChart";

describe("TrendLineChart", () => {
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
      value: 70000,
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
    render(<TrendLineChart data={mockData} label="แนวโน้มยอดขายรวม (GMV)" />);

    const chart = screen.getByRole("img", {
      name: /แนวโน้มยอดขายรวม \(GMV\)/,
    });
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAccessibleName(/฿100,000/);
    expect(chart).toHaveAccessibleName(/฿70,000/);
  });

  it("labels four lines on the left, and shows a value only when pointed at", () => {
    render(<TrendLineChart data={mockData} label="แนวโน้มยอดขายรวม (GMV)" />);

    expect(screen.getByText("ม.ค.")).toBeInTheDocument();
    expect(screen.getByText("ก.พ.")).toBeInTheDocument();
    expect(screen.getByText("มี.ค.")).toBeInTheDocument();

    // Biggest value 100,000 plus a little room: 0, 40,000, 80,000, 120,000.
    const axis = [...document.querySelectorAll("[data-axis-label]")].map(
      (el) => el.textContent,
    );
    expect(axis).toEqual(["0", "40,000", "80,000", "120,000"]);

    // No value sits above the points until one is pointed at...
    expect(screen.queryByText("฿70,000")).toBeNull();
    // ...except an unavailable one, which always says so.
    expect(screen.getByText("ไม่พร้อมใช้งาน")).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("ก.พ.").closest("g"));
    expect(screen.getByText("฿70,000")).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByText("ก.พ.").closest("g"));
    expect(screen.queryByText("฿70,000")).toBeNull();
  });

  it("writes big amounts on the axis in millions so they fit", () => {
    expect(formatAxisTick(0)).toBe("0");
    expect(formatAxisTick(999999)).toBe("999,999");
    expect(formatAxisTick(1_200_000)).toBe("1.2 ล้าน");
    expect(formatAxisTick(3_000_000)).toBe("3 ล้าน");
    expect(formatAxisTick(120_000_000)).toBe("120 ล้าน");
    expect(formatAxisTick(1_250_000)).toBe("1.25 ล้าน");
  });

  it("labels a chart of millions with short axis text", () => {
    const data = [4_100_000, 6_900_000].map((value, i) => ({
      label: `m${i}`,
      value,
    }));
    render(<TrendLineChart data={data} label="รายปี" />);

    const axis = [...document.querySelectorAll("[data-axis-label]")].map(
      (el) => el.textContent,
    );
    // 6.9 million plus room needs steps of about 2.5 million: 3.
    expect(axis).toEqual(["0", "3 ล้าน", "6 ล้าน", "9 ล้าน"]);
  });

  it("puts the top line a little above the biggest value, not far above", () => {
    // 1,678 plus 10% needs steps of about 615: 800, so 0 / 800 / 1,600 / 2,400
    // rather than 0 / 1,000 / 2,000 / 3,000.
    expect(niceAxis(1678).ticks).toEqual([0, 800, 1600, 2400]);
    expect(niceAxis(450).ticks).toEqual([0, 200, 400, 600]);
    expect(niceAxis(100000).ticks).toEqual([0, 40000, 80000, 120000]);
    expect(niceAxis(1).ticks).toEqual([0, 1, 2, 3]);
  });

  it("always clears the biggest value, and never by much", () => {
    for (const max of [3, 7, 99, 450, 1678, 2128, 9999, 99999, 1234567]) {
      const top = niceAxis(max).ticks.at(-1);
      expect(top).toBeGreaterThanOrEqual(max * 1.1);
      // Never wastes more than a third of the chart above the data.
      expect(top).toBeLessThanOrEqual(max * 1.6);
    }
    // Nothing sold: the lines still make a scale, not zero everywhere.
    expect(niceAxis(0).ticks.at(-1)).toBeGreaterThan(0);
  });

  it("joins the points with straight segments, flat across equal values", () => {
    const path = getLinePath([
      { x: 0, y: 100 },
      { x: 10, y: 100 },
      { x: 20, y: 100 },
      { x: 30, y: 20 },
    ]);

    // No curves: every segment is a straight line, so a run of zeros sits
    // exactly on the baseline and the rise is a sharp angle.
    expect(path).toBe("M 0.0 100.0 L 10.0 100.0 L 20.0 100.0 L 30.0 20.0");
    expect(path).not.toMatch(/C/);
  });

  it("draws every point it is given instead of truncating to six", () => {
    const week = [8, 9, 10, 11, 12, 13, 14].map((d) => ({
      label: String(d),
      value: d * 100,
    }));
    render(<TrendLineChart data={week} label="7 วัน" />);

    for (const d of [8, 9, 10, 11, 12, 13, 14]) {
      expect(screen.getByText(String(d))).toBeInTheDocument();
    }
  });

  it("centres a lone point instead of pinning it to the left edge", () => {
    const { container } = render(
      <TrendLineChart data={[{ label: "2569", value: 450 }]} label="ปี" />,
    );

    const dot = container.querySelector("circle");
    expect(Number(dot.getAttribute("cx"))).toBe(260);
  });

  describe("with details", () => {
    const detailed = [
      {
        label: "ก.ย.",
        fullLabel: "กันยายน 2569 · ทั้งเดือน",
        value: 1000,
        detail: "ยอดขาย ฿1,000 · รายได้แพลตฟอร์ม ฿30",
      },
      {
        label: "ต.ค.",
        subLabel: "(ถึง 14)",
        fullLabel: "ตุลาคม 2569 · ถึงวันที่ 14 ต.ค.",
        value: 600,
        detail: "ยอดขาย ฿600 · รายได้แพลตฟอร์ม ฿18",
      },
    ];

    it("names a period still in progress under its label", () => {
      render(<TrendLineChart data={detailed} label="แนวโน้มยอดขาย" />);
      expect(screen.getByText("(ถึง 14)")).toBeInTheDocument();
    });

    it("shows both figures for the hovered point and a hint otherwise", () => {
      render(<TrendLineChart data={detailed} label="แนวโน้มยอดขาย" />);
      expect(
        screen.getByText("ชี้ที่จุดเพื่อดูยอดขายและรายได้แพลตฟอร์ม"),
      ).toBeInTheDocument();

      const point = screen.getByText("ต.ค.").closest("g");
      fireEvent.mouseEnter(point);
      expect(
        screen.getByText("ตุลาคม 2569 · ถึงวันที่ 14 ต.ค."),
      ).toBeInTheDocument();
      expect(
        screen.getByText("ยอดขาย ฿600 · รายได้แพลตฟอร์ม ฿18"),
      ).toBeInTheDocument();

      fireEvent.mouseLeave(point);
      expect(
        screen.getByText("ชี้ที่จุดเพื่อดูยอดขายและรายได้แพลตฟอร์ม"),
      ).toBeInTheDocument();
    });

    it("includes the details in the accessible summary", () => {
      render(<TrendLineChart data={detailed} label="แนวโน้มยอดขาย" />);
      expect(screen.getByRole("img")).toHaveAccessibleName(
        /รายได้แพลตฟอร์ม ฿18/,
      );
    });
  });
});
