import { fireEvent, render, screen } from "@testing-library/react";
import SupportQueueSidebar from "./SupportQueueSidebar";

const baseProps = {
  tickets: [],
  selectedTicketId: null,
  onSelectTicket: jest.fn(),
  scope: "mine",
  onScopeChange: jest.fn(),
  search: "",
  onSearchChange: jest.fn(),
  loading: false,
  error: "",
  onRefresh: jest.fn(),
};

describe("SupportQueueSidebar", () => {
  beforeEach(() => jest.clearAllMocks());

  it("exposes accessible queue filters and search controls", () => {
    render(<SupportQueueSidebar {...baseProps} />);

    expect(screen.getByRole("button", { name: "งานของฉัน" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("textbox", { name: "ค้นหาตั๋ว" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "รอรับเรื่อง" }));
    expect(baseProps.onScopeChange).toHaveBeenCalledWith("unassigned");
  });

  it("shows a recoverable queue error", () => {
    render(
      <SupportQueueSidebar {...baseProps} error="เซิร์ฟเวอร์ไม่ตอบสนอง" />,
    );

    expect(screen.getByText("โหลดคิวงานไม่สำเร็จ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(baseProps.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("offers a next action when the personal queue is empty", () => {
    render(<SupportQueueSidebar {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "ดูงานรอรับเรื่อง" }));
    expect(baseProps.onScopeChange).toHaveBeenCalledWith("unassigned");
  });

  it("distinguishes no search results from an empty personal queue", () => {
    render(<SupportQueueSidebar {...baseProps} search="missing" />);
    expect(screen.getByText("ไม่พบ Ticket ที่ค้นหา")).toBeInTheDocument();
    expect(screen.queryByText("ยังไม่มีงานในความดูแล")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "ล้างคำค้นหา" })[1]);
    expect(baseProps.onSearchChange).toHaveBeenCalledWith("");
  });

  it("labels stale results and suppresses urgency for a closed ticket", () => {
    render(
      <SupportQueueSidebar
        {...baseProps}
        error="offline"
        tickets={[
          {
            id: "closed",
            ticketNumber: "T-closed",
            subject: "Closed case",
            status: "CLOSED",
            priority: "URGENT",
            createdAt: "invalid",
          },
        ]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("ขณะนี้แสดงข้อมูลเดิม");
    expect(
      screen.getByRole("button", { name: /Closed case/ }),
    ).not.toHaveTextContent("ด่วนที่สุด");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("announces loading instead of a misleading zero count", () => {
    render(<SupportQueueSidebar {...baseProps} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("กำลังโหลดคิวงาน");
    expect(screen.getByRole("button", { name: "รีเฟรชรายการ" })).toBeDisabled();
  });

  it("marks the selected ticket and opens it", () => {
    const ticket = {
      id: "ticket-1",
      ticketNumber: "T-1001",
      requesterId: "user-123456789",
      subject: "ติดตามการคืนเงิน",
      status: "IN_PROGRESS",
      priority: "HIGH",
      createdAt: "2026-09-13T08:00:00.000Z",
    };
    render(
      <SupportQueueSidebar
        {...baseProps}
        tickets={[ticket]}
        selectedTicketId={ticket.id}
      />,
    );

    const row = screen.getByRole("button", { name: /T-1001/ });
    expect(row).toHaveAttribute("aria-current", "true");
    fireEvent.click(row);
    expect(baseProps.onSelectTicket).toHaveBeenCalledWith(ticket);
  });
});
