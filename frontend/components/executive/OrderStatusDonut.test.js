import { fireEvent, render, screen } from "@testing-library/react";
import OrderStatusDonut from "./OrderStatusDonut";

const COUNTS = {
  completed: 584,
  inProgress: 234,
  disputeRefund: 47,
  total: 865,
};

describe("OrderStatusDonut", () => {
  it("puts the total in the middle and lists every group with count and share", () => {
    render(<OrderStatusDonut counts={COUNTS} />);

    expect(screen.getByText("865", { selector: "text" })).toBeInTheDocument();
    expect(screen.getByText("คำสั่งซื้อ")).toBeInTheDocument();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("สำเร็จ58468%");
    expect(rows[1]).toHaveTextContent("กำลังดำเนินการ23427%");
    expect(rows[2]).toHaveTextContent("ข้อพิพาทและคืนเงิน475%");
  });

  it("spells the figures out for screen readers", () => {
    render(<OrderStatusDonut counts={COUNTS} />);

    expect(screen.getByRole("img")).toHaveAccessibleName(
      "คำสั่งซื้อที่ชำระเงินแล้ว 865 รายการ: สำเร็จ 584, กำลังดำเนินการ 234, ข้อพิพาทและคืนเงิน 47",
    );
  });

  it("draws one arc per group that has orders", () => {
    const { container } = render(
      <OrderStatusDonut
        counts={{ completed: 5, inProgress: 0, disputeRefund: 5, total: 10 }}
      />,
    );

    const arcs = [...container.querySelectorAll("[data-slice]")].map((el) =>
      el.getAttribute("data-slice"),
    );
    expect(arcs).toEqual(["completed", "disputeRefund"]);
    // A group with nothing is still listed, with a zero.
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent(
      "กำลังดำเนินการ00%",
    );
  });

  it("fades the other slices while one is hovered", () => {
    const { container } = render(<OrderStatusDonut counts={COUNTS} />);

    const row = screen.getAllByRole("listitem")[1];
    fireEvent.pointerEnter(row);
    const opacity = (key) =>
      container.querySelector(`[data-slice="${key}"]`).getAttribute("opacity");
    expect(opacity("inProgress")).toBe("1");
    expect(opacity("completed")).toBe("0.35");

    fireEvent.pointerLeave(row);
    expect(opacity("completed")).toBe("1");
  });

  it("draws an unbroken ring when a single group has every order", () => {
    const { container } = render(
      <OrderStatusDonut
        counts={{ completed: 4, inProgress: 0, disputeRefund: 0, total: 4 }}
      />,
    );

    const [dash] = container
      .querySelector("[data-slice=completed]")
      .getAttribute("stroke-dasharray")
      .split(" ")
      .map(Number);
    expect(dash).toBeCloseTo(2 * Math.PI * ((180 - 26) / 2), 5);
  });

  it("says so when no paid orders fall in the period", () => {
    render(
      <OrderStatusDonut
        counts={{ completed: 0, inProgress: 0, disputeRefund: 0, total: 0 }}
      />,
    );

    expect(
      screen.getByText("ยังไม่มีคำสั่งซื้อที่ชำระเงินแล้วในช่วงนี้"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows unavailable, not an empty ring, when the service did not answer", () => {
    render(<OrderStatusDonut counts={null} />);

    expect(screen.getByText("ไม่พร้อมใช้งาน")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
