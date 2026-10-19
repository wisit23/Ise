import { render, screen } from "@testing-library/react";
import LineChart from "./LineChart";

test("spaces long date ranges across five x-axis labels without crowding the end", () => {
  const data = Array.from({ length: 31 }, (_, index) => ({
    x: `${index + 1} ต.ค.`,
    y: index % 2,
  }));

  render(
    <LineChart
      series={[{ label: "ผู้สนใจ", color: "#059669", data }]}
      formatValue={(value) => `${value} คน`}
    />,
  );

  expect(screen.getByText("1 ต.ค.")).toHaveAttribute("text-anchor", "start");
  expect(screen.getByText("31 ต.ค.")).toHaveAttribute("text-anchor", "end");
  expect(screen.queryByText("29 ต.ค.")).not.toBeInTheDocument();
  expect(screen.getAllByText(/ต.ค./)).toHaveLength(6);
});
