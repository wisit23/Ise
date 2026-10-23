import { fireEvent, render, screen } from "@testing-library/react";
import TrendLineChart from "./TrendLineChart";

describe("TrendLineChart", () => {
  test("renders visible data points and reveals the exact value on interaction", () => {
    render(
      <TrendLineChart
        data={[
          { label: "10-12", value: 1250 },
          { label: "10-13", value: 2500 },
        ]}
        formatValue={(value) => `฿${value.toLocaleString("th-TH")}`}
      />,
    );

    expect(
      screen.getByText("แตะหรือวางเมาส์บนจุดเพื่อดูค่า"),
    ).toBeInTheDocument();
    const point = screen.getByRole("button", { name: "10-13: ฿2,500" });
    fireEvent.focus(point);

    expect(screen.getAllByText("10-13").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/฿2,500/)).toBeInTheDocument();
  });
});
