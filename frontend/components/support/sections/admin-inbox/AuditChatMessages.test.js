import { render, screen } from "@testing-library/react";
import AuditChatMessages from "./AuditChatMessages";

it("separates customer and staff bubbles and includes full Thai timestamps", () => {
  const { container } = render(
    <AuditChatMessages
      messages={[
        {
          id: "1",
          senderRole: "BUYER",
          type: "TEXT",
          body: "สอบถาม",
          createdAt: "2026-10-14T13:08:06Z",
        },
        {
          id: "2",
          senderRole: "AGENT",
          type: "TEXT",
          body: "สวัสดี",
          createdAt: "2026-10-14T13:08:13Z",
        },
        {
          id: "3",
          senderRole: "SYSTEM",
          type: "SYSTEM",
          body: "ส่งต่อแล้ว",
          createdAt: "2026-10-15T01:00:00Z",
        },
      ]}
    />,
  );
  expect(screen.getByText("สอบถาม").closest("li")).toHaveClass("justify-start");
  expect(screen.getByText("สวัสดี").closest("li")).toHaveClass("justify-end");
  expect(screen.getByText("ส่งต่อแล้ว").closest("li")).toHaveClass(
    "justify-center",
  );
  expect(screen.getByText(/14\/10\/2569.*20:08:06/)).toBeInTheDocument();
  expect(screen.getByText(/14\/10\/2569.*20:08:13/)).toBeInTheDocument();
  expect(screen.getByText(/15\/10\/2569.*08:00:00/)).toBeInTheDocument();
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  expect(container.querySelector("button")).toBeNull();
});

it("preserves attachment placeholders and handles missing dates", () => {
  render(
    <AuditChatMessages
      messages={[{ id: "1", senderRole: "SELLER", type: "IMAGE" }]}
    />,
  );
  expect(screen.getByText("[IMAGE]")).toBeInTheDocument();
  expect(screen.getByText("ผู้ขาย")).toBeInTheDocument();
  expect(screen.getAllByText("ไม่ทราบวันเวลาส่ง")).toHaveLength(2);
});
