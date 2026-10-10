import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { apiFetch } from "../../../lib/api";
import AuditSection from "./AuditSection";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../panel/ui/DropdownFilter", () => ({
  __esModule: true,
  default: ({ value, onChange, options }) => (
    <select
      aria-label="ตัวกรอง Action"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const event = {
  source: "AUTH",
  eventId: "event-1",
  actorId: "staff-1",
  action: "USER_WARNED",
  targetType: "USER",
  targetId: "user-1",
  caseId: null,
  reason: "confirmed abuse",
  occurredAt: "2026-10-09T01:00:00.000Z",
  requestId: "request-1",
};

beforeEach(() => jest.clearAllMocks());

it("uses the real USER_WARNED action and links back to user history", async () => {
  apiFetch.mockResolvedValue({ items: [event], total: 1, totalPages: 1 });
  render(<AuditSection token="token" />);

  expect(await screen.findByText("USER_WARNED")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "เปิดต้นทาง" })).toHaveAttribute(
    "href",
    "/workspace?tab=orders&userId=user-1",
  );

  fireEvent.change(screen.getByLabelText("ตัวกรอง Action"), {
    target: { value: "USER_WARNED" },
  });
  await waitFor(() =>
    expect(
      apiFetch.mock.calls.some(([url]) => url.includes("action=USER_WARNED")),
    ).toBe(true),
  );
});

it("queries each owner source separately and sends actor/target/date filters", async () => {
  apiFetch.mockResolvedValue({ items: [], total: 0, totalPages: 1 });
  render(<AuditSection token="token" />);

  fireEvent.click(screen.getByRole("tab", { name: "Hold / Release" }));
  await waitFor(() =>
    expect(
      apiFetch.mock.calls.some(([url]) => url.includes("kind=holds")),
    ).toBe(true),
  );
  fireEvent.change(screen.getByLabelText("Actor ID"), {
    target: { value: "staff-2" },
  });
  fireEvent.change(screen.getByLabelText("Target ID"), {
    target: { value: "order-2" },
  });
  fireEvent.change(screen.getByLabelText("วันที่เริ่มต้น"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));

  await waitFor(() =>
    expect(
      apiFetch.mock.calls.some(([url]) => {
        const parsed = new URL(url, "http://test");
        return (
          parsed.pathname === "/api/orders/support/audit" &&
          parsed.searchParams.get("kind") === "holds" &&
          parsed.searchParams.get("actorId") === "staff-2" &&
          parsed.searchParams.get("targetId") === "order-2" &&
          parsed.searchParams.get("from")?.startsWith("2026-10-01")
        );
      }),
    ).toBe(true),
  );
});

it("keeps a source failure distinct from an empty audit and retries it", async () => {
  let calls = 0;
  apiFetch.mockImplementation(() => {
    calls += 1;
    if (calls === 1) return Promise.reject(new Error("auth offline"));
    return Promise.resolve({ items: [], total: 0, totalPages: 1 });
  });

  render(<AuditSection token="token" />);
  expect(await screen.findByText(/auth offline/)).toBeInTheDocument();
  expect(
    screen.queryByText("ไม่มี Audit ที่ตรงกับเงื่อนไขในแหล่งข้อมูลนี้"),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await waitFor(() => expect(calls).toBe(2));
  expect(
    await screen.findByText("ไม่มี Audit ที่ตรงกับเงื่อนไขในแหล่งข้อมูลนี้"),
  ).toBeInTheDocument();
});

it("links Order and Support audit rows back to their owner records", async () => {
  apiFetch.mockImplementation((url) => {
    if (url.includes("kind=holds")) {
      return Promise.resolve({
        items: [
          {
            ...event,
            source: "ORDER_HOLD",
            eventId: "hold-1",
            action: "HOLD",
            targetType: "ORDER",
            targetId: "order-1",
            caseId: "dispute-1",
          },
        ],
        total: 1,
        totalPages: 1,
      });
    }
    if (url.includes("/api/support/audit")) {
      return Promise.resolve({
        items: [
          {
            ...event,
            source: "SUPPORT",
            eventId: "ticket-event-1",
            action: "STATUS_CHANGE",
            targetType: "TICKET",
            targetId: "ticket-1",
            caseId: "ticket-1",
            caseNumber: "CS-000001",
          },
        ],
        total: 1,
        totalPages: 1,
      });
    }
    return Promise.resolve({ items: [], total: 0, totalPages: 1 });
  });

  render(<AuditSection token="token" />);
  fireEvent.click(screen.getByRole("tab", { name: "Hold / Release" }));
  expect(await screen.findByText("HOLD")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "เปิดต้นทาง" })).toHaveAttribute(
    "href",
    "/workspace?tab=orders&orderId=order-1",
  );

  fireEvent.click(screen.getByRole("tab", { name: "สถานะ Ticket" }));
  expect(await screen.findByText("STATUS_CHANGE")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "เปิดต้นทาง" })).toHaveAttribute(
    "href",
    "/workspace?tab=tickets&ticketId=ticket-1",
  );
});
