import { render, screen, fireEvent } from "@testing-library/react";
import RoundDetailPage from "./page";
import { apiFetch } from "../../../../lib/api";
import { useParams, useRouter } from "next/navigation";

jest.mock("next/navigation", () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock("../../../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: jest.fn((url) => url || ""),
}));

jest.mock("../../../../components/NavBar", () => {
  return function MockNavBar() {
    return <div data-testid="mock-navbar">NavBar</div>;
  };
});

jest.mock("../../../../components/Footer", () => {
  return function MockFooter() {
    return <div data-testid="mock-footer">Footer</div>;
  };
});

describe("RoundDetailPage - Buyer Round Items & Round Switcher", () => {
  const mockPush = jest.fn();
  const sampleRound = {
    id: "round-1",
    title: "รอบประมูลของสะสมวินเทจ",
    phase: "auction",
    auctionStartsAt: "2026-10-01T12:00:00.000Z",
    auctionEndsAt: "2026-10-05T12:00:00.000Z",
    categories: ["ของสะสม"],
  };

  const sampleRound2 = {
    id: "round-2",
    title: "รอบประมูลกล้องฟิล์ม",
    phase: "auction",
    auctionStartsAt: "2026-10-02T12:00:00.000Z",
    auctionEndsAt: "2026-10-06T12:00:00.000Z",
    categories: ["กล้อง"],
  };

  const sampleItems = [
    {
      id: "item-1",
      status: "open",
      startingPrice: 1200,
      product: {
        title: "นาฬิกาโบราณ Omega",
        photos: [{ url: "https://example.com/omega.jpg" }],
      },
    },
    {
      id: "item-2",
      status: "scheduled",
      startingPrice: 800,
      product: {
        title: "ไฟแช็ก Zippo วินเทจ",
        photos: [{ url: "https://example.com/zippo.jpg" }],
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    useParams.mockReturnValue({ roundId: "round-1" });
    useRouter.mockReturnValue({ push: mockPush });

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/round-1/items")) {
        return Promise.resolve({
          round: sampleRound,
          items: sampleItems,
        });
      }
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleRound, sampleRound2],
          upcomingRounds: [],
        });
      }
      return Promise.resolve({});
    });
  });

  it("renders round info and items grouped by open and scheduled status", async () => {
    render(<RoundDetailPage />);

    expect(
      await screen.findByText("รอบประมูลของสะสมวินเทจ"),
    ).toBeInTheDocument();
    expect(screen.getByText("🟢 กำลังประมูล")).toBeInTheDocument();
    expect(screen.getByText("ของสะสม")).toBeInTheDocument();
    expect(screen.getByText("← กลับหน้ารวมรอบประมูล")).toBeInTheDocument();

    // Check items
    expect(screen.getByText("นาฬิกาโบราณ Omega")).toBeInTheDocument();
    expect(screen.getByText("เริ่มต้น ฿1,200")).toBeInTheDocument();
    expect(screen.getByText("ไฟแช็ก Zippo วินเทจ")).toBeInTheDocument();
    expect(screen.getByText("เริ่มต้น ฿800")).toBeInTheDocument();
  });

  it("renders round switcher button and opens popover listing available rounds", async () => {
    render(<RoundDetailPage />);

    const switcherBtn = await screen.findByRole("button", {
      name: "เปลี่ยนรอบประมูล",
    });
    expect(switcherBtn).toBeInTheDocument();

    fireEvent.click(switcherBtn);

    expect(
      await screen.findByText("สลับไปดูรอบประมูลอื่น"),
    ).toBeInTheDocument();
    expect(screen.getByText("รอบปัจจุบัน")).toBeInTheDocument();
    expect(screen.getByText("รอบประมูลกล้องฟิล์ม")).toBeInTheDocument();
  });

  it("navigates to selected round when another round is clicked in switcher", async () => {
    render(<RoundDetailPage />);

    const switcherBtn = await screen.findByRole("button", {
      name: "เปลี่ยนรอบประมูล",
    });
    fireEvent.click(switcherBtn);

    const round2Btn = await screen.findByText("รอบประมูลกล้องฟิล์ม");
    fireEvent.click(round2Btn);

    expect(mockPush).toHaveBeenCalledWith("/auctions/rounds/round-2");
  });

  it("closes switcher popover on Escape key press", async () => {
    render(<RoundDetailPage />);

    const switcherBtn = await screen.findByRole("button", {
      name: "เปลี่ยนรอบประมูล",
    });
    fireEvent.click(switcherBtn);

    expect(
      await screen.findByText("สลับไปดูรอบประมูลอื่น"),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByText("สลับไปดูรอบประมูลอื่น")).not.toBeInTheDocument();
  });

  it("renders designated empty state when round has 0 items", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/round-1/items")) {
        return Promise.resolve({
          round: sampleRound,
          items: [],
        });
      }
      return Promise.resolve({
        activeAuctionRounds: [sampleRound],
        upcomingRounds: [],
      });
    });

    render(<RoundDetailPage />);

    expect(
      await screen.findByText("ยังไม่มีสินค้าที่เปิดประมูลในรอบนี้"),
    ).toBeInTheDocument();
  });

  it("renders switcher error state with retry button when browse API fails", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/round-1/items")) {
        return Promise.resolve({
          round: sampleRound,
          items: sampleItems,
        });
      }
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.reject(new Error("Network Error"));
      }
      return Promise.resolve({});
    });

    render(<RoundDetailPage />);

    const switcherBtn = await screen.findByRole("button", {
      name: "เปลี่ยนรอบประมูล",
    });
    fireEvent.click(switcherBtn);

    expect(
      await screen.findByText(
        "ไม่สามารถโหลดรายการรอบประมูลได้ กรุณาลองใหม่อีกครั้ง",
      ),
    ).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: "ลองใหม่" });
    expect(retryBtn).toBeInTheDocument();

    // Now mock browse to succeed on retry
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/round-1/items")) {
        return Promise.resolve({
          round: sampleRound,
          items: sampleItems,
        });
      }
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleRound, sampleRound2],
          upcomingRounds: [],
        });
      }
      return Promise.resolve({});
    });

    fireEvent.click(retryBtn);

    expect(await screen.findByText("รอบประมูลกล้องฟิล์ม")).toBeInTheDocument();
  });

  it("renders empty other rounds message when only the current round exists", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/round-1/items")) {
        return Promise.resolve({
          round: sampleRound,
          items: sampleItems,
        });
      }
      if (url.includes("/api/products/auctions/rounds/browse")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleRound],
          upcomingRounds: [],
        });
      }
      return Promise.resolve({});
    });

    render(<RoundDetailPage />);

    const switcherBtn = await screen.findByRole("button", {
      name: "เปลี่ยนรอบประมูล",
    });
    fireEvent.click(switcherBtn);

    expect(
      await screen.findByText("ขณะนี้ยังไม่มีรอบประมูลอื่นให้เลือก"),
    ).toBeInTheDocument();
  });
});
