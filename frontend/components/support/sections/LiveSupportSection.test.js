import { act, fireEvent, render, screen } from "@testing-library/react";
import LiveSupportSection from "./LiveSupportSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../ui/ToastProvider", () => {
  const toast = { error: jest.fn(), success: jest.fn() };
  return { useToast: () => toast };
});
jest.mock("./live-support/SupportMainChat", () => ({
  __esModule: true,
  default: ({ ticket, onToggleDetails, onAssignTicket }) => (
    <div>
      <span data-testid="ticket">{ticket?.subject || "loading"}</span>
      <button onClick={onToggleDetails}>Details</button>
      <button onClick={onAssignTicket}>Assign</button>
    </div>
  ),
}));
jest.mock("./live-support/SupportCaseDetails", () => ({
  __esModule: true,
  default: ({ onClose }) => (
    <div role="dialog">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const tickets = [
  { id: "a", ticketNumber: "A", subject: "Ticket A", status: "NEW" },
  { id: "b", ticketNumber: "B", subject: "Ticket B", status: "NEW" },
];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

it("ignores an old ticket response after a faster second selection", async () => {
  let resolveA;
  apiFetch.mockImplementation((url) => {
    if (url.includes("/queue?")) return Promise.resolve({ items: tickets });
    if (url.endsWith("/a"))
      return new Promise((resolve) => {
        resolveA = resolve;
      });
    return Promise.resolve(tickets[1]);
  });
  render(<LiveSupportSection token="test" />);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  fireEvent.click(screen.getByRole("button", { name: /Ticket A/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Ticket B/ }));
  });
  expect(screen.getByTestId("ticket")).toHaveTextContent("Ticket B");
  await act(async () => {
    resolveA(tickets[0]);
  });
  expect(screen.getByTestId("ticket")).toHaveTextContent("Ticket B");
});

it("keeps the details mounted until the exit motion finishes", async () => {
  apiFetch.mockResolvedValue({ items: tickets });
  render(<LiveSupportSection token="test" />);
  fireEvent.click(screen.getByText("Details"));
  fireEvent.click(screen.getByText("Close"));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => {
    jest.advanceTimersByTime(220);
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("opens a claimed ticket in the mine queue without losing the selection", async () => {
  let assigned = false;
  apiFetch.mockImplementation((url) => {
    if (url.includes("/queue?")) {
      const scope = new URL(`http://localhost${url}`).searchParams.get("scope");
      return Promise.resolve({ items: scope === "mine" && !assigned ? [] : [tickets[0]] });
    }
    if (url.endsWith("/a/assign")) {
      assigned = true;
      return Promise.resolve({});
    }
    if (url.endsWith("/a/join")) return Promise.resolve({ conversationId: "room-a" });
    return Promise.resolve(tickets[0]);
  });

  render(<LiveSupportSection token="test" />);
  fireEvent.click(screen.getByRole("button", { name: "รอรับเรื่อง" }));
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  fireEvent.click(screen.getByRole("button", { name: /Ticket A/ }));
  await act(async () => {});
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
  });
  expect(screen.getByRole("button", { name: "งานของฉัน" })).toHaveAttribute("aria-pressed", "true");
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(screen.getByTestId("ticket")).toHaveTextContent("Ticket A");
  expect(screen.getByRole("button", { name: /Ticket A/ })).toHaveAttribute("aria-current", "true");
});
