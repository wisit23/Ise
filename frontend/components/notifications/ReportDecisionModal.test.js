import { render, screen, fireEvent } from "@testing-library/react";
import ReportDecisionModal from "./ReportDecisionModal";

describe("ReportDecisionModal", () => {
  it("shows the original report reason separately from an admin decision", () => {
    render(<ReportDecisionModal open onClose={jest.fn()} notification={{
      type: "REPORT", title: "ความคิดเห็นของคุณถูกรายงาน", message: "อยู่ระหว่างตรวจสอบ",
      metadata: { reportReason: "ใช้ถ้อยคำคุกคาม" },
    }} />);
    expect(screen.getByText("เหตุผลที่รายงานความคิดเห็น:")).toBeInTheDocument();
    expect(screen.getByText("ใช้ถ้อยคำคุกคาม")).toBeInTheDocument();
    expect(screen.queryByText("เหตุผล / ข้อชี้แจงจาก Trust and Safety:")).not.toBeInTheDocument();
  });
  it("renders nothing when open is false", () => {
    const { container } = render(
      <ReportDecisionModal open={false} onClose={jest.fn()} notification={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when notification is null", () => {
    const { container } = render(
      <ReportDecisionModal open={true} onClose={jest.fn()} notification={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders decision details for SUSPEND_USER verdict", () => {
    const mockNotification = {
      title: "บัญชีของคุณถูกระงับการใช้งาน",
      message: "ผู้ดูแลระบบได้ระงับการใช้งานบัญชีของคุณ",
      link: "/products/prod-123",
      createdAt: new Date("2026-10-17T00:00:00Z").toISOString(),
      metadata: {
        reportId: "rep-1",
        decision: "SUSPEND_USER",
        reason: "มีพฤติกรรมหลอกลวงผู้ซื้อ",
        role: "target",
      },
    };

    const handleClose = jest.fn();
    render(
      <ReportDecisionModal
        open={true}
        onClose={handleClose}
        notification={mockNotification}
      />,
    );

    expect(screen.getByText("รายละเอียดผลการตัดสินจาก Trust and Safety")).toBeInTheDocument();
    expect(screen.getByText("ระงับการใช้งานบัญชีผู้ใช้")).toBeInTheDocument();
    expect(screen.getByText("คุณเป็นผู้ถูกรายงาน")).toBeInTheDocument();
    expect(screen.getByText("มีพฤติกรรมหลอกลวงผู้ซื้อ")).toBeInTheDocument();
    expect(screen.getByText("ดูรายการที่เกี่ยวข้อง").closest("a")).toHaveAttribute("href", "/products/prod-123");

    fireEvent.click(screen.getByRole("button", { name: /รับทราบและปิด/i }));

    expect(handleClose).toHaveBeenCalled();
  });

  it("renders DISMISS decision for reporter", () => {
    const mockNotification = {
      title: "ผลการพิจารณารายงาน",
      message: "ผู้ดูแลระบบได้ยกเลิกรายงาน",
      createdAt: new Date().toISOString(),
      metadata: {
        reportId: "rep-2",
        decision: "DISMISS",
        reason: "ไม่พบหลักฐานการกระทำความผิด",
        role: "reporter",
      },
    };

    render(
      <ReportDecisionModal
        open={true}
        onClose={jest.fn()}
        notification={mockNotification}
      />,
    );

    expect(screen.getByText("ยกเลิกรายงาน / ไม่พบการกระทำผิด")).toBeInTheDocument();
    expect(screen.getByText("คุณเป็นผู้รายงาน")).toBeInTheDocument();
    expect(screen.getByText("ไม่พบหลักฐานการกระทำความผิด")).toBeInTheDocument();
  });
});
