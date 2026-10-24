import { apiFetch } from "./api";
import {
  EMPTY_FILTERS,
  INBOX_PAGE_SIZE,
  MERGED_PER_SOURCE,
  buildInboxPath,
  fetchInbox,
  filterOptions,
  filtersFor,
  inboxRange,
  inboxRangeError,
  statusSummary,
} from "./executiveInbox";

jest.mock("./api", () => ({ apiFetch: jest.fn() }));

// 12:00 Bangkok on 16 October 2026.
const NOW = new Date("2026-10-16T05:00:00.000Z");
const RANGE = { from: "2026-10-16", to: "2026-10-17" };

describe("inboxRange", () => {
  it("is today for 'วันนี้'", () => {
    expect(inboxRange("today", null, NOW)).toEqual(RANGE);
  });

  it("counts today as the last of 7, 15 or 30 days", () => {
    expect(inboxRange("7d", null, NOW)).toEqual({
      from: "2026-10-10",
      to: "2026-10-17",
    });
    expect(inboxRange("15d", null, NOW)).toEqual({
      from: "2026-10-02",
      to: "2026-10-17",
    });
    expect(inboxRange("30d", null, NOW)).toEqual({
      from: "2026-09-17",
      to: "2026-10-17",
    });
  });

  it("includes the last day of a custom range", () => {
    expect(
      inboxRange("custom", { from: "2026-10-01", to: "2026-10-05" }, NOW),
    ).toEqual({ from: "2026-10-01", to: "2026-10-06" });
  });

  it("changes day at Bangkok midnight, not UTC's", () => {
    // 01:00 Bangkok on the 17th is still the 16th in UTC.
    const late = new Date("2026-10-16T18:00:00.000Z");
    expect(inboxRange("today", null, late).from).toBe("2026-10-17");
  });
});

describe("inboxRangeError", () => {
  it("accepts a valid range, one day included", () => {
    expect(inboxRangeError({ from: "2026-10-01", to: "2026-10-16" }, NOW)).toBe(
      "",
    );
    expect(inboxRangeError({ from: "2026-10-16", to: "2026-10-16" }, NOW)).toBe(
      "",
    );
  });

  it("explains what is wrong", () => {
    expect(inboxRangeError({ from: "", to: "2026-10-16" }, NOW)).toMatch(
      /เลือกวันที่/,
    );
    expect(
      inboxRangeError({ from: "2026-10-16", to: "2026-10-01" }, NOW),
    ).toMatch(/ต้องไม่หลัง/);
    expect(
      inboxRangeError({ from: "2026-10-01", to: "2026-10-17" }, NOW),
    ).toMatch(/อนาคต/);
    expect(
      inboxRangeError({ from: "2025-01-01", to: "2026-10-16" }, NOW),
    ).toMatch(/ไม่เกิน 366 วัน/);
  });
});

describe("which filters each kind has", () => {
  it("offers only what that kind can be filtered by", () => {
    expect(filtersFor("all")).toEqual([]);
    expect(filtersFor("report")).toEqual(["status"]);
    expect(filtersFor("ticket")).toEqual(["status", "category", "priority"]);
    expect(filtersFor("dispute")).toEqual(["status", "type", "priority"]);
  });
});

describe("buildInboxPath", () => {
  const query = (path) =>
    Object.fromEntries(new URL(path, "http://x").searchParams);

  it("asks complaints for every status unless one is picked", () => {
    const path = buildInboxPath("report", RANGE, EMPTY_FILTERS, 1, 20);
    expect(path.startsWith("/api/auth/executive/reports?")).toBe(true);
    expect(query(path)).toMatchObject({
      from: "2026-10-16",
      to: "2026-10-17",
      timezone: "Asia/Bangkok",
      status: "ALL",
      sortBy: "newest",
      page: "1",
      limit: "20",
    });
    expect(
      query(
        buildInboxPath(
          "report",
          RANGE,
          { ...EMPTY_FILTERS, status: "OPEN" },
          1,
          20,
        ),
      ).status,
    ).toBe("OPEN");
  });

  it("sends only the filters that were picked, under each service's names", () => {
    const ticket = buildInboxPath(
      "ticket",
      RANGE,
      { ...EMPTY_FILTERS, status: "NEW", category: "ORDER", priority: "HIGH" },
      2,
      20,
    );
    expect(ticket.startsWith("/api/support/executive/tickets?")).toBe(true);
    expect(query(ticket)).toMatchObject({
      status: "NEW",
      category: "ORDER",
      priority: "HIGH",
      page: "2",
    });

    const dispute = buildInboxPath(
      "dispute",
      RANGE,
      { ...EMPTY_FILTERS, type: "DAMAGED_ITEM" },
      1,
      20,
    );
    expect(dispute.startsWith("/api/orders/executive/disputes?")).toBe(true);
    expect(query(dispute).disputeType).toBe("DAMAGED_ITEM");
    expect(query(dispute).status).toBeUndefined();
    expect(query(dispute).category).toBeUndefined();
  });

  it("ignores a filter the kind does not have", () => {
    const path = buildInboxPath(
      "report",
      RANGE,
      { ...EMPTY_FILTERS, priority: "HIGH", category: "ORDER" },
      1,
      20,
    );
    expect(query(path).priority).toBeUndefined();
    expect(query(path).category).toBeUndefined();
  });
});

describe("filterOptions and statusSummary", () => {
  it("labels complaint statuses itself", () => {
    expect(filterOptions("report").status.map((o) => o.value)).toEqual([
      "",
      "OPEN",
      "REVIEWED",
      "ACTIONED",
      "DISMISSED",
    ]);
  });

  it("takes ticket and dispute choices from what the service offers", () => {
    const ticket = filterOptions("ticket", {
      statuses: [{ code: "NEW", name: "NEW" }],
      categories: [{ code: "ORDER", name: "คำสั่งซื้อ" }],
      priorities: [{ code: "HIGH", name: "HIGH" }],
    });
    expect(ticket.status).toEqual([
      { value: "", label: "ทั้งหมด" },
      { value: "NEW", label: "ตั๋วใหม่" },
    ]);
    expect(ticket.category[1]).toEqual({ value: "ORDER", label: "คำสั่งซื้อ" });
    expect(ticket.priority[1]).toEqual({ value: "HIGH", label: "สูง" });

    const dispute = filterOptions("dispute", {
      statuses: ["OPEN"],
      types: ["DAMAGED_ITEM"],
      priorities: ["CRITICAL"],
    });
    expect(dispute.status[1].label).toBe("รอตรวจสอบ");
    expect(dispute.type[1].label).toBe("สินค้าชำรุดหรือเสียหาย");
    expect(dispute.priority[1].label).toBe("วิกฤต");
  });

  it("gives 'all' no choices", () => {
    expect(filterOptions("all")).toEqual({});
  });

  it("summarises how many cases each status has", () => {
    expect(
      statusSummary(
        "dispute",
        { OPEN: 2, DECIDED: 1 },
        { statuses: ["OPEN", "NEEDS_INFO", "DECIDED"] },
      ),
    ).toEqual([
      { code: "OPEN", label: "รอตรวจสอบ", count: 2 },
      { code: "NEEDS_INFO", label: "รอข้อมูล", count: 0 },
      { code: "DECIDED", label: "ตัดสินแล้ว", count: 1 },
    ]);
  });
});

describe("fetchInbox", () => {
  const ticket = (id, createdAt, extra = {}) => ({
    id,
    ticketNumber: `T-${id}`,
    subject: `ticket ${id}`,
    category: { code: "ORDER", name: "คำสั่งซื้อ" },
    priority: { code: "HIGH", name: "HIGH" },
    status: { code: "NEW", name: "NEW", isTerminal: false },
    orderId: null,
    createdAt,
    ...extra,
  });
  const dispute = (id, createdAt) => ({
    id,
    orderId: `order-${id}-abcdefgh`,
    disputeType: "DAMAGED_ITEM",
    status: "OPEN",
    priority: "NORMAL",
    reason: `dispute ${id}`,
    decision: null,
    createdAt,
  });
  const list = (items, total = items.length, options = {}) => ({
    items,
    total,
    page: 1,
    limit: 20,
    totalPages: Math.max(1, Math.ceil(total / 20)),
    statusCounts: { NEW: items.length, OPEN: items.length },
    options,
  });
  const report = (id, reportedAt) => ({
    id,
    reason: `report ${id}`,
    category: "OTHER",
    status: "OPEN",
    actionTaken: null,
    actionDetails: null,
    reportedAt,
    targetId: null,
    targetName: null,
    targetShopName: null,
    targetReportCount: 1,
    productId: null,
    reporterName: "A B",
  });
  const reportList = (items) => ({
    data: {
      items,
      total: items.length,
      page: 1,
      limit: 20,
      // The service counts no pages for no complaints.
      totalPages: Math.ceil(items.length / 20),
      statusCounts: { OPEN: items.length },
      totalOpen: items.length,
      topReported: [],
      anomalySummary: { detected: false, threshold: 3, highRiskTargets: [] },
    },
  });

  beforeEach(() => apiFetch.mockReset());

  it("reads one kind a page at a time", async () => {
    apiFetch.mockResolvedValue(
      list([ticket("1", "2026-10-16T03:00:00.000Z")], 45, {
        statuses: [{ code: "NEW", name: "NEW" }],
      }),
    );

    const result = await fetchInbox({
      source: "ticket",
      range: RANGE,
      filters: EMPTY_FILTERS,
      page: 2,
      token: "t",
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toContain("/api/support/executive/tickets?");
    expect(path).toContain("page=2");
    expect(path).toContain(`limit=${INBOX_PAGE_SIZE}`);
    expect(init).toEqual({ token: "t" });
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3);
    expect(result.items[0]).toMatchObject({
      key: "ticket:1",
      source: "ticket",
      title: "ticket 1",
      reference: "T-1",
      status: { code: "NEW", label: "ตั๋วใหม่" },
      tags: ["คำสั่งซื้อ", "สูง"],
    });
    expect(result.failed).toEqual([]);
  });

  it("merges every kind newest first and takes the page size per kind", async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path.includes("/reports")) {
        return reportList([report("r1", "2026-10-16T04:00:00.000Z")]);
      }
      if (path.includes("/tickets")) {
        return list([ticket("t1", "2026-10-16T06:00:00.000Z")]);
      }
      return list([dispute("d1", "2026-10-16T05:00:00.000Z")]);
    });

    const result = await fetchInbox({
      source: "all",
      range: RANGE,
      filters: { ...EMPTY_FILTERS, status: "OPEN" },
      page: 1,
      token: "t",
    });

    expect(result.items.map((i) => i.key)).toEqual([
      "ticket:t1",
      "dispute:d1",
      "report:r1",
    ]);
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
    // The filters belong to one kind; "all" sends none of them.
    for (const [path] of apiFetch.mock.calls) {
      expect(path).toContain(`limit=${MERGED_PER_SOURCE}`);
      expect(path).not.toContain("priority=");
    }
    expect(
      apiFetch.mock.calls.find(([p]) => p.includes("/reports"))[0],
    ).toContain("status=ALL");
  });

  it("says when a kind has more than was taken", async () => {
    apiFetch.mockImplementation(async (path) =>
      path.includes("/tickets")
        ? list([ticket("t1", "2026-10-16T06:00:00.000Z")], 120)
        : path.includes("/reports")
          ? reportList([])
          : list([]),
    );
    const result = await fetchInbox({
      source: "all",
      range: RANGE,
      filters: EMPTY_FILTERS,
      page: 1,
      token: "t",
    });
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(120);
  });

  it("keeps the other kinds when one service is down, and names it", async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path.includes("/tickets")) throw new Error("support unreachable");
      if (path.includes("/reports")) return reportList([]);
      return list([dispute("d1", "2026-10-16T05:00:00.000Z")]);
    });

    const result = await fetchInbox({
      source: "all",
      range: RANGE,
      filters: EMPTY_FILTERS,
      page: 1,
      token: "t",
    });

    expect(result.failed).toEqual(["ticket"]);
    expect(result.items.map((i) => i.key)).toEqual(["dispute:d1"]);
    expect(result.results.ticket).toBeUndefined();
  });

  it("treats an answer it cannot read as the service being unavailable", async () => {
    apiFetch.mockResolvedValue({ items: "nope" });
    const result = await fetchInbox({
      source: "dispute",
      range: RANGE,
      filters: EMPTY_FILTERS,
      page: 1,
      token: "t",
    });
    expect(result.failed).toEqual(["dispute"]);
    expect(result.items).toEqual([]);
  });

  it("names a dispute by its type, priority and decision", async () => {
    apiFetch.mockResolvedValue(
      list([
        {
          ...dispute("d1", "2026-10-16T05:00:00.000Z"),
          referenceCode: "DSP-7K3M-9X2R-4T6W",
          decision: "REJECT",
          status: "DECIDED",
        },
      ]),
    );
    const result = await fetchInbox({
      source: "dispute",
      range: RANGE,
      filters: EMPTY_FILTERS,
      page: 1,
      token: "t",
    });
    expect(result.items[0]).toMatchObject({
      reference: "DSP-7K3M-9X2R-4T6W",
      status: { label: "ตัดสินแล้ว" },
      tags: ["สินค้าชำรุดหรือเสียหาย", "ปานกลาง", "ไม่อนุมัติคำร้อง"],
    });
  });
});
