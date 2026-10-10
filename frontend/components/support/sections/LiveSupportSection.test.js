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
  default: ({ ticket, onToggleDetails }) => (
    <div>
      <span data-testid="ticket">{ticket?.subject || "loading"}</span>
      <button onClick={onToggleDetails}>Details</button>
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
