import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import ComplaintsSection from "./ComplaintsSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

const META = { definitionVersion: "v1", timezone: "Asia/Bangkok" };

const REPORT = {
  id: "r1",
  reason: "ร้านไม่ส่งของ",
  category: "FRAUD",
  status: "OPEN",
  actionTaken: null,
  actionDetails: null,
  reportedAt: "2026-10-16T04:00:00.000Z",
  targetId: "target-1",
  targetName: "สมชาย",
  targetShopName: "ร้านสมชาย",
  targetReportCount: 1,
  productId: null,
  reporterName: "มาลี ใจดี",
};
const TICKET = {
  id: "t1",
  ticketNumber: "TK-0001",
  subject: "จ่ายเงินแล้วไม่ได้รับของ",
  category: { code: "PAYMENT", name: "การชำระเงิน" },
  priority: { code: "HIGH", name: "HIGH" },
  status: { code: "NEW", name: "NEW", isTerminal: false },
  orderId: null,
  createdAt: "2026-10-16T06:00:00.000Z",
};
const DISPUTE = {
  id: "d1",
  orderId: "order-9999-abcdef",
  disputeType: "DAMAGED_ITEM",
  status: "OPEN",
  priority: "URGENT",
  reason: "กระเป๋าขาด",
  decision: null,
  createdAt: "2026-10-16T05:00:00.000Z",
};

const TICKET_OPTIONS = {
  statuses: [
    { code: "NEW", name: "NEW" },
    { code: "CLOSED", name: "CLOSED" },
  ],
  categories: [
    { code: "ORDER", name: "คำสั่งซื้อ" },
    { code: "PAYMENT", name: "การชำระเงิน" },
  ],
  priorities: [
    { code: "LOW", name: "LOW" },
    { code: "HIGH", name: "HIGH" },
  ],
};
const DISPUTE_OPTIONS = {
  statuses: ["OPEN", "NEEDS_INFO", "DECIDED"],
  types: ["ITEM_NOT_AS_DESCRIBED", "DAMAGED_ITEM", "WRONG_ITEM", "OTHER"],
  priorities: ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"],
};

const reportAnswer = (items = [REPORT], anomaly) => ({
  data: {
    items,
    total: items.length,
    page: 1,
    limit: 20,
    totalPages: Math.ceil(items.length / 20),
    statusCounts: { OPEN: items.length },
    totalOpen: items.length,
    topReported: [],
    anomalySummary: anomaly || {
      detected: false,
      threshold: 3,
      highRiskTargets: [],
    },
  },
  meta: META,
});
const listAnswer = (items, options) => ({
  items,
  total: items.length,
  page: 1,
  limit: 20,
  totalPages: Math.ceil(items.length / 20),
  statusCounts: { NEW: items.length, OPEN: items.length },
  options,
  meta: META,
});

/** Routes each service's path to its answer; `overrides` replaces one. */
function serve(overrides = {}) {
  apiFetch.mockImplementation(async (path) => {
    const key = Object.keys(overrides).find((name) => path.includes(name));
    if (key) return overrides[key](path);
    if (path.includes("/api/auth/executive/reports")) return reportAnswer();
    if (path.includes("/api/support/executive/tickets")) {
      return listAnswer([TICKET], TICKET_OPTIONS);
    }
    if (path.includes("/api/orders/executive/disputes")) {
      return listAnswer([DISPUTE], DISPUTE_OPTIONS);
    }
    throw new Error(`unexpected path ${path}`);
  });
}

const pathsFor = (name) =>
  apiFetch.mock.calls.map(([path]) => path).filter((p) => p.includes(name));

// 12:00 Bangkok on 16 October 2026.
const NOW = new Date("2026-10-16T05:00:00.000Z");

function pick(name, option) {
  fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.click(screen.getByRole("radio", { name: option }));
}

describe("ComplaintsSection", () => {
  it("returns to the last available page when the queue shrinks", async () => {
    let shrunk = false;
    serve({
      "/api/support/executive/tickets": async (path) => {
        const page = Number(
          new URL(path, "http://test.local").searchParams.get("page"),
        );
        const response = listAnswer(shrunk ? [] : [TICKET], TICKET_OPTIONS);
        response.total = shrunk ? 1 : 21;
        response.totalPages = shrunk ? 1 : 2;
        response.page = page;
        if (page === 2) {
          shrunk = true;
          response.items = [];
          response.total = 1;
          response.totalPages = 1;
        } else if (shrunk) {
          response.items = [TICKET];
        }
        return response;
      },
    });
    render(<ComplaintsSection token="t" />);
    await screen.findByText(TICKET.subject);
    pick("ประเภทเรื่อง", "Ticket");
    await screen.findByRole("button", { name: "ถัดไป" });
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    await waitFor(() =>
      expect(pathsFor("/tickets").some((path) => path.includes("page=2"))).toBe(
        true,
      ),
    );
    await waitFor(() =>
      expect(pathsFor("/tickets").at(-1)).toContain("page=1"),
    );
    expect(await screen.findByText(TICKET.subject)).toBeVisible();
  });
  beforeEach(() => {
    apiFetch.mockReset();
    jest.useFakeTimers({ doNotFake: ["setTimeout", "queueMicrotask"] });
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it("starts on everything, today, with every kind merged newest first", async () => {
    serve();
    render(<ComplaintsSection token="t" />);

    expect(await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ")).toBeVisible();

    // Each service is asked for today in Bangkok time.
    for (const name of [
      "/api/auth/executive/reports",
      "/api/support/executive/tickets",
      "/api/orders/executive/disputes",
    ]) {
      const [path] = pathsFor(name);
      expect(path).toContain("from=2026-10-16");
      expect(path).toContain("to=2026-10-17");
      expect(path).toContain("timezone=Asia%2FBangkok");
    }

    // 06:00Z ticket, 05:00Z dispute, 04:00Z complaint.
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("จ่ายเงินแล้วไม่ได้รับของ");
    expect(rows[1]).toContain("กระเป๋าขาด");
    expect(rows[2]).toContain("ร้านไม่ส่งของ");
    expect(screen.getByText("3 รายการ")).toBeVisible();
  });

  it("searches every kind by what is typed once typing pauses", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    const box = screen.getByLabelText("ค้นหาด้วยรหัส");
    fireEvent.change(box, { target: { value: " rpt-8ax4 " } });
    // Let the typing pause pass inside act, so the page has applied it.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    // Sent as typed (trimmed), to all three services, after the pause.
    await waitFor(
      () =>
        expect(pathsFor("/api/auth/executive/reports").at(-1)).toContain(
          "q=rpt-8ax4",
        ),
      { timeout: 3000 },
    );
    expect(pathsFor("/api/support/executive/tickets").at(-1)).toContain(
      "q=rpt-8ax4",
    );
    expect(pathsFor("/api/orders/executive/disputes").at(-1)).toContain(
      "q=rpt-8ax4",
    );

    // Picking one kind keeps the search.
    pick("ประเภทเรื่อง", "Ticket");
    await waitFor(
      () =>
        expect(pathsFor("/api/support/executive/tickets").at(-1)).toContain(
          "q=rpt-8ax4",
        ),
      { timeout: 3000 },
    );
  });

  it("searches by a shop's name, in Thai, exactly as typed", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    const box = screen.getByLabelText("ค้นหาด้วยรหัส");
    fireEvent.change(box, { target: { value: "ร้านยีนส์ 50%" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    await waitFor(
      () => {
        for (const name of [
          "/api/auth/executive/reports",
          "/api/support/executive/tickets",
          "/api/orders/executive/disputes",
        ]) {
          const params = new URLSearchParams(
            pathsFor(name).at(-1).split("?")[1],
          );
          expect(params.get("q")).toBe("ร้านยีนส์ 50%");
        }
      },
      { timeout: 3000 },
    );
    // The box takes nothing longer than the services accept.
    expect(box).toHaveAttribute("maxlength", "100");
  });

  it("offers no kind-specific filters while looking at everything", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    expect(screen.getByRole("button", { name: "ประเภทเรื่อง" })).toBeVisible();
    for (const name of [
      "สถานะ",
      "หมวดหมู่",
      "ประเภทข้อพิพาท",
      "ความเร่งด่วน",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("shows only the complaint filter for complaints", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    pick("ประเภทเรื่อง", "ข้อร้องเรียน");

    expect(await screen.findByRole("button", { name: "สถานะ" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "หมวดหมู่" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ความเร่งด่วน" })).toBeNull();
    // The list follows the kind: only complaints are left.
    await waitFor(() =>
      expect(screen.queryByText("จ่ายเงินแล้วไม่ได้รับของ")).toBeNull(),
    );
    expect(screen.getByText("ร้านไม่ส่งของ")).toBeVisible();
  });

  it("gives tickets a status, a category and a priority", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    pick("ประเภทเรื่อง", "Ticket");
    await screen.findByRole("button", { name: "หมวดหมู่" });
    expect(screen.getByRole("button", { name: "สถานะ" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ความเร่งด่วน" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "ประเภทข้อพิพาท" })).toBeNull();

    // The choices come from the service.
    pick("หมวดหมู่", "การชำระเงิน");
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");
    const asked = pathsFor("/api/support/executive/tickets").at(-1);
    expect(asked).toContain("category=PAYMENT");
    expect(asked).not.toContain("priority=");
  });

  it("gives disputes a status, a dispute type and a priority", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    pick("ประเภทเรื่อง", "ข้อพิพาท");
    await screen.findByRole("button", { name: "ประเภทข้อพิพาท" });
    expect(screen.getByRole("button", { name: "สถานะ" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ความเร่งด่วน" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "หมวดหมู่" })).toBeNull();

    pick("ประเภทข้อพิพาท", "สินค้าชำรุดหรือเสียหาย");
    await screen.findByText("กระเป๋าขาด");
    expect(pathsFor("/api/orders/executive/disputes").at(-1)).toContain(
      "disputeType=DAMAGED_ITEM",
    );
  });

  it("clears the filters when the kind changes", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    pick("ประเภทเรื่อง", "Ticket");
    await screen.findByRole("button", { name: "หมวดหมู่" });
    pick("หมวดหมู่", "การชำระเงิน");
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    pick("ประเภทเรื่อง", "ข้อพิพาท");
    await screen.findByText("กระเป๋าขาด");
    // The new kind starts unfiltered; nothing of the old filter is sent.
    expect(pathsFor("/api/orders/executive/disputes").at(-1)).not.toContain(
      "PAYMENT",
    );
  });

  it("filters by status from the counts under the filters", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    pick("ประเภทเรื่อง", "Ticket");
    const chip = await screen.findByRole("button", { name: /ตั๋วใหม่ 1/ });
    fireEvent.click(chip);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");
    expect(pathsFor("/api/support/executive/tickets").at(-1)).toContain(
      "status=NEW",
    );
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("changes the window with the period buttons", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    fireEvent.click(screen.getByRole("radio", { name: "7 วัน" }));
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");
    let latest = pathsFor("/api/support/executive/tickets").at(-1);
    expect(latest).toContain("from=2026-10-10");
    expect(latest).toContain("to=2026-10-17");

    fireEvent.click(screen.getByRole("radio", { name: "30 วัน" }));
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");
    latest = pathsFor("/api/support/executive/tickets").at(-1);
    expect(latest).toContain("from=2026-09-17");
  });

  it("reads a custom range from two date fields, the last day included", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    expect(screen.queryByLabelText("ตั้งแต่วันที่")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "กำหนดเอง" }));
    fireEvent.change(screen.getByLabelText("ตั้งแต่วันที่"), {
      target: { value: "01/10/2569" },
    });
    fireEvent.change(screen.getByLabelText("ถึงวันที่"), {
      target: { value: "05/10/2569" },
    });

    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");
    const latest = pathsFor("/api/support/executive/tickets").at(-1);
    expect(latest).toContain("from=2026-10-01");
    expect(latest).toContain("to=2026-10-06");
  });

  it("refuses a range that ends before it starts and keeps the last good list", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");
    fireEvent.click(screen.getByRole("radio", { name: "กำหนดเอง" }));
    await screen.findByLabelText("ถึงวันที่");
    const calls = apiFetch.mock.calls.length;

    fireEvent.change(screen.getByLabelText("ตั้งแต่วันที่"), {
      target: { value: "10/10/2569" },
    });
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");
    const afterFrom = apiFetch.mock.calls.length;
    expect(afterFrom).toBeGreaterThan(calls);

    fireEvent.change(screen.getByLabelText("ถึงวันที่"), {
      target: { value: "01/10/2569" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด",
    );
    expect(apiFetch.mock.calls.length).toBe(afterFrom);
    expect(screen.getByText("จ่ายเงินแล้วไม่ได้รับของ")).toBeVisible();
  });

  it("says which service is unavailable and keeps showing the others", async () => {
    serve({
      "/api/support/executive/tickets": () =>
        Promise.reject(new Error("support unreachable")),
    });
    render(<ComplaintsSection token="t" />);

    expect(await screen.findByText("กระเป๋าขาด")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ticket ไม่พร้อมใช้งานในขณะนี้",
    );
    // Its count says so on its card; it is not shown as zero.
    expect(screen.getByText("ไม่พร้อมใช้งาน")).toBeVisible();
  });

  it("says nothing was found, not an error, when the period is empty", async () => {
    serve({
      "/api/auth/executive/reports": () => reportAnswer([]),
      "/api/support/executive/tickets": () => listAnswer([], TICKET_OPTIONS),
      "/api/orders/executive/disputes": () => listAnswer([], DISPUTE_OPTIONS),
    });
    render(<ComplaintsSection token="t" />);

    expect(await screen.findByText("ไม่มีรายการในช่วงเวลานี้")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns about a target complained about again and again", async () => {
    serve({
      "/api/auth/executive/reports": () =>
        reportAnswer([REPORT], {
          detected: true,
          threshold: 3,
          highRiskTargets: [
            {
              targetId: "target-1",
              count: 4,
              targetName: "สมชาย",
              targetShopName: "ร้านสมชาย",
            },
          ],
        }),
    });
    render(<ComplaintsSection token="t" />);

    expect(await screen.findByText(/ร้านสมชาย \(4 ครั้ง\)/)).toBeVisible();
  });

  it("sorts newest first by default and oldest first when asked", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("จ่ายเงินแล้วไม่ได้รับของ");

    // Every kind is asked newest first, and the merged list follows.
    for (const name of [
      "/api/auth/executive/reports",
      "/api/support/executive/tickets",
      "/api/orders/executive/disputes",
    ]) {
      expect(pathsFor(name).at(-1)).toContain("sort=newest");
    }
    const order = () =>
      screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(order()[0]).toContain("จ่ายเงินแล้วไม่ได้รับของ");
    expect(order()[2]).toContain("ร้านไม่ส่งของ");

    pick("เรียงลำดับ", "วันเก่าสุด");

    await waitFor(() =>
      expect(pathsFor("/api/auth/executive/reports").at(-1)).toContain(
        "sort=oldest",
      ),
    );
    expect(pathsFor("/api/support/executive/tickets").at(-1)).toContain(
      "sort=oldest",
    );
    expect(pathsFor("/api/orders/executive/disputes").at(-1)).toContain(
      "sort=oldest",
    );
    await waitFor(() => {
      expect(order()[0]).toContain("ร้านไม่ส่งของ");
      expect(order()[2]).toContain("จ่ายเงินแล้วไม่ได้รับของ");
    });

    // The order stays when a single kind is chosen.
    pick("ประเภทเรื่อง", "Ticket");
    await waitFor(() =>
      expect(pathsFor("/api/support/executive/tickets").at(-1)).toContain(
        "sort=oldest",
      ),
    );
  });

  it("opens one high-risk target's complaints from the warning, and clears it", async () => {
    const warning = {
      detected: true,
      threshold: 3,
      highRiskTargets: [
        {
          targetId: "target-1",
          count: 4,
          targetName: "สมชาย",
          targetShopName: "ร้านสมชาย",
        },
      ],
    };
    serve({
      "/api/auth/executive/reports": () => reportAnswer([REPORT], warning),
    });
    render(<ComplaintsSection token="t" />);

    fireEvent.click(
      await screen.findByRole("button", { name: /ร้านสมชาย \(4 ครั้ง\)/ }),
    );

    // Complaints about that target only: every status, whenever reported.
    await waitFor(() => {
      const path = pathsFor("/api/auth/executive/reports").at(-1);
      expect(path).toContain("targetId=target-1");
      expect(path).toContain("status=ALL");
      expect(path).not.toContain("from=");
      expect(path).not.toContain("to=");
    });
    expect(
      screen.getByText(/ทุกสถานะ ทุกช่วงเวลา/).closest("div"),
    ).toHaveTextContent("ร้านสมชาย");
    // The other kinds are not about a target, so they are not asked.
    const ticketCalls = pathsFor("/api/support/executive/tickets").length;

    fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง" }));
    await waitFor(() =>
      expect(pathsFor("/api/auth/executive/reports").at(-1)).not.toContain(
        "targetId=",
      ),
    );
    expect(pathsFor("/api/auth/executive/reports").at(-1)).toContain("from=");
    expect(screen.queryByText(/ทุกสถานะ ทุกช่วงเวลา/)).toBeNull();
    expect(pathsFor("/api/support/executive/tickets").length).toBe(ticketCalls);
  });

  it("opens the details of a complaint", async () => {
    serve();
    render(<ComplaintsSection token="t" />);
    await screen.findByText("ร้านไม่ส่งของ");

    const row = screen.getByText("ร้านไม่ส่งของ").closest("li");
    fireEvent.click(within(row).getByRole("button", { name: "รายละเอียด" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("รายละเอียดคำร้อง")).toBeVisible();
    expect(within(dialog).getByText("มาลี ใจดี")).toBeVisible();
  });

  it("opens a dispute's details, loaded from order-service when asked", async () => {
    serve({
      "/api/orders/executive/disputes/d1": async () => ({
        data: {
          ...DISPUTE,
          createdAt: DISPUTE.createdAt,
          order: { id: DISPUTE.orderId, amount: 1000, orderType: "BUY_NOW" },
          product: { id: "p1", title: "กระเป๋าหนัง" },
          buyer: { id: "u-buyer", name: "สมหญิง" },
          seller: { id: "u-seller", name: "ร้านของเก่า" },
          assignee: { id: "u-admin", name: "แอดมินเอ" },
          assignedRole: "ADMIN",
          assignedAt: "2026-10-16T05:30:00.000Z",
          decision: "APPROVE_REFUND",
          decisionReason: "หลักฐานชัดเจน",
          decider: { id: "u-admin", name: "แอดมินเอ" },
          decidedAt: "2026-10-16T06:00:00.000Z",
          decisionDueAt: null,
        },
        meta: { namesAvailable: true, productAvailable: true },
      }),
    });
    render(<ComplaintsSection token="t" />);
    await screen.findByText("กระเป๋าขาด");
    // Nothing is fetched for a case until its details are asked for.
    expect(pathsFor("/api/orders/executive/disputes/d1")).toEqual([]);

    const row = screen.getByText("กระเป๋าขาด").closest("li");
    fireEvent.click(within(row).getByRole("button", { name: "รายละเอียด" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("ร้านของเก่า")).toBeVisible();
    expect(within(dialog).getByText("รายละเอียดข้อพิพาท")).toBeVisible();
    expect(within(dialog).getByText("ผู้ตัดสิน")).toBeVisible();
    expect(within(dialog).getByText("อนุมัติคืนเงินให้ผู้ซื้อ")).toBeVisible();
    expect(within(dialog).getByText("หลักฐานชัดเจน")).toBeVisible();
    expect(within(dialog).getByText("กระเป๋าหนัง")).toBeVisible();
  });

  it("opens a ticket's details: who opened it, the product, who handled it, as what, and why", async () => {
    serve({
      "/api/support/executive/tickets/t1": async () => ({
        data: {
          id: "t1",
          ticketNumber: "TK-0001",
          subject: TICKET.subject,
          requester: { id: "u-buyer", name: "สมหญิง" },
          createdAt: TICKET.createdAt,
          orderId: "order-1",
          product: { id: "p1", title: "กระเป๋าหนังวินเทจ" },
          status: { code: "RESOLVED", name: "RESOLVED" },
          assignee: {
            id: "u-agent-a",
            name: "เจ้าหน้าที่เอ",
            roles: ["CUSTOMER_SERVICE"],
            assignedAt: "2026-10-16T06:10:00.000Z",
            current: true,
          },
          handling: {
            by: {
              id: "u-agent-b",
              name: "เจ้าหน้าที่บี",
              roles: ["TRUST_AND_SAFETY"],
            },
            at: "2026-10-16T07:00:00.000Z",
            outcome: "RESOLVED",
            reason: "คืนเงินแล้ว",
          },
        },
        meta: { namesAvailable: true, productAvailable: true },
      }),
    });
    render(<ComplaintsSection token="t" />);
    await screen.findByText(TICKET.subject);

    const row = screen.getByText(TICKET.subject).closest("li");
    fireEvent.click(within(row).getByRole("button", { name: "รายละเอียด" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("สมหญิง")).toBeVisible();
    expect(within(dialog).getByText("รายละเอียด Ticket")).toBeVisible();
    expect(within(dialog).getByText("ผู้เปิด Ticket")).toBeVisible();
    expect(within(dialog).getByText("กระเป๋าหนังวินเทจ")).toBeVisible();
    expect(within(dialog).getByText("ผู้รับเคส")).toBeVisible();
    // Name and, in brackets, the team they act for.
    expect(within(dialog).getByText("(Trust and Safety)")).toBeVisible();
    expect(within(dialog).getByText("(Customer Service)")).toBeVisible();
    expect(within(dialog).getByText("ผู้ดำเนินการ")).toBeVisible();
    // The status and the action taken both read "แก้ไขสำเร็จ".
    expect(within(dialog).getAllByText("แก้ไขสำเร็จ")).toHaveLength(2);
    expect(within(dialog).getByText("คืนเงินแล้ว")).toBeVisible();
  });

  it("says a ticket has not been handled yet", async () => {
    serve({
      "/api/support/executive/tickets/t1": async () => ({
        data: {
          id: "t1",
          ticketNumber: "TK-0001",
          subject: TICKET.subject,
          requester: { id: "u-buyer", name: "สมหญิง" },
          createdAt: TICKET.createdAt,
          orderId: null,
          product: null,
          status: { code: "NEW", name: "NEW" },
          assignee: null,
          handling: null,
        },
        meta: { namesAvailable: true },
      }),
    });
    render(<ComplaintsSection token="t" />);
    await screen.findByText(TICKET.subject);

    const row = screen.getByText(TICKET.subject).closest("li");
    fireEvent.click(within(row).getByRole("button", { name: "รายละเอียด" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("ยังไม่ได้ดำเนินการ")).toBeVisible();
    expect(within(dialog).getByText("ยังไม่มีผู้รับเคส")).toBeVisible();
    // Not about an order: no product line at all.
    expect(within(dialog).queryByText("สินค้า")).toBeNull();
  });

  it("says when a case's details cannot be loaded and can try again", async () => {
    let calls = 0;
    serve({
      "/api/orders/executive/disputes/d1": async () => {
        calls += 1;
        throw new Error("order-service down");
      },
    });
    render(<ComplaintsSection token="t" />);
    await screen.findByText("กระเป๋าขาด");

    const row = screen.getByText("กระเป๋าขาด").closest("li");
    fireEvent.click(within(row).getByRole("button", { name: "รายละเอียด" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("โหลดรายละเอียดไม่สำเร็จ"),
    ).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "ลองใหม่" }));
    await waitFor(() => expect(calls).toBe(2));
  });
});
