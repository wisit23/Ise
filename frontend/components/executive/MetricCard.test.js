import { render, screen } from "@testing-library/react";
import MetricCard from "./MetricCard";

const LABEL = "เทียบกับวันเดียวกันของเดือนที่แล้ว";

function renderCard(props) {
  return render(
    <MetricCard
      label="ยอดขายรวม (GMV)"
      value={450}
      deltaLabel={LABEL}
      baselineName="วันเดียวกันของเดือนที่แล้ว"
      {...props}
    />,
  );
}

describe("MetricCard comparison line", () => {
  it("shows growth in green with the comparison it is measured against", () => {
    renderCard({ deltaPct: 12 });

    const delta = screen.getByTestId("delta");
    expect(delta).toHaveTextContent("▲+12%");
    expect(delta).toHaveClass("text-[#006300]");
    expect(screen.getByText(LABEL)).toBeInTheDocument();
  });

  it("shows a drop in red", () => {
    renderCard({ deltaPct: -8 });

    const delta = screen.getByTestId("delta");
    expect(delta).toHaveTextContent("▼-8%");
    expect(delta).toHaveClass("text-red-600");
  });

  it("shows no change in neutral grey, neither green nor red", () => {
    renderCard({ deltaPct: 0 });

    const delta = screen.getByTestId("delta");
    expect(delta).toHaveTextContent("0%");
    expect(delta).not.toHaveClass("text-red-600");
    expect(delta).not.toHaveClass("text-[#006300]");
  });

  it("shows the amount gained, in green, when the baseline was zero", () => {
    renderCard({
      deltaPct: null,
      noBaseline: true,
      formatValue: (v) => `฿${v}`,
    });

    const delta = screen.getByTestId("delta");
    expect(delta).toHaveTextContent("▲+฿450");
    expect(delta).toHaveClass("text-[#006300]");
    expect(delta).not.toHaveTextContent("%");
    expect(
      screen.getByText("วันเดียวกันของเดือนที่แล้วไม่มียอด"),
    ).toBeInTheDocument();
  });

  it("says so, without a figure, when neither period had anything", () => {
    renderCard({ value: 0, deltaPct: null, noBaseline: true });

    expect(screen.queryByTestId("delta")).toBeNull();
    expect(screen.getByText("ไม่มียอดทั้งสองช่วง")).toBeInTheDocument();
  });

  it("stays silent when the comparison period could not be loaded", () => {
    renderCard({ deltaPct: null, noBaseline: false });

    expect(screen.queryByTestId("delta")).toBeNull();
    expect(screen.queryByText(/ไม่มียอด/)).toBeNull();
  });

  it("shows unavailable instead of a value or comparison", () => {
    renderCard({ unavailable: true, deltaPct: 12 });

    expect(screen.getByText("ไม่พร้อมใช้งาน")).toBeInTheDocument();
    expect(screen.queryByTestId("delta")).toBeNull();
    expect(screen.queryByText("฿450")).toBeNull();
  });

  it("explains what a figure counts with a short hint under the label", () => {
    renderCard({
      hint: "รวมรายวัน · คนที่กลับมาซ้ำนับทุกวัน",
      deltaPct: 12,
    });

    expect(
      screen.getByText("รวมรายวัน · คนที่กลับมาซ้ำนับทุกวัน"),
    ).toBeInTheDocument();
  });

  it("shows no hint line when none is given", () => {
    const { container } = renderCard({ deltaPct: 12 });

    expect(container.querySelectorAll("p")).toHaveLength(3);
  });
});
