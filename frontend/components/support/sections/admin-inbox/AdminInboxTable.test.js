import { render, screen, within } from "@testing-library/react";
import AdminInboxTable from "./AdminInboxTable";
import CaseDate from "../case/CaseDate";

const props = { source: "reports", items: [], qInput: "", page: 1, totalPages: 1, onQInputChange: jest.fn(), onSearch: jest.fn() };

it("separates report receipt, claim and decision dates in Thailand time", () => {
  render(<AdminInboxTable {...props} history items={[{
    id: "report-1", ticketNumber: "REP-1", _type: "REPORT", status: "RESOLVED", assigneeId: "staff-1",
    createdAt: "2026-10-22T18:30:00Z",
    rawReport: { reviewedAt: "2026-10-23T01:00:00Z", decidedAt: "2026-10-23T03:00:00Z" },
  }]} />);
  expect(screen.getByRole("columnheader", { name: "วันที่แจ้งรายงาน" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "วันที่รับงาน" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "วันที่ตัดสิน" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "จัดการ" })).not.toBeInTheDocument();
  for (const label of ["เวลา 01:30 น.", "เวลา 08:00 น.", "เวลา 10:00 น."]) expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getAllByText("23 ต.ค. 2569")).toHaveLength(3);
});

it("shows the original ticket receipt separately from its escalation date", () => {
  render(<AdminInboxTable {...props} source="tickets" items={[{
    id: "ticket-1", ticketNumber: "TKT-1", createdAt: "2026-10-21T01:00:00Z", escalatedAt: "2026-10-23T02:00:00Z",
  }]} />);
  expect(screen.getByRole("columnheader", { name: "วันที่แจ้งปัญหา" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "วันที่ส่งต่อ T&S" })).toBeInTheDocument();
  const row = screen.getByText("TKT-1").closest("tr");
  expect(within(row).getByText("21 ต.ค. 2569")).toBeInTheDocument();
  expect(within(row).getByText("23 ต.ค. 2569")).toBeInTheDocument();
});

it("keeps missing and invalid timestamps unknown instead of inventing dates", () => {
  render(<><CaseDate /><CaseDate value="invalid" /></>);
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.queryByText(/Invalid Date|2513/)).not.toBeInTheDocument();
});
