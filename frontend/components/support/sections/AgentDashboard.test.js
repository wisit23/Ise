jest.mock("../hooks/useCustomerServiceConfig", () => ({
  __esModule: true,
  default: () =>
    require("../../../../backend/shared/config/customer-service-client.json"),
}));
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import AgentDashboard from "./AgentDashboard";
import { apiFetch } from "../../../lib/api";
import { navigateWorkspaceSection } from "../workspace/useCaseWorkspace";
jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../workspace/useCaseWorkspace", () => ({
  navigateWorkspaceSection: jest.fn(),
}));
const ticket = {
  asOf: "2026-10-09T05:00:00Z",
  counts: { all: 1, overdue: 1, soon: 0, unassigned: 0, mine: 1 },
  total: 1,
  pageSize: 8,
  trend: [{ date: "2026-10-09", received: 2, completed: 1 }],
  priorities: [{ label: "HIGH", value: 1 }],
  statuses: [{ label: "IN_PROGRESS", value: 1 }],
  workflow: [
    { label: "UNASSIGNED", value: 0 },
    { label: "ACCEPTED", value: 1 },
    { label: "WAITING_INFO", value: 0 },
  ],
  aging: [{ label: "น้อยกว่า 24 ชม.", value: 1 }],
  personal: {
    priorities: [{ label: "HIGH", value: 1 }],
    awaitingReply: 0,
    withoutDeadline: 0,
    counts: { all: 1, overdue: 1, soon: 0, waiting: 0 },
    workflow: [
      { label: "ACCEPTED", value: 1 },
      { label: "WAITING_INFO", value: 0 },
    ],
    aging: [{ label: "น้อยกว่า 24 ชม.", value: 1 }],
  },
  items: [
    {
      id: "t1",
      reference: "CS-001",
      subject: "Order question",
      assigneeId: "agent-a",
      dueAt: "2026-10-09T04:00:00Z",
      createdAt: "2026-10-08T05:00:00Z",
    },
  ],
};
const dispute = {
  ...ticket,
  counts: { all: 2, overdue: 2, soon: 0, unassigned: 0, mine: 2 },
  total: 2,
  trend: [{ date: "2026-10-09", received: 3, completed: 2 }],
  statuses: [{ label: "OPEN", value: 2 }],
  workflow: [
    { label: "UNASSIGNED", value: 0 },
    { label: "ACCEPTED", value: 2 },
    { label: "WAITING_INFO", value: 0 },
  ],
  aging: [{ label: "น้อยกว่า 24 ชม.", value: 2 }],
  personal: {
    priorities: [{ label: "HIGH", value: 2 }],
    awaitingReply: 0,
    withoutDeadline: 0,
    counts: { all: 2, overdue: 2, soon: 0, waiting: 0 },
    workflow: [
      { label: "ACCEPTED", value: 2 },
      { label: "WAITING_INFO", value: 0 },
    ],
    aging: [{ label: "น้อยกว่า 24 ชม.", value: 2 }],
  },
  items: [
    {
      id: "d1",
      reference: "ORDER-001",
      subject: "Dispute",
      assigneeId: "agent-a",
      dueAt: "2026-10-09T03:00:00Z",
      createdAt: "2026-10-08T05:00:00Z",
    },
  ],
};
const responses = (path) =>
  Promise.resolve(path.includes("/support/") ? ticket : dispute);
beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockImplementation(responses);
});
afterEach(() => jest.useRealTimers());
const view = () =>
  render(<AgentDashboard token="token-a" currentUserId="agent-a" />);

test("priority donut summarizes own work and keeps the receipt line chart on the main overview", async () => {
  view();
  expect(
    await screen.findByRole("img", {
      name: /ความสำคัญของงานฉัน 3 เคส:/,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "ต่ำ 0 เคส ดูรายการ" }),
  ).toBeInTheDocument();
});

test("both domains contribute to totals on first load without domain navigation", async () => {
  view();
  const card = await screen.findByRole("button", { name: /เกินกำหนด/ });
  expect(card).toHaveTextContent("3");
  expect(card).toHaveTextContent("Ticket 1");
  expect(card).toHaveTextContent("Dispute 2");
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText("ประเภทเคส")).not.toBeInTheDocument();
  expect(document.querySelector("details")).toBeNull();
});

test("unassigned overdue work stays in the receive-more queue and never inflates my SLA cards or charts", async () => {
  apiFetch.mockImplementation((path) =>
    Promise.resolve(
      path.includes("/support/")
        ? {
            ...ticket,
            counts: { ...ticket.counts, all: 4, unassigned: 3, overdue: 4 },
            workflow: [
              { label: "UNASSIGNED", value: 3 },
              { label: "ACCEPTED", value: 1 },
              { label: "WAITING_INFO", value: 0 },
            ],
          }
        : dispute,
    ),
  );
  view();
  expect(
    await screen.findByRole("button", { name: /งานของฉันเกินกำหนด/ }),
  ).toHaveTextContent("Ticket 1");
  expect(
    screen.getByRole("button", { name: /งานที่ยังไม่มีคนรับ/ }),
  ).toHaveTextContent("Ticket 3");
  expect(
    screen.getByRole("img", {
      name: /ความสำคัญของงานฉัน 3 เคส:/,
    }),
  ).toBeInTheDocument();
});

test("legend toggles only the trend, preserving combined KPI", async () => {
  view();
  await screen.findByRole("heading", { name: "รับงานรายวัน · 14 วัน" });
  const toggle = screen.getByRole("button", { name: "Dispute 3" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(
    screen.getByRole("img", { name: "แนวโน้มรับงาน Ticket" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /เกินกำหนด/ })).toHaveTextContent(
    "Dispute 2",
  );
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

test("one failed source never displays a false total and retry recovers", async () => {
  apiFetch.mockImplementation((path) =>
    path.includes("/orders/")
      ? Promise.reject(new Error("503"))
      : responses(path),
  );
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "โหลด Dispute ไม่สำเร็จ",
  );
  expect(
    screen.queryByRole("button", { name: /เกินกำหนด/ }),
  ).not.toBeInTheDocument();
  apiFetch.mockImplementation(responses);
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  expect(
    await screen.findByRole("button", { name: /เกินกำหนด/ }),
  ).toHaveTextContent("Dispute 2");
});
test("refresh failure keeps a labelled coherent previous snapshot", async () => {
  view();
  await screen.findByRole("button", { name: /เกินกำหนด/ });
  apiFetch.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "อัปเดตข้อมูล" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ข้อมูลเดิม");
  expect(screen.getByRole("button", { name: /เกินกำหนด/ })).toHaveTextContent(
    "Ticket 1",
  );
});
test("polls both sources and cleans up timers", async () => {
  jest.useFakeTimers();
  const { unmount } = view();
  await act(async () => {});
  await act(async () => {
    jest.advanceTimersByTime(60000);
  });
  expect(apiFetch).toHaveBeenCalledTimes(4);
  unmount();
  await act(async () => {
    jest.advanceTimersByTime(60000);
  });
  expect(apiFetch).toHaveBeenCalledTimes(4);
});

test("all hidden lines have a visible explanation and can be restored", async () => {
  view();
  await screen.findByRole("heading", { name: "รับงานรายวัน · 14 วัน" });
  fireEvent.click(screen.getByRole("button", { name: "Ticket 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Dispute 3" }));
  expect(
    screen.getByRole("status", { name: "การแสดงเส้นแนวโน้ม" }),
  ).toHaveTextContent("เลือก Ticket หรือ Dispute เพื่อแสดงเส้น");
  fireEvent.click(screen.getByRole("button", { name: "Ticket 2" }));
  expect(
    screen.getByRole("img", { name: "แนวโน้มรับงาน Ticket" }),
  ).toBeInTheDocument();
});

test("a new period labels the previous chart accurately while it refreshes", async () => {
  view();
  await screen.findByRole("heading", { name: "รับงานรายวัน · 14 วัน" });
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  apiFetch.mockImplementation(() => pending);
  fireEvent.click(screen.getByRole("button", { name: "ช่วงย้อนหลัง" }));
  fireEvent.click(screen.getByRole("radio", { name: "30 วัน" }));
  expect(screen.getByText("รับงานรายวัน · 14 วัน")).toBeInTheDocument();
  await act(async () => {
    finish(ticket);
  });
  expect(await screen.findByText("รับงานรายวัน · 30 วัน")).toBeInTheDocument();
});

test("an empty dashboard shows actual zero counts and explains the empty history", async () => {
  apiFetch.mockResolvedValue({
    ...ticket,
    counts: { all: 0, mine: 0, unassigned: 0, overdue: 0, soon: 0 },
    total: 0,
    items: [],
    trend: [{ date: "2026-10-09", received: 0, completed: 0 }],
    statuses: [],
    personal: {
      priorities: [],
      awaitingReply: 0,
      withoutDeadline: 0,
      counts: { all: 0, overdue: 0, soon: 0, waiting: 0 },
      workflow: [
        { label: "ACCEPTED", value: 0 },
        { label: "WAITING_INFO", value: 0 },
      ],
      aging: [{ label: "น้อยกว่า 24 ชม.", value: 0 }],
    },
    workflow: [
      { label: "UNASSIGNED", value: 0 },
      { label: "ACCEPTED", value: 0 },
      { label: "WAITING_INFO", value: 0 },
    ],
    priorities: [],
  });
  view();
  expect(
    await screen.findByRole("img", { name: "ไม่มีงานของฉันที่ยังไม่จบ" }),
  ).toBeInTheDocument();
  expect(screen.getByText("ยังไม่มีการรับงานในช่วงนี้")).toBeInTheDocument();
});

test("malformed response cannot create misleading counts or crash the chart", async () => {
  apiFetch.mockImplementation((path) =>
    Promise.resolve(
      path.includes("/orders/") ? { counts: { all: 99 } } : ticket,
    ),
  );
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "โหลด Dispute ไม่สำเร็จ",
  );
  expect(
    screen.queryByRole("button", { name: /งานฉันที่ยังไม่จบ/ }),
  ).not.toBeInTheDocument();
});

test("mixed deadline groups select a domain then navigate to the real filtered table", async () => {
  view();
  fireEvent.click(
    await screen.findByRole("button", { name: /งานของฉันเกินกำหนด/ }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("เลือกประเภทเคสที่จะดู");
  fireEvent.click(screen.getByRole("button", { name: "Dispute · 2 เคส →" }));
  expect(navigateWorkspaceSection).toHaveBeenCalledWith(
    "disputes",
    "agent-a",
    "",
    expect.objectContaining({
      view: "table",
      scope: "mine",
      work: "overdue",
      priority: "",
      selectedId: null,
      search: "",
      page: 1,
    }),
  );
});
test("single-domain priority opens its table directly without a case preview", async () => {
  apiFetch.mockImplementation((path) =>
    Promise.resolve(
      path.includes("/support/")
        ? {
            ...ticket,
            personal: {
              ...ticket.personal,
              priorities: [{ label: "LOW", value: 1 }],
            },
          }
        : dispute,
    ),
  );
  view();
  fireEvent.click(
    await screen.findByRole("button", { name: "สูง 2 เคส ดูรายการ" }),
  );
  expect(navigateWorkspaceSection).toHaveBeenCalledWith(
    "disputes",
    "agent-a",
    "",
    expect.objectContaining({
      view: "table",
      scope: "mine",
      work: "open",
      priority: "HIGH",
      selectedId: null,
    }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.querySelector("details")).toBeNull();
});
test("empty groups let the agent choose a table and cancel without navigation", async () => {
  view();
  fireEvent.click(
    await screen.findByRole("button", { name: /งานที่ยังไม่มีคนรับ/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(navigateWorkspaceSection).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /งานที่ยังไม่มีคนรับ/ }));
  fireEvent.click(screen.getByRole("button", { name: "Ticket · 0 เคส →" }));
  expect(navigateWorkspaceSection).toHaveBeenCalledWith(
    "tickets",
    "agent-a",
    "",
    expect.objectContaining({
      scope: "unassigned",
      work: "open",
      view: "table",
    }),
  );
});
test("period changes still request both historical sources", async () => {
  view();
  await screen.findByLabelText("ช่วงย้อนหลัง");
  fireEvent.click(screen.getByRole("button", { name: "ช่วงย้อนหลัง" }));
  fireEvent.click(screen.getByRole("radio", { name: "30 วัน" }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/disputes/agent-dashboard?focus=mine&page=1&days=30",
      expect.any(Object),
    ),
  );
});

test("reply card navigates to own pending replies without duplicating cases", async () => {
  apiFetch.mockImplementation((path) =>
    Promise.resolve(
      path.includes("/support/")
        ? ticket
        : { ...dispute, personal: { ...dispute.personal, awaitingReply: 1 } },
    ),
  );
  view();
  fireEvent.click(
    await screen.findByRole("button", { name: /งานที่รอฉันตอบ/ }),
  );
  expect(navigateWorkspaceSection).toHaveBeenCalledWith(
    "disputes",
    "agent-a",
    "",
    expect.objectContaining({ scope: "mine", work: "reply", view: "table" }),
  );
});
test("unavailable chat summary shows a dash rather than a false zero", async () => {
  apiFetch.mockImplementation((path) =>
    Promise.resolve(
      path.includes("/support/")
        ? ticket
        : {
            ...dispute,
            personal: { ...dispute.personal, awaitingReply: null },
          },
    ),
  );
  view();
  const card = await screen.findByRole("button", { name: /งานที่รอฉันตอบ/ });
  expect(card).toBeDisabled();
  expect(card).toHaveTextContent("—");
});
