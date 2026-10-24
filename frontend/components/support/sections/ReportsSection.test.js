import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { apiFetch } from "../../../lib/api";
import ReportsSection from "./ReportsSection";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../ui/ToastProvider", () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock("./case/CaseDrawer", () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));

const report = { id: "report-1", reason: "บัญชีหลอกลวง", targetId: "user-1", reporterId: "buyer-1", status: "OPEN", reportedAt: "2026-10-23T00:00:00Z" };
beforeEach(() => jest.clearAllMocks());

it("requests each report type and owner scope independently without querying escalation services", async () => {
  apiFetch.mockResolvedValue({ items: [], totalPages: 1 });
  render(<ReportsSection token="token" currentUserId="staff-1" />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  expect(new URL(apiFetch.mock.calls[0][0], "http://test").searchParams.get("scope")).toBe("unassigned");
  for (const [label, type] of [["รายงานร้านค้า", "USER"], ["รายงานสินค้า", "PRODUCT"], ["รายงานรีวิว", "COMMENT"]]) {
    fireEvent.click(screen.getByRole("tab", { name: label }));
    await waitFor(() => expect(new URL(apiFetch.mock.calls.at(-1)[0], "http://test").searchParams.get("type")).toBe(type));
  }
  fireEvent.click(screen.getByRole("button", { name: "งานของฉัน" }));
  await waitFor(() => expect(new URL(apiFetch.mock.calls.at(-1)[0], "http://test").searchParams.get("scope")).toBe("mine"));
  expect(new URL(apiFetch.mock.calls.at(-1)[0], "http://test").searchParams.get("type")).toBe("COMMENT");
  expect(apiFetch.mock.calls.every(([url]) => url.startsWith("/api/auth/admin/reports"))).toBe(true);
  expect(screen.queryByRole("tab", { name: "ทิกเก็ต" })).not.toBeInTheDocument();
});

it("moves a claimed report to My Work and opens the owner's decision panel", async () => {
  let claimed = false;
  apiFetch.mockImplementation((url) => {
    if (url.endsWith("/review")) { claimed = true; return Promise.resolve({ ...report, status: "REVIEWED", reviewedBy: "staff-1" }); }
    if (url.endsWith("/report-1")) return Promise.resolve({ ...report, ...(claimed ? { status: "REVIEWED", reviewedBy: "staff-1" } : {}) });
    return Promise.resolve({ items: [report], totalPages: 1 });
  });
  render(<ReportsSection token="token" currentUserId="staff-1" />);
  fireEvent.click(await screen.findByText("บัญชีหลอกลวง"));
  fireEvent.click(await screen.findByRole("button", { name: "รับงานนี้" }));
  expect(await screen.findByText("พิจารณาและจัดการ")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "งานของฉัน" })).toHaveAttribute("aria-pressed", "true");
  expect(apiFetch).toHaveBeenCalledWith("/api/auth/admin/reports/report-1/review", { method: "POST", token: "token" });
  await waitFor(() => expect(apiFetch.mock.calls.some(([url]) => url.includes("scope=mine"))).toBe(true));
});

it("refreshes the shared unassigned queue when returning to the window", async () => {
  let claimedBySomeoneElse = false;
  apiFetch.mockImplementation(() => Promise.resolve({ items: claimedBySomeoneElse ? [] : [report], totalPages: 1 }));
  render(<ReportsSection token="token" currentUserId="staff-1" />);
  expect(await screen.findByText("บัญชีหลอกลวง")).toBeInTheDocument();
  claimedBySomeoneElse = true;
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(screen.queryByText("บัญชีหลอกลวง")).not.toBeInTheDocument());
});
