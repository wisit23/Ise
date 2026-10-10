import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import CaseWorkspace from "./CaseWorkspace";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  fetchAuthedBlobUrl: jest.fn(),
}));
jest.mock("../../../lib/auth", () => ({
  getStoredUser: () => ({ id: "cs", role: "CUSTOMER_SERVICE" }),
}));
jest.mock("../../ui/ToastProvider", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock(
  "../EmbeddedChat",
  () =>
    function MockChat({ conversationId, readOnly, onBusyChange }) {
      return (
        <div data-testid="room">
          {conversationId}:{String(readOnly)}
          <button onClick={() => onBusyChange(true)}>Start upload</button>
        </div>
      );
    },
);

const caps = {
  canViewDetail: true,
  canReply: true,
  canEscalate: true,
  allowedNextStatuses: ["PENDING_USER", "RESOLVED"],
};
const ticket = {
  id: "t-a",
  ticketNumber: "CS-A",
  subject: "Ticket A",
  requesterId: "buyer",
  assigneeId: "cs",
  status: "IN_PROGRESS",
  capabilities: caps,
  createdAt: "2026-10-08T00:00:00Z",
};
const dispute = {
  id: "d-a",
  reason: "Dispute A",
  assignedTo: "cs",
  assignedRole: "CUSTOMER_SERVICE",
  status: "OPEN",
  version: 1,
  capabilities: caps,
  order: { buyerId: "buyer", sellerId: "seller", price: 100 },
  createdAt: "2026-10-08T00:00:00Z",
};
function defaultApi(url, options) {
  if (url.includes("/queue?"))
    return Promise.resolve({
      items: [url.includes("/disputes") ? dispute : ticket],
      total: 1,
      totalPages: 1,
    });
  if (url.endsWith("/join"))
    return Promise.resolve({ conversationId: "ticket-room" });
  if (url.endsWith("/conversation"))
    return Promise.resolve({
      conversationId: options.body.side + "-room",
      side: options.body.side,
      readOnly: false,
    });
  return Promise.resolve(url.includes("/disputes") ? dispute : ticket);
}
beforeEach(() => {
  window.history.replaceState(null, "", "/workspace");
  apiFetch.mockReset().mockImplementation(defaultApi);
});

test("table and conversation share filters and open the exact same case", async () => {
  render(
    <CaseWorkspace
      domain="tickets"
      token="token"
      currentUser={{ id: "cs", role: "CUSTOMER_SERVICE" }}
    />,
  );
  await screen.findByRole("button", { name: /Ticket A/ });
  fireEvent.click(screen.getByRole("button", { name: "ตาราง", exact: true }));
  fireEvent.change(screen.getByLabelText("ค้นหาเคส"), {
    target: { value: "Ticket" },
  });
  fireEvent.click(screen.getByRole("button", { name: "เปิดเคส", exact: true }));
  await waitFor(() =>
    expect(screen.getByTestId("room")).toHaveTextContent("ticket-room:false"),
  );
  expect(screen.getByLabelText("ค้นหาตั๋ว")).toHaveValue("Ticket");
  expect(new URLSearchParams(window.location.search).get("case")).toBe("t-a");
  expect(new URLSearchParams(window.location.search).get("view")).toBe(
    "workspace",
  );
});
test("dispute side commits only after join succeeds; failed switching retains buyer", async () => {
  let rejectSeller;
  apiFetch.mockImplementation((url, options) =>
    url.endsWith("/conversation") && options.body.side === "seller"
      ? new Promise((_, reject) => {
          rejectSeller = reject;
        })
      : defaultApi(url, options),
  );
  render(
    <CaseWorkspace
      domain="disputes"
      token="token"
      currentUser={{ id: "cs", role: "CUSTOMER_SERVICE" }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Dispute A/ }));
  await waitFor(() =>
    expect(screen.getByTestId("room")).toHaveTextContent("buyer-room:false"),
  );
  fireEvent.click(screen.getByRole("tab", { name: /ร้านค้า/ }));
  expect(screen.getByRole("tab", { name: /ผู้ซื้อ/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await waitFor(() =>
    expect(screen.getByTestId("room")).toHaveTextContent("buyer-room:true"),
  );
  await act(async () => rejectSeller(new Error("join unavailable")));
  expect(screen.getByTestId("room")).toHaveTextContent("buyer-room:false");
  expect(screen.getByRole("tab", { name: /ผู้ซื้อ/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("join unavailable")).toBeInTheDocument();
});
test("stale detail cannot overwrite a faster second selection", async () => {
  let resolveA;
  const b = { ...ticket, id: "t-b", ticketNumber: "CS-B", subject: "Ticket B" };
  apiFetch.mockImplementation((url, options) => {
    if (url.includes("/queue?"))
      return Promise.resolve({ items: [ticket, b], total: 2, totalPages: 1 });
    if (url.endsWith("/t-a"))
      return new Promise((resolve) => {
        resolveA = resolve;
      });
    if (url.endsWith("/t-b")) return Promise.resolve(b);
    return defaultApi(url, options);
  });
  render(
    <CaseWorkspace domain="tickets" token="token" currentUser={{ id: "cs" }} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Ticket A/ }));
  fireEvent.click(screen.getByRole("button", { name: /Ticket B/ }));
  await screen.findByRole("heading", { name: "Ticket B" });
  await act(async () => resolveA(ticket));
  expect(
    screen.queryByRole("heading", { name: "Ticket A" }),
  ).not.toBeInTheDocument();
});
test("sending/uploading disables mode and private recipient switches", async () => {
  render(
    <CaseWorkspace
      domain="disputes"
      token="token"
      currentUser={{ id: "cs", role: "CUSTOMER_SERVICE" }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Dispute A/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Start upload" }));
  expect(
    screen.getByRole("button", { name: "ตาราง", exact: true }),
  ).toBeDisabled();
  expect(screen.getByRole("tab", { name: /ร้านค้า/ })).toBeDisabled();
});

test("financial confirmation retry keeps the exact verdict key and frozen payload", async () => {
  Object.defineProperty(crypto, "randomUUID", {
    value: () => "verdict-key-test",
    configurable: true,
  });
  let attempts = 0;
  const adminCase = {
    ...dispute,
    assignedTo: "admin",
    assignedRole: "ADMIN",
    capabilities: { canDecide: true, canReply: false },
  };
  apiFetch.mockImplementation((url, options) => {
    if (url.includes("/queue?"))
      return Promise.resolve({ items: [adminCase], total: 1, totalPages: 1 });
    if (url.endsWith("/decision")) {
      attempts++;
      return attempts === 1
        ? Promise.reject(
            Object.assign(new Error("temporary failure"), { status: 503 }),
          )
        : Promise.resolve({
            ...adminCase,
            status: "DECIDED",
            decision: "APPROVE_REFUND",
          });
    }
    if (url.endsWith("/conversation"))
      return Promise.resolve({
        conversationId: "audit-room",
        side: options.body.side,
        readOnly: true,
      });
    return Promise.resolve(
      attempts === 2
        ? { ...adminCase, status: "DECIDED", capabilities: { canReply: false } }
        : adminCase,
    );
  });
  render(
    <CaseWorkspace
      domain="disputes"
      token="token"
      currentUser={{ id: "admin", role: "ADMIN" }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Dispute A/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: "ข้อมูลบริบท", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("เหตุผลประกอบคำตัดสิน"), {
    target: { value: "reviewed evidence" },
  });
  fireEvent.click(screen.getByRole("button", { name: "พิจารณาคืนเงิน" }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยัน", exact: true }));
  await screen.findByText("temporary failure");
  fireEvent.click(screen.getByRole("button", { name: "ยืนยัน", exact: true }));
  await waitFor(() => expect(attempts).toBe(2));
  const calls = apiFetch.mock.calls.filter(([url]) =>
    url.endsWith("/decision"),
  );
  expect(calls[0][1].body).toEqual(calls[1][1].body);
  expect(calls[1][1].body).toMatchObject({
    version: 1,
    reason: "reviewed evidence",
    idempotencyKey: "verdict-key-test",
  });
});
