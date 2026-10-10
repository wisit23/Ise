import { fireEvent, render, screen } from "@testing-library/react";
import CaseFilters from "./CaseFilters";

test("filters stay collapsed until requested, select via shared dropdown and clear explicitly", () => {
  const onChange = jest.fn();
  const { rerender } = render(<CaseFilters state={{ status: "", priority: "", sort: "sla" }} labels={{ OPEN: "รอตรวจสอบ" }} priorities={{ HIGH: "สูง" }} onChange={onChange} />);
  expect(screen.getByRole("button", { name: /ตัวกรอง/ })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "กรองสถานะ" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /ตัวกรอง/ }));
  fireEvent.click(screen.getByRole("button", { name: "กรองสถานะ" }));
  fireEvent.click(screen.getByRole("radio", { name: "รอตรวจสอบ" }));
  expect(onChange).toHaveBeenCalledWith("status", "OPEN");
  rerender(<CaseFilters state={{ status: "OPEN", priority: "", sort: "sla" }} labels={{ OPEN: "รอตรวจสอบ" }} priorities={{ HIGH: "สูง" }} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง" }));
  expect(onChange).toHaveBeenCalledWith("resetFilters", "");
});
