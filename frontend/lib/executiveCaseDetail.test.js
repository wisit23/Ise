import { apiFetch } from "./api";
import {
  fetchCaseDetail,
  hasCaseDetail,
  isOverdue,
  personLabel,
} from "./executiveCaseDetail";

jest.mock("./api", () => ({ apiFetch: jest.fn() }));

const disputeDetail = {
  id: "d/1",
  createdAt: "2026-10-20T05:00:00Z",
  reason: "ของชำรุด",
  status: "OPEN",
  disputeType: "DAMAGED_ITEM",
  priority: "HIGH",
  order: { id: "order-1", amount: 500, orderType: "BUY_NOW" },
};
const ticketDetail = {
  id: "t1",
  createdAt: "2026-10-20T05:00:00Z",
  ticketNumber: "TK-1",
  subject: "ขอความช่วยเหลือ",
  status: { code: "NEW", name: "NEW" },
  handling: null,
};

describe("fetchCaseDetail", () => {
  beforeEach(() => apiFetch.mockReset());

  it("asks the service that owns the case, through the gateway", async () => {
    apiFetch.mockResolvedValue({ data: disputeDetail, meta: {} });
    await fetchCaseDetail("dispute", "d/1", "t");
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/executive/disputes/d%2F1",
      { token: "t", timeoutMs: 15000 },
    );

    apiFetch.mockResolvedValue({
      data: ticketDetail,
      meta: {},
    });
    await fetchCaseDetail("ticket", "t1", "t");
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/support/executive/tickets/t1",
      { token: "t", timeoutMs: 15000 },
    );
  });

  it("refuses an answer it cannot show", async () => {
    apiFetch.mockResolvedValue({ nope: true });
    await expect(fetchCaseDetail("dispute", "d1", "t")).rejects.toThrow();
    apiFetch.mockResolvedValue({ data: { id: "t1" } });
    await expect(fetchCaseDetail("ticket", "t1", "t")).rejects.toThrow();
  });

  it("has details for tickets and disputes only", () => {
    expect(hasCaseDetail("ticket")).toBe(true);
    expect(hasCaseDetail("dispute")).toBe(true);
    expect(hasCaseDetail("report")).toBe(false);
    expect(hasCaseDetail("toString")).toBe(false);
  });

  it.each([
    { ...disputeDetail, order: null },
    { ...disputeDetail, order: { id: "order-1", amount: "500" } },
    { ...disputeDetail, reason: {} },
    { ...disputeDetail, assignee: { id: "staff", name: [] } },
    { ...disputeDetail, buyer: { id: "user", roles: [123] } },
    { ...disputeDetail, createdAt: "invalid" },
    { ...disputeDetail, id: "another-case" },
  ])("rejects malformed dispute details before rendering", async (data) => {
    apiFetch.mockResolvedValue({ data });
    await expect(fetchCaseDetail("dispute", "d/1", "t")).rejects.toThrow(
      "ข้อมูลรายละเอียด",
    );
  });

  it("rejects malformed ticket handling and unsupported case kinds", async () => {
    apiFetch.mockResolvedValue({
      data: { ...ticketDetail, handling: { at: "invalid" } },
    });
    await expect(fetchCaseDetail("ticket", "t1", "t")).rejects.toThrow();
    apiFetch.mockClear();
    await expect(fetchCaseDetail("constructor", "t1", "t")).rejects.toThrow();
    await expect(fetchCaseDetail("dispute", " ", "t")).rejects.toThrow();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("personLabel", () => {
  it("tells a missing directory apart from an unknown person", () => {
    expect(personLabel({ id: "u1", name: "มาลี" }, true)).toBe("มาลี");
    expect(personLabel({ id: "u1", name: null }, true)).toBe("ไม่ทราบชื่อ");
    expect(personLabel({ id: "u1", name: null }, false)).toBe("ไม่พร้อมใช้งาน");
    expect(personLabel(null, true)).toBe("-");
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-10-20T05:00:00.000Z");

  it("is overdue only while undecided and past the due time", () => {
    expect(
      isOverdue(
        { decision: null, decisionDueAt: "2026-10-20T04:00:00.000Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isOverdue(
        { decision: null, decisionDueAt: "2026-10-20T06:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isOverdue(
        { decision: "REJECT", decisionDueAt: "2026-10-20T04:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(isOverdue({ decision: null, decisionDueAt: null }, now)).toBe(false);
  });
});
