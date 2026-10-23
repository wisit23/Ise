import { render, screen, within } from "@testing-library/react";
import CaseDetailsModal from "./CaseDetailsModal";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

const OPEN_DISPUTE = {
  id: "d1",
  reason: "ของแตก",
  disputeType: "DAMAGED_ITEM",
  status: "OPEN",
  priority: "URGENT",
  createdAt: "2026-10-18T05:00:00.000Z",
  order: { id: "order-1", amount: 500, orderType: "BUY_NOW" },
  product: { id: "p1", title: null },
  buyer: { id: "u-buyer", name: null },
  seller: { id: "u-seller", name: null },
  assignee: null,
  assignedRole: null,
  assignedAt: null,
  decision: null,
  decisionReason: null,
  decider: null,
  decidedAt: null,
  // Long past: the case is late.
  decisionDueAt: "2026-10-19T05:00:00.000Z",
};

describe("CaseDetailsModal", () => {
  beforeEach(() => apiFetch.mockReset());

  it("shows an undecided dispute's due time, and that it is late", async () => {
    apiFetch.mockResolvedValue({
      data: OPEN_DISPUTE,
      meta: { namesAvailable: true, productAvailable: true },
    });
    render(
      <CaseDetailsModal
        item={{ source: "dispute", id: "d1" }}
        token="t"
        onClose={() => {}}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("ยังไม่ตัดสิน")).toBeVisible();
    expect(within(dialog).getByText("เกินกำหนด")).toBeVisible();
    expect(within(dialog).getByText("ยังไม่มีผู้รับเรื่อง")).toBeVisible();
    // No decider shown before there is a decision.
    expect(within(dialog).queryByText("ผู้ตัดสิน")).toBeNull();
  });

  it("says names are unavailable, not unknown, when the directory is down", async () => {
    apiFetch.mockResolvedValue({
      data: OPEN_DISPUTE,
      meta: { namesAvailable: false, productAvailable: false },
    });
    render(
      <CaseDetailsModal
        item={{ source: "dispute", id: "d1" }}
        token="t"
        onClose={() => {}}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(/ระบบรายชื่อผู้ใช้ไม่พร้อมใช้งาน/),
    ).toBeVisible();
    // Buyer, seller and product all read as unavailable; the ids still show.
    expect(within(dialog).getAllByText("ไม่พร้อมใช้งาน")).toHaveLength(3);
    expect(within(dialog).getByText("u-buyer")).toBeVisible();
  });

  it("does not load anything while closed", () => {
    render(<CaseDetailsModal item={null} token="t" onClose={() => {}} />);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
