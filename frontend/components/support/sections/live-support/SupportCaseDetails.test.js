import { fireEvent, render, screen } from "@testing-library/react";
import SupportCaseDetails from "./SupportCaseDetails";

const ticket = {
  id: "ticket-1",
  ticketNumber: "T-1001",
  requesterId: "user-1",
  subject: "สินค้าไม่ตรงรายละเอียด",
  description: "ต้องการให้เจ้าหน้าที่ตรวจสอบ",
  status: "ASSIGNED",
  priority: "HIGH",
  category: "ORDER",
  createdAt: "2026-09-13T08:00:00.000Z",
  messages: [],
};

describe("SupportCaseDetails", () => {
  it("groups ticket context in a labelled dialog", () => {
    render(
      <SupportCaseDetails
        ticket={ticket}
        onClose={jest.fn()}
        onAssign={jest.fn()}
        onStatusChange={jest.fn()}
        onAddInternalNote={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "รายละเอียดและการจัดการ" }),
    ).toBeInTheDocument();
    expect(screen.getByText("สินค้าไม่ตรงรายละเอียด")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "บันทึกภายใน" }),
    ).toBeInTheDocument();
  });

  it("closes with Escape", () => {
    const onClose = jest.fn();
    render(
      <SupportCaseDetails
        ticket={ticket}
        onClose={onClose}
        onAssign={jest.fn()}
        onStatusChange={jest.fn()}
        onAddInternalNote={jest.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires a three-part CS memo before escalation", () => {
    const onStatusChange = jest.fn();
    render(<SupportCaseDetails ticket={ticket} onClose={jest.fn()} onAssign={jest.fn()} onStatusChange={onStatusChange} onAddInternalNote={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ส่งต่อให้ Admin" }));
    const submit = screen.getByRole("button", { name: "ส่งเรื่องต่อ" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "ปัญหาคืออะไร" }), { target: { value: "สินค้าไม่ตรงปก" } });
    fireEvent.change(screen.getByRole("textbox", { name: "ขาดอำนาจอะไร" }), { target: { value: "คืนเงิน" } });
    fireEvent.change(screen.getByRole("textbox", { name: "CS เสนอแนะอะไร" }), { target: { value: "คืนเงินผู้ซื้อ" } });
    fireEvent.click(submit);
    expect(onStatusChange).toHaveBeenCalledWith("ESCALATED", "ปัญหา: สินค้าไม่ตรงปก\nขาดอำนาจ: คืนเงิน\nข้อเสนอแนะ: คืนเงินผู้ซื้อ");
  });
});
