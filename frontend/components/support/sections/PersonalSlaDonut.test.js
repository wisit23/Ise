import { fireEvent, render, screen } from "@testing-library/react";
import PersonalSlaDonut from "./PersonalSlaDonut";

test("separates missing deadlines from available time and opens the selected personal list", () => {
  const onSelect = jest.fn();
  render(
    <PersonalSlaDonut
      total={10}
      overdue={2}
      soon={1}
      withoutDeadline={3}
      warningMinutes={60}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByRole("img")).toHaveAccessibleName(
    /ยังมีเวลา 4 เคส, ไม่มีกำหนด SLA 3 เคส/,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "ไม่มีกำหนด SLA 3 เคส ดูรายการ" }),
  );
  expect(onSelect).toHaveBeenCalledWith("mine_no_deadline");
});
test("empty workload shows zero without implying that work is safe or overdue", () => {
  render(
    <PersonalSlaDonut
      total={0}
      overdue={0}
      soon={0}
      withoutDeadline={0}
      warningMinutes={60}
      onSelect={() => {}}
    />,
  );
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "ไม่มีงานของฉันที่ยังไม่จบ",
  );
  expect(
    screen.getByRole("button", { name: "เกินกำหนด 0 เคส ดูรายการ" }),
  ).toBeInTheDocument();
});
