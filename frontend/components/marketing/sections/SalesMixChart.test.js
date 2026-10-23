import { render, screen } from "@testing-library/react";
import SalesMixChart from "./SalesMixChart";

test("shows all three sales sources and their share of total sales", () => {
  render(
    <SalesMixChart
      total={1000}
      byType={{
        standard: { sales: 500 },
        campaign: { sales: 300 },
        auction: { sales: 200 },
      }}
    />,
  );

  expect(screen.getByText("ยอดขายทั่วไป")).toBeInTheDocument();
  expect(screen.getByText("ยอดขายจากแคมเปญ")).toBeInTheDocument();
  expect(screen.getByText("ยอดขายจากประมูล")).toBeInTheDocument();
  expect(screen.getByText("50.0%")).toBeInTheDocument();
  expect(screen.getByText("30.0%")).toBeInTheDocument();
  expect(screen.getByText("20.0%")).toBeInTheDocument();
});
