import { render, screen, fireEvent } from "@testing-library/react";
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
        topReported: [{ targetId: "seller-123", count: 3 }],
      },
      meta: { definitionVersion: "v1" },
    });

    render(<ComplaintsSection token="token" />);

    expect(await screen.findByText("ผู้ขายไม่ส่งของ")).toBeInTheDocument();
    expect(screen.getByText(/สมชาย ใจดี/)).toBeInTheDocument();
    expect(screen.getByText(/ถูกร้องเรียน 3 ครั้ง/)).toBeInTheDocument();

    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "ยกคำร้อง" }));

    const lastCall = apiFetch.mock.calls.at(-1);
    expect(lastCall[0]).toContain("status=DISMISSED");
  });
});
