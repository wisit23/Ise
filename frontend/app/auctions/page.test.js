import { render, screen } from "@testing-library/react";
import AuctionsBrowsePage from "./page";
import { apiFetch } from "../../lib/api";

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: jest.fn((url) => url || ""),
}));

jest.mock("../../components/NavBar", () => {
  return function MockNavBar() {
    return <div data-testid="mock-navbar">NavBar</div>;
  };
});

jest.mock("../../components/Footer", () => {
  return function MockFooter() {
    return <div data-testid="mock-footer">Footer</div>;
  };
});

describe("AuctionsBrowsePage - Buyer Round Browsing", () => {
  const sampleActiveRound = {
    id: "round-act-1",
    title: "รอบประมูลเสื้อผ้าวินเทจ",
    auctionStartsAt: "2026-10-01T12:00:00.000Z",
    auctionEndsAt: "2026-10-05T12:00:00.000Z",
    categories: ["เสื้อผ้า"],
    _count: { auctions: 6 },
  };

  const sampleUpcomingRound = {
    id: "round-upc-1",
    title: "รอบประมูลกระเป๋าแบรนด์เนม",
    auctionStartsAt: "2026-10-10T12:00:00.000Z",
    auctionEndsAt: "2026-10-15T12:00:00.000Z",
    categories: ["กระเป๋า"],
    _count: { auctions: 2 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleActiveRound],
          upcomingRounds: [sampleUpcomingRound],
        });
      }
      return Promise.resolve({});
    });
  });

  it("renders round cards for active and upcoming rounds without auto-navigating", async () => {
    render(<AuctionsBrowsePage />);

    expect(
      await screen.findByText("รอบประมูลเสื้อผ้าวินเทจ"),
    ).toBeInTheDocument();
    expect(screen.getByText("รอบประมูลกระเป๋าแบรนด์เนม")).toBeInTheDocument();
    expect(screen.getByText("🟢 กำลังประมูล")).toBeInTheDocument();
    expect(screen.getByText("🗓️ เร็วๆ นี้")).toBeInTheDocument();

    const viewButtons = screen.getAllByRole("link", {
      name: "ดูสินค้าประมูลในรอบนี้",
    });
    expect(viewButtons).toHaveLength(2);
    expect(viewButtons[0]).toHaveAttribute(
      "href",
      "/auctions/rounds/round-act-1",
    );
    expect(viewButtons[1]).toHaveAttribute(
      "href",
      "/auctions/rounds/round-upc-1",
    );
  });

  it("renders single round as a card without skipping directly to round page", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleActiveRound],
          upcomingRounds: [],
        });
      }
      return Promise.resolve({});
    });

    render(<AuctionsBrowsePage />);

    expect(
      await screen.findByText("รอบประมูลเสื้อผ้าวินเทจ"),
    ).toBeInTheDocument();
    const viewButton = screen.getByRole("link", {
      name: "ดูสินค้าประมูลในรอบนี้",
    });
    expect(viewButton).toHaveAttribute("href", "/auctions/rounds/round-act-1");
  });

  it("displays designated empty state when no rounds are available", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.resolve({
          activeAuctionRounds: [],
          upcomingRounds: [],
        });
      }
      return Promise.resolve({});
    });

    render(<AuctionsBrowsePage />);

    expect(
      await screen.findByText("ขณะนี้ยังไม่มีรอบการประมูล"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "ยังไม่มีรอบประมูลที่กำลังเปิดหรือกำลังจะเริ่ม กรุณากลับมาตรวจสอบอีกครั้งในภายหลัง",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ลองโหลดอีกครั้ง/ }),
    ).toBeInTheDocument();
  });

  it("displays cancelled round before auctionEndsAt with 'ยกเลิกแล้ว' badge, reason, and disabled button", async () => {
    const cancelledRound = {
      ...sampleActiveRound,
      id: "round-cancelled-1",
      title: "รอบประมูลที่ถูกยกเลิก",
      phase: "cancelled",
      auctionEndsAt: new Date(Date.now() + 3600000).toISOString(),
      cancelledAt: new Date(Date.now() - 60000).toISOString(),
      cancellationReason: "ระบบขัดข้องชั่วคราว",
    };

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleActiveRound, cancelledRound],
          upcomingRounds: [],
        });
      }
      return Promise.resolve({});
    });

    render(<AuctionsBrowsePage />);

    expect(
      await screen.findByText("รอบประมูลที่ถูกยกเลิก"),
    ).toBeInTheDocument();
    expect(screen.getByText("ยกเลิกแล้ว")).toBeInTheDocument();
    expect(screen.getByText(/ระบบขัดข้องชั่วคราว/)).toBeInTheDocument();
    const disabledBtn = screen.getByRole("button", {
      name: "รอบประมูลถูกยกเลิกแล้ว",
    });
    expect(disabledBtn).toBeDisabled();
  });

  it("displays cancelled upcoming round (cancelled before auctionStartsAt) in Upcoming until auctionEndsAt and hides it after auctionEndsAt", async () => {
    const cancelledUpcomingValid = {
      ...sampleUpcomingRound,
      id: "round-upc-cancelled-valid",
      title: "รอบเร็วๆ นี้ที่ถูกยกเลิกแต่ยังไม่ถึงเวลาจบ",
      phase: "cancelled",
      auctionStartsAt: new Date(Date.now() + 3600000).toISOString(),
      auctionEndsAt: new Date(Date.now() + 7200000).toISOString(),
      cancelledAt: new Date(Date.now() - 60000).toISOString(),
      cancellationReason: "เลื่อนกำหนดการจัดกิจกรรมประมูล",
    };

    const cancelledUpcomingExpired = {
      ...sampleUpcomingRound,
      id: "round-upc-cancelled-expired",
      title: "รอบที่ถูกยกเลิกและเลยเวลาสิ้นสุดเดิมแล้ว",
      phase: "cancelled",
      auctionStartsAt: new Date(Date.now() - 7200000).toISOString(),
      auctionEndsAt: new Date(Date.now() - 1000).toISOString(),
      cancelledAt: new Date(Date.now() - 10800000).toISOString(),
      cancellationReason: "ยกเลิกรอบเก่า",
    };

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.resolve({
          activeAuctionRounds: [],
          upcomingRounds: [cancelledUpcomingValid, cancelledUpcomingExpired],
        });
      }
      return Promise.resolve({});
    });

    render(<AuctionsBrowsePage />);

    expect(
      await screen.findByText("รอบเร็วๆ นี้ที่ถูกยกเลิกแต่ยังไม่ถึงเวลาจบ"),
    ).toBeInTheDocument();
    expect(screen.getByText("ยกเลิกแล้ว")).toBeInTheDocument();
    expect(
      screen.getByText(/เลื่อนกำหนดการจัดกิจกรรมประมูล/),
    ).toBeInTheDocument();

    const disabledBtn = screen.getByRole("button", {
      name: "รอบประมูลถูกยกเลิกแล้ว",
    });
    expect(disabledBtn).toBeDisabled();

    // Expired cancelled round must be hidden after auctionEndsAt
    expect(
      screen.queryByText("รอบที่ถูกยกเลิกและเลยเวลาสิ้นสุดเดิมแล้ว"),
    ).not.toBeInTheDocument();
  });
});
