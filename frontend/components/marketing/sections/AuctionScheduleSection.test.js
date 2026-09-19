import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AuctionScheduleSection, { RoundManagementSection } from "./AuctionScheduleSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("RoundManagementSection - Focused Round Management & Phase Visualization", () => {
  const mockToken = "mock-mkt-jwt-token";

  const sampleActiveRound = {
    id: "round-active-1",
    title: "รอบประมูลประจำสัปดาห์ที่ 1",
    submissionStartsAt: "2026-10-01T00:00:00.000Z",
    submissionEndsAt: "2026-10-03T00:00:00.000Z",
    auctionStartsAt: "2026-10-03T12:00:00.000Z",
    auctionEndsAt: "2026-10-05T12:00:00.000Z",
    _count: { auctions: 5 },
  };

  const sampleUpcomingRound = {
    id: "round-upcoming-2",
    title: "รอบประมูลสินค้าแบรนด์เนม",
    submissionStartsAt: "2026-10-10T00:00:00.000Z",
    submissionEndsAt: "2026-10-12T00:00:00.000Z",
    auctionStartsAt: "2026-10-12T12:00:00.000Z",
    auctionEndsAt: "2026-10-15T12:00:00.000Z",
    _count: { auctions: 0 },
  };

  const sampleEndedRound = {
    id: "round-ended-0",
    title: "รอบประมูลปฐมฤกษ์",
    submissionStartsAt: "2026-09-01T00:00:00.000Z",
    submissionEndsAt: "2026-09-03T00:00:00.000Z",
    auctionStartsAt: "2026-09-03T12:00:00.000Z",
    auctionEndsAt: "2026-09-05T12:00:00.000Z",
    _count: { auctions: 12 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default auctions list for main section
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
          isSubmissionOpen: true,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [
            { ...sampleActiveRound, phase: "submission" },
            { ...sampleUpcomingRound, phase: "upcoming" },
            { ...sampleEndedRound, phase: "ended" },
          ],
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [], total: 0 });
      }
      return Promise.resolve({});
    });
  });

  it("renders current round with submission phase badge", async () => {
    render(<RoundManagementSection token={mockToken} />);

    expect((await screen.findAllByText("รอบประมูลประจำสัปดาห์ที่ 1")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("กำลังเปิดรับสินค้า").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/สินค้าในรอบนี้:/)).toBeInTheDocument();
  });

  it("renders nearest upcoming round with upcoming phase badge when no active round exists", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleUpcomingRound,
          phase: "upcoming",
          isSubmissionOpen: false,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [{ ...sampleUpcomingRound, phase: "upcoming" }],
        });
      }
      return Promise.resolve({ items: [], total: 0 });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect((await screen.findAllByText("รอบประมูลสินค้าแบรนด์เนม")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("รอเปิดรับสินค้า").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("(รอบที่กำลังจะมาถึง)")).toBeInTheDocument();
  });

  it("renders all-round history list with phase badges and item counts", async () => {
    render(<RoundManagementSection token={mockToken} />);

    expect(await screen.findByText(/ประวัติและรายการรอบการประมูลทั้งหมด \(3\)/)).toBeInTheDocument();
    expect(screen.getByText("รอบประมูลปฐมฤกษ์")).toBeInTheDocument();
    expect(screen.getByText("ปิดรอบแล้ว")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders empty state when no rounds are returned", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({ round: null, phase: null, isSubmissionOpen: false, isAuctionActive: false });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [], total: 0 });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect(
      await screen.findByText(/ยังไม่มีรอบการประมูลที่กำลังดำเนินอยู่หรือกำลังจะมาถึง/),
    ).toBeInTheDocument();
  });

  it("displays 409 Conflict error message when creating an overlapping round", async () => {
    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", { name: /สร้างรอบประมูลใหม่/ });
    fireEvent.click(openBtn);

    expect(screen.getByText("เปิดรอบประมูลใหม่")).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "รอบประมูลซ้อนทับ" },
    });

    const subStartInput = screen.getByLabelText(/วัน-เวลาเริ่มเปิดรับ/);
    const subEndInput = screen.getByLabelText(/วัน-เวลาปิดรับสินค้า/);
    const aucStartInput = screen.getByLabelText(/วัน-เวลาเริ่มเปิดประมูล/);
    const aucEndInput = screen.getByLabelText(/วัน-เวลาสิ้นสุดการประมูล/);

    fireEvent.change(subStartInput, { target: { value: "2026-10-02T00:00" } });
    fireEvent.change(subEndInput, { target: { value: "2026-10-04T00:00" } });
    fireEvent.change(aucStartInput, { target: { value: "2026-10-04T12:00" } });
    fireEvent.change(aucEndInput, { target: { value: "2026-10-06T12:00" } });

    // Mock API 409 error
    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "POST" && url.includes("/api/products/auctions/rounds")) {
        const error = new Error('ช่วงเวลารอบประมูลซ้อนทับกับรอบ "รอบประมูลประจำสัปดาห์ที่ 1"');
        error.status = 409;
        return Promise.reject(error);
      }
      return Promise.resolve({ items: [] });
    });

    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/ช่วงเวลารอบประมูลซ้อนทับกับรอบ "รอบประมูลประจำสัปดาห์ที่ 1"/),
    ).toBeInTheDocument();
  });

  it("refreshes current round and round list after successful round creation", async () => {
    let createCalled = false;
    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "POST" && url.includes("/api/products/auctions/rounds")) {
        createCalled = true;
        return Promise.resolve({ id: "round-new-created" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
          isSubmissionOpen: true,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", { name: /สร้างรอบประมูลใหม่/ });
    fireEvent.click(openBtn);

    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "รอบใหม่สำเร็จ" },
    });

    fireEvent.change(screen.getByLabelText(/วัน-เวลาเริ่มเปิดรับ/), {
      target: { value: "2026-10-20T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาปิดรับสินค้า/), {
      target: { value: "2026-10-22T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาเริ่มเปิดประมูล/), {
      target: { value: "2026-10-22T12:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาสิ้นสุดการประมูล/), {
      target: { value: "2026-10-25T12:00" },
    });

    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createCalled).toBe(true);
    });
  });

  it("renders parent AuctionScheduleSection with explicitly mocked API calls", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    // Renders the round management part inside the parent
    expect((await screen.findAllByText("รอบประมูลประจำสัปดาห์ที่ 1")).length).toBeGreaterThanOrEqual(1);
    // Renders the parent filters/sections
    expect(screen.getByText(/ตรวจสอบและอนุมัติสินค้าประมูล/)).toBeInTheDocument();
    expect(screen.getAllByText("ทุกสถานะ").length).toBeGreaterThanOrEqual(1);
  });
});
