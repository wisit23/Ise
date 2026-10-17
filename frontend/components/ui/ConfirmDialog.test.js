import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  test("renders title and description without any Audit Log notice", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ConfirmDialog
        open={true}
        title="ยืนยันการลบ"
        description="คุณแน่ใจว่าต้องการลบรายการนี้?"
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText("ยืนยันการลบ")).toBeInTheDocument();
    expect(screen.getByText("คุณแน่ใจว่าต้องการลบรายการนี้?")).toBeInTheDocument();
    // Verify that the Audit Log notice is NOT displayed
    expect(screen.queryByText(/Audit Log/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("ลบ"));
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  test("supports message alias for description", () => {
    render(
      <ConfirmDialog
        open={true}
        title="ยืนยันการดำเนินการ"
        message="ข้อความอธิบายการดำเนินการ"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByText("ข้อความอธิบายการดำเนินการ")).toBeInTheDocument();
  });

  test("validates required reason before confirming", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ConfirmDialog
        open={true}
        title="ระงับบัญชี"
        description="ระบุเหตุผลในการระงับ"
        reason="required"
        reasonLabel="เหตุผลการระงับ"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // Try to confirm without entering a reason
    fireEvent.click(screen.getByText("ยืนยัน"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("กรุณาระบุเหตุผลการระงับ")).toBeInTheDocument();

    // Type a reason and confirm
    const textarea = screen.getByLabelText(/เหตุผลการระงับ/);
    fireEvent.change(textarea, { target: { value: "ละเมิดกฎการใช้งาน" } });
    fireEvent.click(screen.getByText("ยืนยัน"));
    expect(onConfirm).toHaveBeenCalledWith("ละเมิดกฎการใช้งาน");
  });

  test("calls onCancel when clicking cancel button", () => {
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        open={true}
        title="ยกเลิกคำสั่งซื้อ"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText("ยกเลิก"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
