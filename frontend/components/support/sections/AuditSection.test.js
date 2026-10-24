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

it("labels every audit row by its actual event instead of the selected source tab", async () => {
  const rows = [
    ["USER_SUSPENDED", null, "บัญชีผู้ใช้"],
    ["KYC_VERIFIED", null, "ยืนยันตัวตนผู้ขาย (KYC)"],
    ["REPORT_REVIEWED", "SHOP", "รายงานร้านค้า"],
    ["REPORT_DISMISS", "REVIEW", "รายงานรีวิว"],
    ["REPORT_REMOVE_PRODUCT", "PRODUCT", "รายงานสินค้า"],
    ["PRODUCT_REMOVED", null, "จัดการสินค้า"],
    ["COMMERCE_RESTRICTED_BUYER", null, "สิทธิ์การซื้อขาย"],
    ["REPORT_DISMISS", null, "รายงาน (ไม่พบประเภทต้นทาง)"],
  ];
  apiFetch.mockResolvedValue({ items: rows.map(([action, reportType], index) => ({ ...event, eventId: `event-${index}`, action, reportType })), total: rows.length, totalPages: 1 });
  render(<AuditSection token="token" />);
  for (const [, , label] of rows) expect(await screen.findByRole("cell", { name: label, exact: true })).toBeInTheDocument();
  expect(screen.queryByRole("cell", { name: "บัญชี / KYC / Report" })).not.toBeInTheDocument();
});

it("uses the real USER_WARNED action and links back to user history", async () => {
  apiFetch.mockResolvedValue({ items: [event], total: 1, totalPages: 1 });
  render(<AuditSection token="token" />);

  expect((await screen.findAllByText("ตักเตือนผู้ใช้")).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "เปิดต้นทาง" })).toHaveAttribute(
    "href",
    "/workspace?section=orders&userId=user-1",
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
  fireEvent.change(screen.getByLabelText("รหัสผู้ดำเนินการ"), {
    target: { value: "staff-2" },
  });
  fireEvent.change(screen.getByLabelText("รหัสรายการที่เกี่ยวข้อง"), {
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
    screen.queryByText("ไม่พบประวัติที่ตรงกับเงื่อนไข"),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await waitFor(() => expect(calls).toBe(2));
  expect(
    await screen.findByText("ไม่พบประวัติที่ตรงกับเงื่อนไข"),
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
  expect((await screen.findAllByText("พักเงิน")).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "เปิดต้นทาง" })).toHaveAttribute(
    "href",
    "/workspace?section=orders&orderId=order-1",
  );

  fireEvent.click(screen.getByRole("tab", { name: "สถานะ Ticket" }));
  expect((await screen.findAllByText("เปลี่ยนสถานะ Ticket")).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "เปิดต้นทาง" })).toHaveAttribute(
    "href",
    "/workspace?section=tickets&case=ticket-1",
  );
});
