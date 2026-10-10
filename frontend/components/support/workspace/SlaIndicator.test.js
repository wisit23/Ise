import { render, screen } from "@testing-library/react";
import SlaIndicator, { formatSla } from "./SlaIndicator";
test("completed targets never count down even if their old deadline is past", () => {
  expect(formatSla({ state: "complete", dueAt: "2000-01-01" })).toBe("จบแล้ว");
  expect(formatSla({ state: "none" })).toBe("ยังไม่กำหนด");
  expect(formatSla({ state: "active", dueAt: "bad" })).toBe("ยังไม่กำหนด");
});

test("dispute review and decision clocks are named distinctly for staff", () => {
  const dueAt = new Date(Date.now() + 3600000).toISOString();
  const { rerender } = render(
    <SlaIndicator sla={{ state: "active", dueAt, metric: "FIRST_REVIEW" }} />,
  );
  expect(screen.getByText(/เริ่มตรวจ:/)).toBeInTheDocument();
  rerender(
    <SlaIndicator sla={{ state: "active", dueAt, metric: "DECISION" }} />,
  );
  expect(screen.getByText(/ตัดสิน:/)).toBeInTheDocument();
});
test("duration is readable in days or hours and distinguishes overdue", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");
  expect(
    formatSla({ state: "active", dueAt: "2026-10-09T02:00:00Z" }, now),
  ).toBe("เหลือ 1 วัน 2 ชม.");
  expect(
    formatSla({ state: "active", dueAt: "2026-10-07T23:30:00Z" }, now),
  ).toBe("เกินกำหนด 30 นาที");
});
