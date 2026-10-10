import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("renders the empty state when there is nothing in the requested status", async () => {
    apiFetch.mockResolvedValue(EMPTY);

    render(<ComplaintsSection token="token" />);

    expect(
      await screen.findByText("ไม่มีข้อร้องเรียนในหมวดนี้"),
    ).toBeInTheDocument();
    expect(screen.getByText("เรื่องที่ยังเปิดอยู่")).toBeInTheDocument();
  });

  it("renders error state when apiFetch fails", async () => {
    apiFetch.mockRejectedValue(new Error("Failed to load reports"));

    render(<ComplaintsSection token="token" />);

    expect(
      await screen.findByText("Failed to load reports"),
    ).toBeInTheDocument();
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
    expect(screen.getByText(/โดนรายงานรวม 3 ครั้ง/)).toBeInTheDocument();

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
    expect(screen.getByText(/ชื่อร้าน:/)).toBeInTheDocument();

    // 5. Clear target filter using banner button
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "ดูทุกเป้าหมาย" }));
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).not.toContain("targetId=");
    });

    // 6. Filter by target from individual complaint item
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "กรองดูเป้าหมายนี้" }));
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).toContain("targetId=seller-123");
    });
    expect(screen.getByText(/ชื่อร้าน:/)).toBeInTheDocument();

    // 7. Cancel target filter using "✕ ยกเลิก" button
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "✕ ยกเลิก" }));
    await waitFor(() => {
      const lastCall = apiFetch.mock.calls.at(-1);
      expect(lastCall[0]).not.toContain("targetId=");
    });
  });
});
