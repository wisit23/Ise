import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { apiFetch } from "../../../lib/api";
import AdminInboxSection from "./AdminInboxSection";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../ui/ToastProvider", () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock("./case/CaseDrawer", () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));

beforeEach(() => jest.clearAllMocks());

it.each([["user-1", "SUSPEND_USER", "Suspend Account"], [null, "DISMISS", "Dismiss Report"]])(
  "submits the displayed default decision without reselecting it (target=%s)",
  async (targetId, expectedDecision, label) => {
    apiFetch.mockImplementation((url) => {
      if (url === "/api/auth/admin/reports/report-1") return Promise.resolve({ id: "report-1", targetId, status: "REVIEWED", reviewedBy: "staff-1", evidence: [], reason: "รายงานทดสอบ" });
      return Promise.resolve({ items: [], totalPages: 1 });
    });
    render(<AdminInboxSection token="token" currentUserId="staff-1" initialReportId="report-1" />);
    expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
    // Opening a case does not perform the default action.
    expect(apiFetch.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("ระบุเหตุผลในการตัดสินใจ..."), { target: { value: "ตรวจสอบหลักฐานแล้ว" } });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการพิจารณา" }));
    expect(await screen.findByRole("dialog", { name: "ยืนยันการตัดสินรายงาน" })).toBeInTheDocument();
    expect(screen.queryByText("กรุณาเลือกการตัดสินใจ")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันคำสั่ง" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/auth/admin/reports/report-1/action", { method: "POST", token: "token", body: { decision: expectedDecision, reason: "ตรวจสอบหลักฐานแล้ว" } }));
  },
);
