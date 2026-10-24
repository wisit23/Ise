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

test("each tab only offers the statuses and work filters it can return", () => {
  const labels = { NEW: "ตั๋วใหม่", IN_PROGRESS: "กำลังดำเนินการ", RESOLVED: "แก้ไขสำเร็จ", CLOSED: "ปิดตั๋วแล้ว", ESCALATED: "ส่งเรื่องต่อ" };
  const { rerender } = render(<CaseFilters state={{ scope: "closed", status: "", sort: "sla" }} labels={labels} priorities={{}} onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /ตัวกรอง/ }));
  expect(screen.queryByRole("button", { name: "งานที่แสดง" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "กรองสถานะ" }));
  expect(screen.getByRole("radio", { name: "ปิดตั๋วแล้ว" })).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "ตั๋วใหม่" })).not.toBeInTheDocument();
  rerender(<CaseFilters dispute state={{ scope: "closed", status: "", sort: "sla" }} labels={{ OPEN: "รอตรวจสอบ", DECIDED: "ตัดสินแล้ว" }} priorities={{}} onChange={() => {}} />);
  expect(screen.queryByRole("button", { name: "กรองสถานะ" })).not.toBeInTheDocument();
});
