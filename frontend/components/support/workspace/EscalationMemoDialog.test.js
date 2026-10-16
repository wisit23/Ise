import { act, fireEvent, render, screen } from "@testing-library/react";
import EscalationMemoDialog from "./EscalationMemoDialog";

test("dispute can be sent to T&S without a CS recommendation", async () => {
  const submit = jest.fn().mockResolvedValue(undefined);
  render(<EscalationMemoDialog open dispute onClose={() => {}} onSubmit={submit} />);
  const button = screen.getByRole("button", { name: "ส่งต่อให้ Trust & Safety", exact: true });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/ปัญหาคืออะไร/), { target: { value: "wrong item" } });
  fireEvent.change(screen.getByLabelText(/ขาดอำนาจอะไร/), { target: { value: "refund" } });
  expect(screen.getByLabelText(/ข้อเสนอแนะของ CS/)).not.toBeRequired();
  expect(button).toBeEnabled();
  await act(async () => fireEvent.click(button));
  expect(submit).toHaveBeenCalledWith("ปัญหา: wrong item\nขาดอำนาจ: refund\nข้อเสนอแนะ: ");
});
test("a failed escalation preserves all fields and keeps dialog open", async () => {
  const onClose = jest.fn();
  render(
    <EscalationMemoDialog
      open
      onClose={onClose}
      onSubmit={() => Promise.reject(new Error("network unavailable"))}
    />,
  );
  fireEvent.change(screen.getByLabelText(/ปัญหาคืออะไร/), {
    target: { value: "problem" },
  });
  fireEvent.change(screen.getByLabelText(/ขาดอำนาจอะไร/), {
    target: { value: "authority" },
  });
  fireEvent.change(screen.getByLabelText(/ข้อเสนอแนะของ CS/), {
    target: { value: "recommendation" },
  });
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "ส่งต่อให้ Admin", exact: true }),
    ),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/ปัญหาคืออะไร/)).toHaveValue("problem");
  expect(screen.getByText("network unavailable")).toBeInTheDocument();
});

test("follow-up memo is built from the checklist and needs a reason for unfinished items", async () => {
  const submit = jest.fn().mockResolvedValue(undefined);
  const onTaskChange = jest.fn().mockResolvedValue({});
  render(
    <EscalationMemoDialog
      open
      dispute
      onClose={() => {}}
      onSubmit={submit}
      onTaskChange={onTaskChange}
      returnTasks={[
        { id: "t1", text: "ขอวิดีโอ", done: true, note: "ได้แล้ว" },
        { id: "t2", text: "ยืนยันเลขพัสดุ", done: false, note: "" },
      ]}
    />,
  );
  const button = screen.getByRole("button", { name: "ส่งกลับให้ Trust & Safety" });
  expect(button).toBeDisabled();
  expect(screen.getByText(/ยังไม่ได้ทำ 1 ข้อ/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("เหตุผลที่ยังไม่ได้ทำ: ยืนยันเลขพัสดุ"), { target: { value: "ร้านยังไม่ตอบ" } });
  expect(button).toBeEnabled();
  await act(async () => fireEvent.click(button));
  expect(onTaskChange).toHaveBeenCalledWith("t2", { note: "ร้านยังไม่ตอบ" });
  expect(submit).toHaveBeenCalledWith(
    "ตอบกลับคำขอ Trust & Safety:\n✓ ขอวิดีโอ — ได้แล้ว\n✗ ยืนยันเลขพัสดุ — ร้านยังไม่ตอบ",
  );
});
