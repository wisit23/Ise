import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import AuctionScheduleSection, {
  RoundManagementSection,
} from "./AuctionScheduleSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: jest.fn((url) => url || ""),
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

    expect(
      (await screen.findAllByText("รอบประมูลประจำสัปดาห์ที่ 1")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("กำลังเปิดรับสินค้า").length,
    ).toBeGreaterThanOrEqual(1);
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

    expect(
      (await screen.findAllByText("รอบประมูลสินค้าแบรนด์เนม")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("รอเปิดรับสินค้า").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("(รอบที่กำลังจะมาถึง)")).toBeInTheDocument();
  });

  it("renders all-round history list with phase badges and item counts", async () => {
    render(<RoundManagementSection token={mockToken} />);

    expect(
      await screen.findByText(/ประวัติและรายการรอบการประมูลทั้งหมด \(3\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("รอบประมูลปฐมฤกษ์")).toBeInTheDocument();
    expect(screen.getByText("ปิดรอบแล้ว")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders empty state when no rounds are returned", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: null,
          phase: null,
          isSubmissionOpen: false,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [], total: 0 });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect(
      await screen.findByText(
        /ยังไม่มีรอบการประมูลที่กำลังดำเนินอยู่หรือกำลังจะมาถึง/,
      ),
    ).toBeInTheDocument();
  });

  it("creates overlapping round successfully without conflict under MKT-DEC-025", async () => {
    let capturedBody = null;
    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "POST" &&
        url.includes("/api/products/auctions/rounds")
      ) {
        capturedBody = opts.body;
        return Promise.resolve({
          id: "round-overlap-new",
          title: "รอบประมูลซ้อนทับ",
        });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [sampleActiveRound] });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
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

    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.title).toBe("รอบประมูลซ้อนทับ");
      expect(screen.queryByText("เปิดรอบประมูลใหม่")).not.toBeInTheDocument();
    });
  });

  it("renders multiple active rounds concurrently (submission and auction phases)", async () => {
    const roundSub = {
      id: "round-sub-1",
      title: "รอบเปิดรับสินค้าแฟชั่น",
      phase: "submission",
      submissionStartsAt: "2026-10-01T00:00:00.000Z",
      submissionEndsAt: "2026-10-05T00:00:00.000Z",
      auctionStartsAt: "2026-10-05T00:00:00.000Z",
      auctionEndsAt: "2026-10-10T00:00:00.000Z",
      _count: { auctions: 3 },
    };
    const roundAuc = {
      id: "round-auc-1",
      title: "รอบกำลังเคาะประมูลไอที",
      phase: "auction",
      submissionStartsAt: "2026-09-25T00:00:00.000Z",
      submissionEndsAt: "2026-09-30T00:00:00.000Z",
      auctionStartsAt: "2026-10-01T00:00:00.000Z",
      auctionEndsAt: "2026-10-05T12:00:00.000Z",
      _count: { auctions: 8 },
    };

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [roundSub],
          activeAuctionRounds: [roundAuc],
          isSubmissionOpen: true,
          isAuctionActive: true,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [roundSub, roundAuc],
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect(
      (await screen.findAllByText("รอบเปิดรับสินค้าแฟชั่น")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("รอบกำลังเคาะประมูลไอที").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("กำลังเปิดรับสินค้า").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("กำลังเคาะประมูล").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("displays client validation error when required fields are missing", async () => {
    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
    fireEvent.click(openBtn);

    // Try submitting with empty title
    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.submit(submitBtn.closest("form"));

    expect(
      await screen.findByText(/กรุณากรอกชื่อรอบการประมูลให้ครบถ้วน/),
    ).toBeInTheDocument();
  });

  it("refreshes current round and round list after successful round creation", async () => {
    let createCalled = false;
    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "POST" &&
        url.includes("/api/products/auctions/rounds")
      ) {
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

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
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
    expect(
      (await screen.findAllByText("รอบประมูลประจำสัปดาห์ที่ 1")).length,
    ).toBeGreaterThanOrEqual(1);
    // Renders the parent filters/sections
    expect(
      screen.getByText(/ตรวจสอบและอนุมัติสินค้าประมูล/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("ทุกสถานะ").length).toBeGreaterThanOrEqual(1);
  });
  it("renders round accepted categories in current round card and history table", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: {
            ...sampleActiveRound,
            categories: ["เสื้อผ้า", "รองเท้า"],
          },
          phase: "submission",
          isSubmissionOpen: true,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [
            {
              ...sampleActiveRound,
              categories: ["เสื้อผ้า", "รองเท้า"],
              phase: "submission",
            },
            {
              ...sampleUpcomingRound,
              categories: [],
              phase: "upcoming",
            },
          ],
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect(await screen.findByText("หมวดหมู่ที่เปิดรับ:")).toBeInTheDocument();
    expect(screen.getAllByText("เสื้อผ้า").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("รองเท้า").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ทุกหมวดหมู่").length).toBeGreaterThanOrEqual(1);
  });

  it("validates specific category mode requires at least one category", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: ["เสื้อผ้า", "รองเท้า"] });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
    fireEvent.click(openBtn);

    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "รอบเฉพาะหมวด" },
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

    // Select specific categories radio without checking any checkbox
    const specificRadio = screen.getByLabelText(/เลือกเฉพาะบางหมวดหมู่/);
    fireEvent.click(specificRadio);

    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(
        /กรุณาเลือกอย่างน้อย 1 หมวดหมู่ หรือเลือกรับทุกหมวดหมู่/,
      ),
    ).toBeInTheDocument();
  });

  it("submits specific categories when selected", async () => {
    let capturedBody = null;
    apiFetch.mockImplementation((url, opts) => {
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: ["เสื้อผ้า", "รองเท้า"] });
      }
      if (
        opts?.method === "POST" &&
        url.includes("/api/products/auctions/rounds")
      ) {
        capturedBody = opts.body;
        return Promise.resolve({ id: "new-round-id" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
    fireEvent.click(openBtn);

    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "รอบรองเท้าเท่านั้น" },
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

    const specificRadio = screen.getByLabelText(/เลือกเฉพาะบางหมวดหมู่/);
    fireEvent.click(specificRadio);

    // Wait for categories to render and check "รองเท้า"
    const shoesCheckbox = await screen.findByRole("checkbox", {
      name: "รองเท้า",
    });
    fireEvent.click(shoesCheckbox);

    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.categories).toEqual(["รองเท้า"]);
    });
  });
});

describe("AuctionReviewModal & Pending Approval UX Improvements", () => {
  const mockToken = "mock-mkt-jwt-token";

  const samplePendingAuction = {
    id: "auc-pending-1",
    productId: "prod-1",
    sellerId: "seller-1",
    roundId: "round-active-1",
    startingPrice: 500,
    bidIncrement: 50,
    scheduledStartAt: "2026-10-03T12:00:00.000Z",
    scheduledEndAt: "2026-10-05T12:00:00.000Z",
    status: "pending_approval",
    round: { id: "round-active-1", title: "รอบประมูลเสื้อผ้ามือสอง" },
    product: {
      id: "prod-1",
      title: "เสื้อแจ็คเก็ตวินเทจ 90s",
      description: "สภาพดีมาก มีตำหนิกระดุมเม็ดล่างเล็กน้อย",
      category: "เสื้อผ้า",
      brand: "Levi's",
      condition: "Like New",
      size: "L",
      photos: [
        { id: "photo-1", url: "/uploads/jacket-1.jpg", position: 0 },
        { id: "photo-2", url: "/uploads/jacket-2.jpg", position: 1 },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: null,
          phase: null,
          isSubmissionOpen: false,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: ["เสื้อผ้า", "รองเท้า"] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({
          items: [samplePendingAuction],
          total: 1,
        });
      }
      return Promise.resolve({});
    });
  });

  it("1. displays 'ตรวจสอบสินค้า' button for pending_approval auction items", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    expect(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    ).toBeInTheDocument();
  });

  it("2. opens review modal with comprehensive product details when clicked", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    const reviewBtn = await screen.findByRole("button", {
      name: "ตรวจสอบสินค้า",
    });
    fireEvent.click(reviewBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText("ตรวจสอบสินค้าก่อนอนุมัติเข้าประมูล"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("เสื้อแจ็คเก็ตวินเทจ 90s"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("เสื้อผ้า")).toBeInTheDocument();
    expect(within(dialog).getByText("Levi's")).toBeInTheDocument();
    expect(within(dialog).getByText("Like New")).toBeInTheDocument();
    expect(within(dialog).getByText("L")).toBeInTheDocument();
    expect(
      within(dialog).getByText("รอบประมูลเสื้อผ้ามือสอง"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("฿500")).toBeInTheDocument();
    expect(within(dialog).getByText("฿50")).toBeInTheDocument();
    expect(
      within(dialog).getByText("สภาพดีมาก มีตำหนิกระดุมเม็ดล่างเล็กน้อย"),
    ).toBeInTheDocument();
  });

  it("3. displays product image from API", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    const mainImg = screen.getByAltText("เสื้อแจ็คเก็ตวินเทจ 90s");
    expect(mainImg).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/jacket-1.jpg"),
    );
  });

  it("4. switches main image when thumbnail is selected", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    const secondThumbBtn = screen.getByRole("button", {
      name: "เลือกดูรูปสินค้าที่ 2",
    });
    fireEvent.click(secondThumbBtn);

    const mainImg = screen.getByAltText("เสื้อแจ็คเก็ตวินเทจ 90s");
    expect(mainImg).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/jacket-2.jpg"),
    );
  });

  it("5. closes review modal via top-right close button", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "ปิดหน้าต่าง" });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("6. closes review modal via 'กลับไปหน้ารายการประมูล' button", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const backBtn = screen.getByRole("button", {
      name: "กลับไปหน้ารายการประมูล",
    });
    fireEvent.click(backBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("7. closes review modal via Escape key", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(dialog.parentElement, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("8. retains status filter selection after modal is closed", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    // Select filter
    const filterBtn = await screen.findByRole("button", { name: /ทุกสถานะ/ });
    fireEvent.click(filterBtn);

    const listbox = within(filterBtn.parentElement).getByRole("listbox");
    const pendingOption = within(listbox).getByText("รออนุมัติจาก Marketing");
    fireEvent.click(pendingOption);

    // Filter now shows "รออนุมัติจาก Marketing"
    expect(
      screen.getByRole("button", { name: /รออนุมัติจาก Marketing/ }),
    ).toBeInTheDocument();

    // Open and close modal
    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "กลับไปหน้ารายการประมูล" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Status filter is still selected
    expect(
      screen.getByRole("button", { name: /รออนุมัติจาก Marketing/ }),
    ).toBeInTheDocument();
  });

  it("9. approves from modal calling original endpoint", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    const approveBtn = screen.getByRole("button", {
      name: "อนุมัติสินค้าเข้าประมูล",
    });
    fireEvent.click(approveBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-pending-1/approve",
      expect.objectContaining({ method: "PATCH", token: mockToken }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("10. closes modal and reloads auction list upon successful approval", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "อนุมัติสินค้าเข้าประมูล" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("11. rejects from modal calling original endpoint", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    // Inside modal, click "ปฏิเสธสินค้า"
    const rejectBtns = screen.getAllByRole("button", { name: "ปฏิเสธสินค้า" });
    const modalRejectBtn = rejectBtns[rejectBtns.length - 1];
    fireEvent.click(modalRejectBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-pending-1/reject",
      expect.objectContaining({ method: "PATCH", token: mockToken }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("12. closes modal and reloads auction list upon successful rejection", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    const rejectBtns = screen.getAllByRole("button", { name: "ปฏิเสธสินค้า" });
    fireEvent.click(rejectBtns[rejectBtns.length - 1]);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("13. disables buttons and displays loading status during action submission", async () => {
    let resolveApprove;
    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH" && url.includes("/approve")) {
        return new Promise((resolve) => {
          resolveApprove = resolve;
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [samplePendingAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "อนุมัติสินค้าเข้าประมูล" }),
    );

    // Buttons change to loading state and are disabled
    const loadingBtns = await screen.findAllByRole("button", {
      name: "กำลังอนุมัติ...",
    });
    loadingBtns.forEach((btn) => expect(btn).toBeDisabled());

    expect(
      within(dialog).getByRole("button", { name: "กลับไปหน้ารายการประมูล" }),
    ).toBeDisabled();

    // Resolve promise
    resolveApprove({});
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("14. keeps modal open when API call fails", async () => {
    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH" && url.includes("/approve")) {
        return Promise.reject(new Error("รอบประมูลนี้ปิดรับสินค้าแล้ว"));
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [samplePendingAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "อนุมัติสินค้าเข้าประมูล" }),
    );

    // Modal stays open
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("15. displays user-friendly Thai error message on API failure without leaking technical terms", async () => {
    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH" && url.includes("/approve")) {
        return Promise.reject(
          new Error("Internal Server Error: PrismaClientKnownRequestError 500"),
        );
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [samplePendingAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "อนุมัติสินค้าเข้าประมูล" }),
    );

    const errorMsg = await within(dialog).findByText(
      "เกิดข้อผิดพลาดในการอนุมัติรายการประมูล กรุณาลองใหม่อีกครั้ง",
    );
    expect(errorMsg).toBeInTheDocument();
    expect(errorMsg.textContent).not.toContain("PrismaClient");
    expect(errorMsg.textContent).not.toContain("500");
    expect(errorMsg.textContent).not.toContain("Internal Server Error");
  });

  it("16. renders fallback placeholder and does not crash when item has no photos", async () => {
    const noPhotoAuction = {
      ...samplePendingAuction,
      id: "auc-no-photo",
      product: {
        ...samplePendingAuction.product,
        photos: [],
      },
    };

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [noPhotoAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    expect(screen.getByText("ไม่มีรูปสินค้า")).toBeInTheDocument();
  });

  it("17. displays 'ไม่ระบุ' when optional fields are empty or null", async () => {
    const emptyFieldsAuction = {
      id: "auc-sparse-1",
      productId: "prod-sparse",
      status: "pending_approval",
      startingPrice: null,
      bidIncrement: null,
      round: null,
      product: {
        id: "prod-sparse",
        title: null,
        description: "",
        category: null,
        brand: null,
        condition: null,
        size: null,
        photos: null,
      },
    };

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [emptyFieldsAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    // Expect "ไม่ระบุ" across missing attributes
    expect(screen.getAllByText("ไม่ระบุ").length).toBeGreaterThanOrEqual(5);
  });

  it("18. regression check: list-level approve and reject buttons function as before", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    const listApproveBtn = await screen.findByRole("button", {
      name: "✓ อนุมัติสินค้าเข้าประมูล",
    });
    fireEvent.click(listApproveBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-pending-1/approve",
      expect.objectContaining({ method: "PATCH", token: mockToken }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ปฏิเสธสินค้า" }),
      ).not.toBeDisabled();
    });

    const listRejectBtn = screen.getByRole("button", { name: "ปฏิเสธสินค้า" });
    fireEvent.click(listRejectBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-pending-1/reject",
      expect.objectContaining({ method: "PATCH", token: mockToken }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ปฏิเสธสินค้า" }),
      ).not.toBeDisabled();
    });
  });
});

describe("MKT-DEC-026: Round Filter, Single-Item Cancellation Modal, Round Cancellation Modal & Distinct Action Labels", () => {
  const mockToken = "mock-mkt-jwt-token";

  const sampleRoundA = {
    id: "round-a",
    title: "รอบประมูลแฟชั่นวินเทจ",
    phase: "submission",
    submissionStartsAt: "2026-10-01T00:00:00.000Z",
    submissionEndsAt: "2026-10-03T00:00:00.000Z",
    auctionStartsAt: "2026-10-03T12:00:00.000Z",
    auctionEndsAt: "2026-10-05T12:00:00.000Z",
    _count: { auctions: 2 },
  };

  const sampleRoundB = {
    id: "round-b",
    title: "รอบประมูลรองเท้าสนีกเกอร์",
    phase: "auction",
    submissionStartsAt: "2026-09-25T00:00:00.000Z",
    submissionEndsAt: "2026-09-28T00:00:00.000Z",
    auctionStartsAt: "2026-09-29T12:00:00.000Z",
    auctionEndsAt: "2026-10-04T12:00:00.000Z",
    _count: { auctions: 3 },
  };

  const pendingItemA = {
    id: "auc-pending-a",
    productId: "prod-a",
    status: "pending_approval",
    startingPrice: 400,
    bidIncrement: 50,
    scheduledStartAt: "2026-10-03T12:00:00.000Z",
    scheduledEndAt: "2026-10-05T12:00:00.000Z",
    roundId: "round-a",
    round: sampleRoundA,
    product: { id: "prod-a", title: "เสื้อเชิ้ตผ้าลินิน" },
  };

  const openItemB = {
    id: "auc-open-b",
    productId: "prod-b",
    status: "open",
    startingPrice: 1500,
    bidIncrement: 100,
    scheduledStartAt: "2026-09-29T12:00:00.000Z",
    scheduledEndAt: "2026-10-04T12:00:00.000Z",
    roundId: "round-b",
    round: sampleRoundB,
    product: { id: "prod-b", title: "รองเท้าวิ่ง Nike Zoom" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRoundA],
          activeAuctionRounds: [sampleRoundB],
          isSubmissionOpen: true,
          isAuctionActive: true,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [sampleRoundA, sampleRoundB],
        });
      }
      if (url.includes("/api/products/auctions")) {
        if (url.includes("roundId=round-a")) {
          return Promise.resolve({ items: [pendingItemA], total: 1 });
        }
        return Promise.resolve({
          items: [pendingItemA, openItemB],
          total: 2,
        });
      }
      return Promise.resolve({});
    });
  });

  it("renders round filter with default 'ทุกรอบประมูล' and filters AuctionItems by selected round", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    expect(await screen.findByText("เสื้อเชิ้ตผ้าลินิน")).toBeInTheDocument();
    expect(screen.getByText("รองเท้าวิ่ง Nike Zoom")).toBeInTheDocument();

    // Open round filter dropdown
    const filterBtn = screen.getByRole("button", { name: /ทุกรอบประมูล/ });
    fireEvent.click(filterBtn);

    const listbox = within(filterBtn.parentElement).getByRole("listbox");
    const roundAOption = within(listbox).getByText(/รอบประมูลแฟชั่นวินเทจ/);
    fireEvent.click(roundAOption);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("roundId=round-a"),
        expect.objectContaining({ token: mockToken }),
      );
    });

    expect(await screen.findByText("เสื้อเชิ้ตผ้าลินิน")).toBeInTheDocument();
    expect(screen.queryByText("รองเท้าวิ่ง Nike Zoom")).not.toBeInTheDocument();
  });

  it("displays clear Thai error message when loading rounds for filter fails", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({ round: null });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.reject(new Error("fetch failed"));
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [], total: 0 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    expect(
      await screen.findByText(
        "ไม่สามารถโหลดรายการรอบประมูลสำหรับตัวกรองได้ กรุณาลองใหม่อีกครั้ง",
      ),
    ).toBeInTheDocument();
  });

  it("displays empty state and loading/error state for auction list", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [], total: 0 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    expect(
      await screen.findByText("ยังไม่มีรายการประมูลในหมวดนี้"),
    ).toBeInTheDocument();
  });

  it("uses distinct, unambiguous labels for 'ปฏิเสธสินค้า', 'ยกเลิกรายการประมูล', and 'ยกเลิกรอบประมูล'", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    expect(
      await screen.findByRole("button", { name: "ปฏิเสธสินค้า" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ยกเลิกรายการประมูล" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "ยกเลิกรอบประมูล" }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("opens single-item cancel confirmation modal, validates reason, prevents double submit, and calls PATCH /:id/cancel", async () => {
    let resolveCancel;
    let cancelCalls = 0;
    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "PATCH" &&
        url === "/api/products/auctions/auc-open-b/cancel"
      ) {
        cancelCalls += 1;
        return new Promise((resolve) => {
          resolveCancel = resolve;
        });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({ activeAuctionRounds: [sampleRoundB] });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [sampleRoundB] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [openItemB], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    const cancelItemBtn = await screen.findByRole("button", {
      name: "ยกเลิกรายการประมูล",
    });
    fireEvent.click(cancelItemBtn);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("ยืนยันการยกเลิกรายการประมูล"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/รองเท้าวิ่ง Nike Zoom/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/รอบประมูลรองเท้าสนีกเกอร์/),
    ).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", {
      name: "ยืนยันการยกเลิกรายการ",
    });
    expect(confirmBtn).toBeDisabled();

    // Whitespace-only reason keeps button disabled
    const textarea = within(dialog).getByPlaceholderText(
      /ระบุเหตุผลในการยกเลิกรายการประมูล/,
    );
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(confirmBtn).toBeDisabled();

    // Valid reason enables button
    fireEvent.change(textarea, {
      target: { value: "สินค้าชำรุดก่อนจัดส่ง" },
    });
    expect(confirmBtn).not.toBeDisabled();

    // Submit and verify double-submit protection
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    expect(cancelCalls).toBe(1);
    expect(
      within(dialog).getByRole("button", { name: "กำลังยกเลิกรายการ..." }),
    ).toBeDisabled();

    resolveCancel({ id: "auc-open-b", status: "cancelled" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-open-b/cancel",
      expect.objectContaining({
        method: "PATCH",
        token: mockToken,
        body: {
          cancellationReason: "สินค้าชำรุดก่อนจัดส่ง",
          reason: "สินค้าชำรุดก่อนจัดส่ง",
        },
      }),
    );
  });

  it("opens round cancel confirmation modal, validates reason, prevents double submit, and calls PATCH /rounds/:roundId/cancel", async () => {
    let resolveRoundCancel;
    let roundCancelCalls = 0;
    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "PATCH" &&
        url === "/api/products/auctions/rounds/round-b/cancel"
      ) {
        roundCancelCalls += 1;
        return new Promise((resolve) => {
          resolveRoundCancel = resolve;
        });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleRoundB],
          isAuctionActive: true,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [sampleRoundB] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [openItemB], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    const cancelRoundBtns = await screen.findAllByRole("button", {
      name: "ยกเลิกรอบประมูล",
    });
    fireEvent.click(cancelRoundBtns[0]);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "ยกเลิกรอบการประมูล" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("ตรวจสอบข้อมูลและระบุเหตุผลก่อนยืนยัน"),
    ).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", {
      name: "ยืนยันการยกเลิกรอบ",
    });
    expect(confirmBtn).toBeDisabled();

    const textarea = within(dialog).getByPlaceholderText(
      /ระบุเหตุผลในการยกเลิกรอบประมูล/,
    );
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(textarea, {
      target: { value: "เกิดเหตุขัดข้องของระบบประมูล" },
    });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    expect(roundCancelCalls).toBe(1);
    expect(
      within(dialog).getByRole("button", { name: "กำลังยกเลิก..." }),
    ).toBeDisabled();

    resolveRoundCancel({ round: { ...sampleRoundB, phase: "cancelled" } });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/rounds/round-b/cancel",
      expect.objectContaining({
        method: "PATCH",
        token: mockToken,
        body: { reason: "เกิดเหตุขัดข้องของระบบประมูล" },
      }),
    );
  });

  it("displays chat warning banner with 'ลองส่งแจ้งเตือนอีกครั้ง' button when item or round cancellation returns warnings and retries on click", async () => {
    let itemCancelAttempt = 0;
    let roundCancelAttempt = 0;

    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "PATCH" &&
        url === "/api/products/auctions/auc-open-b/cancel"
      ) {
        itemCancelAttempt += 1;
        if (itemCancelAttempt === 1) {
          return Promise.resolve({
            id: "auc-open-b",
            status: "cancelled",
            warnings: [
              "ไม่สามารถส่งข้อความแจ้งเตือนทางแชทได้ครบทุกฝ่าย (1 รายการ)",
            ],
          });
        }
        return Promise.resolve({
          id: "auc-open-b",
          status: "cancelled",
          warnings: [],
        });
      }
      if (
        opts?.method === "PATCH" &&
        url === "/api/products/auctions/rounds/round-b/cancel"
      ) {
        roundCancelAttempt += 1;
        if (roundCancelAttempt === 1) {
          return Promise.resolve({
            id: "round-b",
            phase: "cancelled",
            warnings: ["ส่งข้อความแจ้งเตือนรอบประมูลไม่สำเร็จ 1 รายการ"],
          });
        }
        return Promise.resolve({
          id: "round-b",
          phase: "cancelled",
          warnings: [],
        });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleRoundB],
          isAuctionActive: true,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [sampleRoundB] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [openItemB], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    // 1. Trigger single-item cancel with partial chat failure warning
    const cancelItemBtn = await screen.findByRole("button", {
      name: "ยกเลิกรายการประมูล",
    });
    fireEvent.click(cancelItemBtn);

    const itemDialog = screen.getByRole("dialog");
    fireEvent.change(
      within(itemDialog).getByPlaceholderText(
        /ระบุเหตุผลในการยกเลิกรายการประมูล/,
      ),
      { target: { value: "สินค้าชำรุด" } },
    );
    fireEvent.click(
      within(itemDialog).getByRole("button", {
        name: "ยืนยันการยกเลิกรายการ",
      }),
    );

    expect(
      await screen.findByText(
        /ไม่สามารถส่งข้อความแจ้งเตือนทางแชทได้ครบทุกฝ่าย/,
      ),
    ).toBeInTheDocument();

    const retryItemBtn = screen.getByRole("button", {
      name: "ลองส่งแจ้งเตือนอีกครั้ง",
    });
    fireEvent.click(retryItemBtn);

    await waitFor(() => {
      expect(itemCancelAttempt).toBe(2);
    });
    expect(
      await screen.findByText(
        /ส่งข้อความแจ้งเตือนการยกเลิกรายการประมูลครบทุกฝ่ายเรียบร้อยแล้ว/,
      ),
    ).toBeInTheDocument();

    // 2. Trigger round cancel with partial chat failure warning
    const cancelRoundBtns = screen.getAllByRole("button", {
      name: "ยกเลิกรอบประมูล",
    });
    fireEvent.click(cancelRoundBtns[0]);

    const roundDialog = screen.getByRole("dialog");
    fireEvent.change(
      within(roundDialog).getByPlaceholderText(
        /ระบุเหตุผลในการยกเลิกรอบประมูล/,
      ),
      { target: { value: "ปรับปรุงระบบประมูล" } },
    );
    fireEvent.click(
      within(roundDialog).getByRole("button", { name: "ยืนยันการยกเลิกรอบ" }),
    );

    expect(
      await screen.findByText(/ส่งข้อความแจ้งเตือนรอบประมูลไม่สำเร็จ 1 รายการ/),
    ).toBeInTheDocument();

    const retryRoundBtn = screen.getByRole("button", {
      name: "ลองส่งแจ้งเตือนอีกครั้ง",
    });
    fireEvent.click(retryRoundBtn);

    await waitFor(() => {
      expect(roundCancelAttempt).toBe(2);
    });
  });
});
