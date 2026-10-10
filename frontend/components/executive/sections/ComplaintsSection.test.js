import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import ComplaintsSection from "./ComplaintsSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

// Matches the real /api/auth/executive/reports envelope — every executive
// metrics endpoint wraps its payload as { data, meta }, not the bare object.
const EMPTY = {
  data: { items: [], statusCounts: {}, totalOpen: 0, topReported: [] },
  meta: { definitionVersion: "v1" },
};

describe("ComplaintsSection", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("returns to a valid page when the last page disappears", async () => {
    apiFetch
      .mockResolvedValueOnce({
        data: { ...EMPTY.data, total: 4, page: 1, limit: 2, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: { ...EMPTY.data, total: 1, page: 2, limit: 2, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        data: {
          ...EMPTY.data,
          total: 1,
          page: 1,
          limit: 2,
          totalPages: 1,
          items: [
            {
              id: "last",
              reason: "Remaining complaint",
              status: "OPEN",
              reportedAt: "2026-10-09T03:00:00.000Z",
            },
          ],
        },
      });
    render(<ComplaintsSection token="token" />);
    fireEvent.click(await screen.findByRole("button", { name: "ถัดไป" }));
    expect(await screen.findByText("Remaining complaint")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("page=1");
  });

  it("times out a stalled request, keeps search editable and allows retry", async () => {
    apiFetch
      .mockResolvedValueOnce(EMPTY)
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(EMPTY);
    render(<ComplaintsSection token="token" />);
    await screen.findByRole("searchbox");
    jest.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "ดำเนินการแล้ว" }));
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "ระบบใช้เวลาตอบกลับนานเกินไป",
      );
      expect(screen.getByRole("searchbox")).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
      await act(async () => {});
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(apiFetch).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it("places All after dismissed and requests all statuses", async () => {
    apiFetch.mockResolvedValue(EMPTY);
    render(<ComplaintsSection token="token" />);
    const all = await screen.findByRole("button", { name: "ทั้งหมด" });
    const dismissed = screen.getByRole("button", { name: "ยกคำร้อง" });
    expect(dismissed.nextElementSibling).toBe(all);
    fireEvent.click(all);
    await waitFor(() =>
      expect(apiFetch.mock.calls.at(-1)[0]).toContain("status=ALL"),
    );
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("page=1");
  });

  it("searches automatically after typing settles and preserves input focus during the request", async () => {
    let resolveSearch;
    apiFetch.mockResolvedValueOnce(EMPTY).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    render(<ComplaintsSection token="token" />);
    const input = await screen.findByRole("searchbox");
    input.focus();
    fireEvent.change(input, { target: { value: "Shop" } });
    fireEvent.change(input, { target: { value: "Shop A" } });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("search=Shop+A");
    expect(screen.getByRole("searchbox")).toBe(input);
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "Shop B" } });
    expect(input).toHaveValue("Shop B");
    resolveSearch(EMPTY);
    await screen.findByText("Shop A");
  });

  it("waits for text composition to finish before searching", async () => {
    apiFetch.mockResolvedValue(EMPTY);
    render(<ComplaintsSection token="token" />);
    const input = await screen.findByRole("searchbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ร้าน ก" } });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    fireEvent.compositionEnd(input);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(
      new URL(
        apiFetch.mock.calls.at(-1)[0],
        "http://test.local",
      ).searchParams.get("search"),
    ).toBe("ร้าน ก");
  });

  it("searches shops through the API, keeps the selected status and resets pagination", async () => {
    apiFetch.mockResolvedValue({
      data: { ...EMPTY.data, total: 4, page: 1, limit: 2, totalPages: 2 },
    });
    render(<ComplaintsSection token="token" />);
    await screen.findByText("ไม่มีข้อร้องเรียนในหมวดนี้");
    fireEvent.click(screen.getByRole("button", { name: "ดำเนินการแล้ว" }));
    const input = await screen.findByRole("searchbox", {
      name: "ค้นหาเป้าหมายหรือชื่อร้านค้า",
    });
    fireEvent.change(input, { target: { value: " Shop A " } });
    fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
    await screen.findByText("Shop A");
    const query = new URL(apiFetch.mock.calls.at(-1)[0], "http://test.local")
      .searchParams;
    expect(query.get("search")).toBe("Shop A");
    expect(query.get("status")).toBe("ACTIONED");
    expect(query.get("page")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    await screen.findByText("Shop A");
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("page=2");
    fireEvent.click(screen.getByRole("button", { name: "ล้าง" }));
    await screen.findByRole("searchbox");
    expect(apiFetch.mock.calls.at(-1)[0]).not.toContain("search=");
    expect(apiFetch.mock.calls.at(-1)[0]).toContain("page=1");
  });

  it.each([
    ["ACTIONED", "WARN_USER", "เตือนร้านค้า"],
    ["ACTIONED", "SUSPEND_USER", "ระงับบัญชีผู้ใช้"],
    ["DISMISSED", "DISMISS", "ไม่ดำเนินการ"],
    ["ACTIONED", "REMOVE_PRODUCT", "นำสินค้าออก"],
  ])(
    "shows the decision and its actor in the details for %s/%s",
    async (status, actionTaken, label) => {
      apiFetch.mockResolvedValue({
        data: {
          ...EMPTY.data,
          items: [
            {
              id: "report-1",
              reason: "เหตุผลของผู้ร้อง",
              status,
              actionTaken,
              reportedAt: "2026-10-09T03:00:00.000Z",
              targetShopName: "ร้านทดสอบ",
              actionDetails: {
                actorId: "staff-1",
                actorName: "เจ้าหน้าที่ เอ",
                reason: "เหตุผลที่เจ้าหน้าที่ตัดสิน",
              },
            },
          ],
        },
      });
      render(<ComplaintsSection token="token" />);
      fireEvent.click(
        await screen.findByRole("button", { name: "รายละเอียด" }),
      );
      const dialog = screen.getByRole("dialog", { name: "รายละเอียดคำร้อง" });
      expect(within(dialog).getByText("เจ้าหน้าที่ เอ")).toBeInTheDocument();
      expect(within(dialog).getByText(label)).toBeInTheDocument();
      expect(
        within(dialog).getByText("เหตุผลที่เจ้าหน้าที่ตัดสิน"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("เหตุผลของผู้ร้อง")).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "ปิด" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it.each(["OPEN", "REVIEWED", "ACTIONED"])(
    "shows missing decision information as dashes for %s",
    async (status) => {
      apiFetch.mockResolvedValue({
        data: {
          ...EMPTY.data,
          items: [
            {
              id: "r1",
              reason: "คำร้องเดิม",
              status,
              reportedAt: "2026-10-09T03:00:00.000Z",
            },
          ],
        },
      });
      render(<ComplaintsSection token="token" />);
      fireEvent.click(
        await screen.findByRole("button", { name: "รายละเอียด" }),
      );
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getAllByText("-")).toHaveLength(3);
    },
  );

  it("renders the empty state when there is nothing in the requested status", async () => {
    apiFetch.mockResolvedValue(EMPTY);

    render(<ComplaintsSection token="token" />);

    expect(
      await screen.findByText("ไม่มีข้อร้องเรียนในหมวดนี้"),
    ).toBeInTheDocument();
    expect(screen.getByText("เรื่องที่ยังเปิดอยู่")).toBeInTheDocument();
  });

  it("opens above the whole page and restores panel scrolling after closing", async () => {
    apiFetch.mockResolvedValue({
      data: {
        ...EMPTY.data,
        items: [
          {
            id: "r1",
            reason: "คำร้อง",
            status: "OPEN",
            reportedAt: "2026-10-09T03:00:00.000Z",
          },
        ],
      },
    });
    const { container } = render(
      <div style={{ overflowY: "auto" }}>
        <ComplaintsSection token="token" />
      </div>,
    );
    const scroller = container.firstElementChild;
    const previousBodyOverflow = document.body.style.overflow;
    fireEvent.click(await screen.findByRole("button", { name: "รายละเอียด" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.parentElement.parentElement).toBe(document.body);
    expect(scroller.style.overflowY).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(scroller.style.overflowY).toBe("auto");
    expect(document.body.style.overflow).toBe(previousBodyOverflow);
  });

  it("renders error state when apiFetch fails", async () => {
    apiFetch.mockRejectedValue(new Error("Failed to load reports"));

    render(<ComplaintsSection token="token" />);

    expect(
      await screen.findByText("Failed to load reports"),
    ).toBeInTheDocument();
  });

  it("rejects malformed API data and retries without displaying invented zero counts", async () => {
    apiFetch
      .mockResolvedValueOnce({ data: { items: "invalid", totalOpen: 0 } })
      .mockResolvedValueOnce(EMPTY);
    render(<ComplaintsSection token="token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ข้อมูลข้อร้องเรียนจากระบบไม่ถูกต้อง",
    );
    expect(screen.queryByText("เรื่องที่ยังเปิดอยู่")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(
      await screen.findByText("ไม่มีข้อร้องเรียนในหมวดนี้"),
    ).toBeInTheDocument();
  });

  it("ignores an older response after the status filter changes", async () => {
    let resolveOld;
    apiFetch
      .mockResolvedValueOnce(EMPTY)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(EMPTY);
    const { rerender } = render(<ComplaintsSection token="first-token" />);
    await screen.findByText("ไม่มีข้อร้องเรียนในหมวดนี้");
    rerender(<ComplaintsSection token="second-token" />);
    rerender(<ComplaintsSection token="third-token" />);
    await screen.findByText("ไม่มีข้อร้องเรียนในหมวดนี้");
    resolveOld({
      data: {
        ...EMPTY.data,
        items: [
          {
            id: "old",
            status: "OPEN",
            reason: "Stale report",
            reportedAt: "2026-10-09T03:00:00.000Z",
          },
        ],
      },
    });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    expect(screen.queryByText("Stale report")).not.toBeInTheDocument();
  });

  it("renders real complaint rows and re-fetches with the selected status filter", async () => {
    apiFetch.mockResolvedValue({
      data: {
        items: [
          {
            id: "r1",
            reason: "ผู้ขายไม่ส่งของ",
            status: "OPEN",
            reportedAt: "2026-08-01T00:00:00.000Z",
            targetId: "seller-123",
            productId: null,
            reporterName: "สมชาย ใจดี",
          },
        ],
        statusCounts: { OPEN: 1 },
        totalOpen: 1,
      },
      meta: { definitionVersion: "v1" },
    });

    render(<ComplaintsSection token="token" />);

    expect(await screen.findByText("ผู้ขายไม่ส่งของ")).toBeInTheDocument();
    expect(screen.getByText(/สมชาย ใจดี/)).toBeInTheDocument();

    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "ยกคำร้อง" }));

    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).toContain("status=DISMISSED");
    });
  });

  it("defaults to newest sort, renders anomaly banner, and supports sorting and target filtering", async () => {
    const mockData = {
      data: {
        items: [
          {
            id: "r1",
            reason: "ผู้ขายไม่ส่งของและติดต่อไม่ได้",
            status: "OPEN",
            reportedAt: "2026-08-01T00:00:00.000Z",
            targetId: "seller-123",
            targetShopName: "ร้านยีนส์เดนิม",
            targetReportCount: 3,
            productId: null,
            reporterName: "สมชาย ใจดี",
          },
        ],
        statusCounts: { OPEN: 1 },
        totalOpen: 1,
        anomalySummary: {
          detected: true,
          threshold: 3,
          highRiskTargets: [
            {
              targetId: "seller-123",
              count: 3,
              targetShopName: "ร้านยีนส์เดนิม",
            },
          ],
        },
      },
      meta: { definitionVersion: "v1" },
    };

    apiFetch.mockResolvedValue(mockData);

    render(<ComplaintsSection token="token" />);

    // 1. Verify Anomaly Warning Banner is rendered
    expect(
      await screen.findByText(/ตรวจพบเป้าหมายที่มีข้อร้องเรียนสูงผิดปกติ/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ผู้ขายไม่ส่งของและติดต่อไม่ได้"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/ร้านยีนส์เดนิม/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/โดนรายงานรวม/)).not.toBeInTheDocument();

    // Default sort is newest
    expect(screen.getByLabelText("จัดเรียง:")).toHaveValue("newest");

    // 2. Sort by oldest
    apiFetch.mockClear();
    fireEvent.change(screen.getByLabelText("จัดเรียง:"), {
      target: { value: "oldest" },
    });
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).toContain("sortBy=oldest");
    });
    expect(
      await screen.findByText("ผู้ขายไม่ส่งของและติดต่อไม่ได้"),
    ).toBeInTheDocument();

    // 3. Sort by most_reported
    apiFetch.mockClear();
    fireEvent.change(screen.getByLabelText("จัดเรียง:"), {
      target: { value: "most_reported" },
    });
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).toContain("sortBy=most_reported");
      expect(
        screen.getByText("เรียงตามเป้าหมายที่โดน report มากที่สุด"),
      ).toBeInTheDocument();
    });

    // 4. Click high risk target button inside Anomaly Banner
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /ร้านยีนส์เดนิม/ }));
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).toContain("targetId=seller-123");
    });
    expect(await screen.findByText(/ชื่อร้าน:/)).toBeInTheDocument();

    // 5. Clear target filter using banner button
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "ดูทุกเป้าหมาย" }));
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).not.toContain("targetId=");
    });

    // 6. Filter by target from individual complaint item
    apiFetch.mockClear();
    fireEvent.click(
      await screen.findByRole("button", { name: "กรองดูเป้าหมายนี้" }),
    );
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).toContain("targetId=seller-123");
    });
    expect(await screen.findByText(/ชื่อร้าน:/)).toBeInTheDocument();

    // 7. Cancel target filter using "✕ ยกเลิก" button
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "✕ ยกเลิก" }));
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).not.toContain("targetId=");
    });
  });
});
