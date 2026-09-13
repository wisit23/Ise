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

  it("exposes accessible queue tabs and search controls", () => {
    render(<SupportQueueSidebar {...baseProps} />);

    expect(screen.getByRole("tab", { name: "งานของฉัน" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "ค้นหาตั๋ว" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "รอรับเรื่อง" }));
    expect(baseProps.onScopeChange).toHaveBeenCalledWith("unassigned");
  });

  it("shows a recoverable queue error", () => {
    render(
      <SupportQueueSidebar
        {...baseProps}
        error="เซิร์ฟเวอร์ไม่ตอบสนอง"
      />,
    );

    expect(screen.getByText("โหลดคิวงานไม่สำเร็จ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(baseProps.onRefresh).toHaveBeenCalledTimes(1);
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
