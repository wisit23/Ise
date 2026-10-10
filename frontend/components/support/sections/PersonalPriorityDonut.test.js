import { fireEvent, render, screen } from "@testing-library/react";
import PersonalPriorityDonut from "./PersonalPriorityDonut";
test("combines both sources by stored priority, preserves zero levels and selects a real priority", () => {
  const select = jest.fn();
  render(
    <PersonalPriorityDonut
      rows={[
        { label: "HIGH", value: 2 },
        { label: "HIGH", value: 1 },
        { label: "NORMAL", value: 1 },
        { label: "CRITICAL", value: 1 },
      ]}
      onSelect={select}
    />,
  );
  expect(screen.getByRole("img")).toHaveAccessibleName(
    /ความสำคัญของงานฉัน 5 เคส: วิกฤต 1 เคส, ด่วนที่สุด 0 เคส, สูง 3 เคส, ปานกลาง 1 เคส, ต่ำ 0 เคส/,
  );
  fireEvent.click(screen.getByRole("button", { name: "สูง 3 เคส ดูรายการ" }));
  expect(select).toHaveBeenCalledWith("HIGH");
});
test("empty work shows no colored slices and retains all four zero levels", () => {
  render(<PersonalPriorityDonut rows={[]} onSelect={() => {}} />);
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "ไม่มีงานของฉันที่ยังไม่จบ",
  );
  expect(screen.getAllByRole("button")).toHaveLength(4);
  expect(
    screen.getByText("ยังไม่มีงานที่คุณรับและยังไม่จบ"),
  ).toBeInTheDocument();
});
