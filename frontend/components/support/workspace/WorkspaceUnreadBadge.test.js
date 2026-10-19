import { render, screen } from "@testing-library/react";
import WorkspaceUnreadBadge from "./WorkspaceUnreadBadge";
import useCaseUnread from "./useCaseUnread";

jest.mock("./useCaseUnread", () => ({ __esModule: true, default: jest.fn() }));
const props = { domain: "tickets", token: "test-token", account: "agent-1", active: false, collapsed: false };

it("uses the domain total and hides once messages are read", () => {
  useCaseUnread.mockReturnValue({ summary: { scopes: { mine: 2, all: 7 } } });
  const { rerender } = render(<WorkspaceUnreadBadge {...props} />);
  expect(screen.getByText("7")).toBeInTheDocument();
  expect(useCaseUnread).toHaveBeenCalledWith("tickets", "test-token", "agent-1");
  useCaseUnread.mockReturnValue({ summary: { scopes: { all: 0 } } });
  rerender(<WorkspaceUnreadBadge {...props} />);
  expect(screen.queryByText(/มีข้อความใหม่/)).not.toBeInTheDocument();
});

it("caps the visible count while preserving the accessible total", () => {
  useCaseUnread.mockReturnValue({ summary: { scopes: { all: 120 } } });
  render(<WorkspaceUnreadBadge {...props} domain="disputes" active />);
  expect(screen.getByText("99+")).toBeInTheDocument();
  expect(screen.getByText("มีข้อความใหม่ 120 เคส")).toBeInTheDocument();
  expect(useCaseUnread).toHaveBeenCalledWith("disputes", "test-token", "agent-1");
});

it("keeps an accessible count in collapsed mode without visible digits", () => {
  useCaseUnread.mockReturnValue({ summary: { scopes: { all: 4 } } });
  render(<WorkspaceUnreadBadge {...props} collapsed />);
  expect(screen.getByText("มีข้อความใหม่ 4 เคส")).toBeInTheDocument();
  expect(screen.queryByText("4")).not.toBeInTheDocument();
});

it("does not invent a count before the summary is available", () => {
  useCaseUnread.mockReturnValue({ summary: null });
  const { container } = render(<WorkspaceUnreadBadge {...props} />);
  expect(container).toBeEmptyDOMElement();
});