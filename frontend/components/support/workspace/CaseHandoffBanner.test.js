import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CaseHandoffBanner from "./CaseHandoffBanner";

const tasks = [
  { id: "t1", text: "ขอรูปกล่องพัสดุ", done: true, note: "ได้แล้ว" },
  { id: "t2", text: "ยืนยันเลขพัสดุกับร้าน", done: false, note: "" },
];

test("returned case shows a slim progress bar and a checklist on demand", async () => {
  const onEscalate = jest.fn();
  const onTaskChange = jest.fn().mockResolvedValue({});
  render(
    <CaseHandoffBanner
      caseItem={{ id: "c1", returnReason: "หลักฐานยังไม่พอ", returnTasks: tasks, returnedAt: "2026-10-17T03:00:00Z" }}
      caps={{ isReturned: true, canEscalate: true }}
      onEscalate={onEscalate}
      onTaskChange={onTaskChange}
    />,
  );
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  expect(screen.getByText("1/2")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /ดูรายการ/ }));
  expect(screen.getByText("หลักฐานยังไม่พอ")).toBeInTheDocument();
  const [first, second] = screen.getAllByRole("checkbox");
  expect(first).toHaveAttribute("aria-checked", "true");
  expect(second).toHaveAttribute("aria-checked", "false");

  fireEvent.click(second);
  await waitFor(() => expect(onTaskChange).toHaveBeenCalledWith("t2", { done: true }));
  expect(await screen.findByText("บันทึกแล้ว")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "+ จดสิ่งที่ได้ (ไม่บังคับ)" }));
  fireEvent.change(screen.getByLabelText("สิ่งที่ได้สำหรับข้อ 2"), { target: { value: "ร้านยืนยันแล้ว" } });
  fireEvent.keyDown(screen.getByLabelText("สิ่งที่ได้สำหรับข้อ 2"), { key: "Enter" });
  await waitFor(() => expect(onTaskChange).toHaveBeenCalledWith("t2", { note: "ร้านยืนยันแล้ว" }));

  fireEvent.click(screen.getByRole("button", { name: "ส่งกลับให้ T&S" }));
  expect(onEscalate).toHaveBeenCalled();
});

test("checklist closes with Escape", () => {
  render(
    <CaseHandoffBanner
      caseItem={{ id: "c1", returnTasks: tasks, returnedAt: "2026-10-17T03:00:00Z" }}
      caps={{ isReturned: true, canEscalate: true }}
      onTaskChange={jest.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /ดูรายการ/ }));
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

test("escalating agent sees a read-only waiting state", () => {
  render(<CaseHandoffBanner caseItem={{ assignedTo: null }} caps={{ isWatching: true }} />);
  expect(screen.getByText("รอ Trust & Safety ตรวจ")).toBeInTheDocument();
  expect(screen.getByText(/ดูได้อย่างเดียว/)).toBeInTheDocument();
});

test("renders nothing for a normal case", () => {
  const { container } = render(<CaseHandoffBanner caseItem={{}} caps={{}} />);
  expect(container).toBeEmptyDOMElement();
});
