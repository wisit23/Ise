import { fireEvent, render, screen } from "@testing-library/react";
import TicketCasePanel from "./TicketCasePanel";
jest.mock("../../EmbeddedChat", () => () => null);

it.each([false, true])("shows Close only after claiming the case (allowed=%s)", (allowed) => {
  render(<TicketCasePanel ticket={{ id: "t-1", requesterId: "buyer", assigneeId: "cs-1", status: "ESCALATED", createdAt: "2026-10-14T00:00:00Z", capabilities: { canClose: allowed, canTakeover: !allowed, allowedNextStatuses: ["CLOSED"] } }} onTakeover={() => {}} onStatusChange={() => {}} />);
  if (allowed) expect(screen.getByRole("button", { name: "ปิดงาน" })).toBeEnabled();
  else { expect(screen.queryByRole("button", { name: "ปิดงาน" })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "รับผิดชอบเคสที่ส่งต่อ" })).toBeInTheDocument(); }
});

it.each([false, true])(
  "requires ownership before enabling all moderation buttons (allowed=%s)",
  (allowed) => {
    const onWarnUser = jest.fn(),
      onBanUser = jest.fn();
    render(
      <TicketCasePanel
        ticket={{
          id: "t-1",
          targetId: "target",
          requesterId: "buyer",
          status: "ESCALATED",
          createdAt: "2026-10-14T00:00:00Z",
          capabilities: { canModerateUsers: allowed },
        }}
        onWarnUser={onWarnUser}
        onBanUser={onBanUser}
      />,
    );
    const warn = screen.getByRole("button", { name: /ตักเตือนคู่กรณี/ });
    const ban = screen.getByRole("button", { name: /แบนคู่กรณี/ });
    if (allowed) {
      expect(warn).toBeEnabled();
      expect(ban).toBeEnabled();
    } else {
      expect(warn).toBeDisabled();
      expect(ban).toBeDisabled();
      expect(screen.getByRole("button", { name: /แบนผู้แจ้ง/ })).toBeDisabled();
    }
    fireEvent.click(warn);
    fireEvent.click(ban);
    expect(onWarnUser).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(onBanUser).toHaveBeenCalledTimes(allowed ? 1 : 0);
  },
);
