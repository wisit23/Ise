import { fireEvent, render, screen } from "@testing-library/react";
import TotalCaseBars from "./TotalCaseBars";

test("shows combined counts; keyboard and click reveal the breakdown with fresh polled values", () => {
  const rows = [
    { label: "สูง", tickets: 3, disputes: 5 },
    { label: "ต่ำ", tickets: 0, disputes: 0 },
  ];
  const { rerender } = render(
    <TotalCaseBars rows={rows} label="ความสำคัญ ยอดรวม" />,
  );
  const high = screen.getByRole("button", {
    name: "สูง รวม 8 เคส ดูแยก Ticket และ Dispute",
  });
  expect(high).toHaveTextContent("8 เคส");
  expect(
    screen.getByRole("button", { name: /ต่ำ รวม 0 เคส/ }),
  ).toHaveTextContent("0 เคส");
  fireEvent.focus(high);
  expect(screen.getByRole("status")).toHaveTextContent("Ticket 3 · Dispute 5");
  fireEvent.click(high);
  fireEvent.blur(high);
  expect(screen.getByRole("status")).toHaveTextContent("Ticket 3 · Dispute 5");
  rerender(
    <TotalCaseBars
      rows={[{ label: "สูง", tickets: 4, disputes: 6 }]}
      label="ความสำคัญ ยอดรวม"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Ticket 4 · Dispute 6");
  fireEvent.keyDown(high, { key: "Escape" });
  expect(screen.getByRole("status")).toHaveTextContent("ชี้หรือกดแถบ");
});

test("empty scope has a clear message and no selectable bars", () => {
  render(<TotalCaseBars rows={[]} label="ความสำคัญ ยอดรวม" />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "ไม่มีเคสเปิดในขอบเขตนี้",
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
