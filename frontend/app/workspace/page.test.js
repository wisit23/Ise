import { render, screen, waitFor, within } from "@testing-library/react";

import { getStoredUser } from "../../lib/auth";
import { navigateWorkspaceSection } from "../../components/support/workspace/useCaseWorkspace";
import SupportPanelPage from "./page";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../lib/auth", () => ({
  getAccessToken: () => "token",
  getStoredUser: jest.fn(),
}));
jest.mock("../../components/support/workspace/useCaseWorkspace", () => ({
  navigateWorkspaceSection: jest.fn(),
}));
jest.mock("../../components/NavBar", () => ({
  __esModule: true,
  default: () => <div>navbar</div>,
}));
jest.mock("../../components/support/sections/DashboardSection", () => ({
  __esModule: true,
  default: () => <div>dashboard</div>,
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, "", "/workspace");
});

it("keeps Tickets and Disputes for CS but removes them from Trust and Safety", async () => {
  for (const role of ["TRUST_AND_SAFETY", "ADMIN"]) {
    getStoredUser.mockReturnValue({ id: "safety-1", role, roles: [] });
    const { unmount } = render(<SupportPanelPage />);
    const safetyMenu = within(screen.getByRole("navigation"));
    expect(await safetyMenu.findByRole("button", { name: "เคสส่งต่อ" })).toBeInTheDocument();
    expect(safetyMenu.queryByRole("button", { name: "Tickets" })).not.toBeInTheDocument();
    expect(safetyMenu.queryByRole("button", { name: "Disputes" })).not.toBeInTheDocument();
    unmount();
  }

  getStoredUser.mockReturnValue({ id: "cs-1", role: "CUSTOMER_SERVICE", roles: [] });
  render(<SupportPanelPage />);
  const csMenu = within(screen.getByRole("navigation"));
  expect(await csMenu.findByRole("button", { name: "Tickets" })).toBeInTheDocument();
  expect(csMenu.getByRole("button", { name: "Disputes" })).toBeInTheDocument();
});

it.each(["tickets", "disputes"])("returns old Trust and Safety %s links to the dashboard", async (section) => {
  window.history.replaceState({}, "", `/workspace?section=${section}`);
  getStoredUser.mockReturnValue({ id: "safety-1", role: "TRUST_AND_SAFETY", roles: [] });

  render(<SupportPanelPage />);

  await waitFor(() => expect(navigateWorkspaceSection).toHaveBeenCalledWith("dashboard", "safety-1"));
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
});
