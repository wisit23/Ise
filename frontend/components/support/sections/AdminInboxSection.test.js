import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { apiFetch } from "../../../lib/api";
import AdminInboxSection from "./AdminInboxSection";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../ui/ToastProvider", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock("./case/CaseDrawer", () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));
jest.mock("./admin-inbox/ReportCasePanel", () => ({
  __esModule: true,
  default: () => <div>report detail</div>,
}));
jest.mock("./case/TicketCasePanel", () => ({
  __esModule: true,
  default: ({ ticket, onTakeover, onReturnToCs }) => <div><span>ticket detail: {ticket.requesterName || ticket.requesterId} / {ticket.assigneeName || ticket.assigneeId}</span><button onClick={onTakeover}>takeover test</button><button onClick={onReturnToCs}>return test</button></div>,
}));

function report(id, reason) {
  return {
    id,
    reporterId: "reporter-1",
    targetId: "target-1",
    reason,
    status: "OPEN",
    reportedAt: "2026-10-08T00:00:00.000Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("loads escalation history without requesting reports and restores the active queue", async () => {
  apiFetch.mockImplementation((url) => Promise.resolve({ items: url.includes("/disputes/queue?") && url.includes("scope=history") ? [{ id: "done-1", orderId: "past-order", reason: "งานเก่าที่ตัดสินแล้ว", status: "DECIDED" }] : [], totalPages: 1 }));
  render(<AdminInboxSection token="token" currentUserId="me" />);
  expect(screen.queryByRole("tab", { name: "ทั้งหมด" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ทั้งหมด" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "ข้อพิพาท" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "ยังไม่มีคนรับ" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "ประวัติงานของฉัน" }));
  expect(await screen.findByText("งานเก่าที่ตัดสินแล้ว")).toBeInTheDocument();
  expect(screen.getByText("ตัดสินแล้ว")).toBeInTheDocument();
  const historyCalls = apiFetch.mock.calls.map(([url]) => new URL(url, "http://test")).filter((url) => url.searchParams.get("scope") === "history");
  expect(historyCalls).toHaveLength(1);
  expect(apiFetch.mock.calls.some(([url]) => url.includes("/admin/reports"))).toBe(false);
  expect(historyCalls.find((url) => url.pathname.includes("disputes")).searchParams.get("status")).toBe("DECIDED");
  fireEvent.click(screen.getByRole("button", { name: "งานของฉัน" }));
  await waitFor(() => expect(screen.queryByText("งานเก่าที่ตัดสินแล้ว")).not.toBeInTheDocument());
  expect(apiFetch.mock.calls.some(([url]) => url.includes("scope=mine"))).toBe(true);
});

it("keeps pagination independent between the reports panel and escalated tickets", async () => {
  apiFetch.mockImplementation((url) => {
    if (url.includes("/admin/reports?")) {
      const page = new URL(url, "http://test").searchParams.get("page");
      return Promise.resolve({
        items: [report(`report-${page}`, `Report page ${page}`)],
        totalPages: 3,
      });
    }
    return Promise.resolve({ items: [], totalPages: 7 });
  });

  const reportsPanel = render(<AdminInboxSection token="token" reportsOnly />);
  expect(await screen.findByText("Report page 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "3" }));
  expect(await screen.findByText("Report page 3")).toBeInTheDocument();
  expect(apiFetch.mock.calls.map(([url]) => url)).toEqual(
    expect.arrayContaining([expect.stringContaining("page=3")]),
  );

  reportsPanel.unmount();
  render(<AdminInboxSection token="token" />);
  fireEvent.click(screen.getByRole("tab", { name: "ทิกเก็ต" }));
  expect(await screen.findByRole("button", { name: "7" })).toBeInTheDocument();
  expect(apiFetch.mock.calls.map(([url]) => url)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        /\/api\/support\/tickets\/queue\?.*page=1.*limit=15/,
      ),
    ]),
  );
});

it("sends report search to the report service", async () => {
  apiFetch.mockResolvedValue({ items: [], totalPages: 1 });
  render(<AdminInboxSection token="token" reportsOnly />);

  const input = await screen.findByRole("textbox", { name: "ค้นหาเคส" });
  fireEvent.change(input, { target: { value: "counterfeit" } });
  fireEvent.submit(input.closest("form"));

  await waitFor(() =>
    expect(apiFetch.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /\/api\/auth\/admin\/reports\?.*page=1.*limit=15.*status=PENDING.*scope=unassigned.*q=counterfeit/,
        ),
      ]),
    ),
  );
});

it("shows a source-specific failure and retries only that source", async () => {
  let reportCalls = 0;
  apiFetch.mockImplementation((url) => {
    if (url.includes("/admin/reports?")) {
      reportCalls += 1;
      if (reportCalls === 1) return Promise.reject(new Error("auth offline"));
      return Promise.resolve({ items: [], totalPages: 1 });
    }
    return Promise.resolve({ items: [], totalPages: 1 });
  });

  render(<AdminInboxSection token="token" reportsOnly />);
  expect(await screen.findByText("โหลดรายงานไม่สำเร็จ")).toBeInTheDocument();
  expect(screen.getByText("auth offline")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await waitFor(() => expect(reportCalls).toBe(2));
  await waitFor(() =>
    expect(screen.queryByText("auth offline")).not.toBeInTheDocument(),
  );
});

it("loads a fresh report detail when a row is opened", async () => {
  apiFetch.mockImplementation((url) => {
    if (url.includes("/admin/reports?")) {
      return Promise.resolve({
        items: [report("report-detail", "Open fresh detail")],
        totalPages: 1,
      });
    }
    if (url === "/api/auth/admin/reports/report-detail") {
      return Promise.resolve(report("report-detail", "Fresh from service"));
    }
    return Promise.resolve({ items: [], totalPages: 1 });
  });

  render(<AdminInboxSection token="token" reportsOnly />);
  fireEvent.click(await screen.findByText("Open fresh detail"));

  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/auth/admin/reports/report-detail",
      { token: "token" },
    ),
  );
});

it("opens a source report directly from user-history deep links", async () => {
  apiFetch.mockImplementation((url) => {
    if (url === "/api/auth/admin/reports/source-report") {
      return Promise.resolve(report("source-report", "Linked source case"));
    }
    return Promise.resolve({ items: [], totalPages: 1 });
  });

  render(<AdminInboxSection token="token" initialReportId="source-report" />);

  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/auth/admin/reports/source-report",
      { token: "token" },
    ),
  );
  expect(await screen.findByText("report detail")).toBeInTheDocument();
});

it("shows account names on an escalated ticket instead of only IDs", async () => {
  const ticket = {
    id: "ticket-1", _type: "TICKET", ticketNumber: "TKT-1",
    subject: "Escalated case", status: "ESCALATED",
    requesterId: "buyer-1", assigneeId: "staff-1",
  };
  apiFetch.mockImplementation((url) => {
    if (url.includes("/api/support/tickets/queue?")) return Promise.resolve({ items: [ticket], totalPages: 1 });
    if (url === "/api/support/tickets/ticket-1") return Promise.resolve(ticket);
    if (url === "/api/support/tickets/ticket-1/join") return Promise.resolve({ conversationId: "chat-1" });
    if (url === "/api/auth/admin/users/buyer-1") return Promise.resolve({ firstName: "สมชาย", lastName: "ใจดี" });
    if (url === "/api/auth/admin/users/staff-1") return Promise.resolve({ firstName: "มาลี", lastName: "ผู้ดูแล" });
    return Promise.resolve({ items: [], totalPages: 1 });
  });

  render(<AdminInboxSection token="token" />);
  fireEvent.click(screen.getByRole("tab", { name: "ทิกเก็ต" }));
  fireEvent.click(await screen.findByText("Escalated case"));

  expect(await screen.findByText("ticket detail: สมชาย ใจดี / มาลี ผู้ดูแล")).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledWith("/api/auth/admin/users/buyer-1", { token: "token" });
  expect(apiFetch).toHaveBeenCalledWith("/api/auth/admin/users/staff-1", { token: "token" });
});

it("refreshes the handoff queue when the staff returns to the window", async () => {
  apiFetch.mockResolvedValue({ items: [], totalPages: 1 });
  render(<AdminInboxSection token="token" userRole="TRUST_AND_SAFETY" />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  expect(apiFetch.mock.calls[1][0]).toContain("assignedRole=TRUST_AND_SAFETY&scope=unassigned");
});

it.each(["refresh", "mutation"])("does not let a delayed takeover %s replace the next selected ticket", async (stage) => {
  const a = { id: "a", ticketNumber: "TKT-A", subject: "Case A", requesterName: "Buyer A", version: 3 };
  const b = { id: "b", ticketNumber: "TKT-B", subject: "Case B", requesterName: "Buyer B" };
  let reads = 0, finishRefresh, finishMutation;
  apiFetch.mockImplementation((url) => {
    if (url.includes("/queue?")) return Promise.resolve({ items: [a, b], totalPages: 1 });
    if (url.endsWith("/join")) return Promise.resolve({ conversationId: "room" });
    if (url.endsWith("/takeover")) return stage === "mutation" ? new Promise((resolve) => { finishMutation = resolve; }) : Promise.resolve(a);
    if (url === "/api/support/tickets/a") {
      if (++reads === 1) return Promise.resolve(a);
      return new Promise((resolve) => { finishRefresh = resolve; });
    }
    if (url === "/api/support/tickets/b") return Promise.resolve(b);
    return Promise.resolve({});
  });
  render(<AdminInboxSection token="token" />);
  fireEvent.click(screen.getByRole("tab", { name: "ทิกเก็ต" }));
  fireEvent.click(await screen.findByText("Case A"));
  fireEvent.click(await screen.findByRole("button", { name: "takeover test" }));
  await waitFor(() => expect(stage === "mutation" ? finishMutation : finishRefresh).toEqual(expect.any(Function)));
  expect(apiFetch).toHaveBeenCalledWith("/api/support/tickets/a/takeover", expect.objectContaining({ body: { version: 3, reason: "รับผิดชอบการตรวจสอบเคสที่ส่งต่อ" } }));
  fireEvent.click(await screen.findByText("Case B"));
  expect(await screen.findByText(/ticket detail: Buyer B/)).toBeInTheDocument();
  await act(async () => (stage === "mutation" ? finishMutation : finishRefresh)(a));
  expect(screen.getByText(/ticket detail: Buyer B/)).toBeInTheDocument();
  expect(screen.queryByText(/ticket detail: Buyer A/)).not.toBeInTheDocument();
});

it("sends an escalated ticket back to CS with the reason and checklist, then refreshes the queue", async () => {
  const a = { id: "a", ticketNumber: "TKT-A", subject: "Case A", requesterName: "Buyer A", version: 3 };
  apiFetch.mockImplementation((url, options) => {
    if (url.includes("/queue?")) return Promise.resolve({ items: [a], totalPages: 1 });
    if (url.endsWith("/join")) return Promise.resolve({ conversationId: "room" });
    if (url.endsWith("/request-evidence")) return Promise.resolve({ ...a, status: "IN_PROGRESS" });
    return Promise.resolve(a);
  });
  render(<AdminInboxSection token="token" />);
  fireEvent.click(screen.getByRole("tab", { name: "ทิกเก็ต" }));
  fireEvent.click(await screen.findByText("Case A"));
  fireEvent.click(await screen.findByRole("button", { name: "return test" }));
  fireEvent.change(await screen.findByRole("textbox", { name: /เหตุผลที่ส่งกลับ/ }), { target: { value: "ขาดรูปพัสดุ" } });
  fireEvent.change(screen.getByRole("textbox", { name: "สิ่งที่ต้องทำข้อ 1" }), { target: { value: "ขอรูปพัสดุจากผู้แจ้ง" } });
  fireEvent.click(screen.getByRole("button", { name: "ส่งกลับให้ CS" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/support/tickets/a/request-evidence", expect.objectContaining({
    method: "POST",
    body: { version: 3, reason: "ขาดรูปพัสดุ", tasks: ["ขอรูปพัสดุจากผู้แจ้ง"] },
  })));
  await waitFor(() => expect(apiFetch.mock.calls.filter(([url]) => url.includes("/queue?")).length).toBeGreaterThan(1));
});
