import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReturnToCsDialog from "./ReturnToCsDialog";

test("requires a reason and at least one task before returning", async () => {
  const onSubmit = jest.fn().mockResolvedValue({});
  const onClose = jest.fn();
  render(<ReturnToCsDialog open onClose={onClose} onSubmit={onSubmit} />);
  const submit = screen.getByRole("button", { name: "ส่งกลับให้ CS" });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/เหตุผลที่ยังตัดสินไม่ได้/), { target: { value: "ข้อมูลไม่พอ" } });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("สิ่งที่ต้องทำข้อ 1"), { target: { value: "ขอรูปกล่อง" } });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มข้อ" }));
  fireEvent.change(screen.getByLabelText("สิ่งที่ต้องทำข้อ 2"), { target: { value: "  " } });
  fireEvent.click(submit);
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({ reason: "ข้อมูลไม่พอ", tasks: ["ขอรูปกล่อง"] }),
  );
  expect(onClose).toHaveBeenCalled();
});
