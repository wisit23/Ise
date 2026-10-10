import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  default: () => <div>ticket detail</div>,
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

it("keeps report and escalated-ticket pagination independent", async () => {
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

  render(<AdminInboxSection token="token" />);
  expect(await screen.findByText("Report page 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "3" }));
  expect(await screen.findByText("Report page 3")).toBeInTheDocument();
  expect(apiFetch.mock.calls.map(([url]) => url)).toEqual(
    expect.arrayContaining([expect.stringContaining("page=3")]),
  );

  fireEvent.click(screen.getByRole("tab", { name: "เคสส่งต่อ" }));
  expect(screen.getByRole("button", { name: "7" })).toBeInTheDocument();
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
  render(<AdminInboxSection token="token" />);

  const input = screen.getByRole("textbox", { name: "ค้นหาเคส" });
  fireEvent.change(input, { target: { value: "counterfeit" } });
  fireEvent.submit(input.closest("form"));

  await waitFor(() =>
    expect(apiFetch.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /\/api\/auth\/admin\/reports\?.*page=1.*limit=15.*status=OPEN.*q=counterfeit/,
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

  render(<AdminInboxSection token="token" />);
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

  render(<AdminInboxSection token="token" />);
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
