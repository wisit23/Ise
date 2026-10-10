import { render, screen, fireEvent } from "@testing-library/react";
import SellerAuctionsPage from "./page";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { useRouter } from "next/navigation";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("../../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../../components/NavBar", () => {
  return function MockNavBar() {
    return <div data-testid="mock-navbar">NavBar</div>;
  };
});

jest.mock("../../../components/Footer", () => {
  return function MockFooter() {
    return <div data-testid="mock-footer">Footer</div>;
  };
});

describe("SellerAuctionsPage - Explicit Round Selection & Empty State", () => {
  const mockPush = jest.fn();
  const mockUser = {
    id: "seller-123",
    role: "SELLER",
    name: "Seller One",
  };

  const sampleRound1 = {
    id: "round-1",
    title: "รอบประมูลแฟชั่นวินเทจ",
    submissionStartsAt: "2026-10-01T00:00:00.000Z",
    submissionEndsAt: "2026-10-03T00:00:00.000Z",
    auctionStartsAt: "2026-10-03T12:00:00.000Z",
    auctionEndsAt: "2026-10-05T12:00:00.000Z",
    categories: ["เสื้อผ้า", "เครื่องประดับ"],
  };

  const sampleRound2 = {
    id: "round-2",
    title: "รอบประมูลรองเท้าผ้าใบ",
    submissionStartsAt: "2026-10-01T00:00:00.000Z",
    submissionEndsAt: "2026-10-04T00:00:00.000Z",
    auctionStartsAt: "2026-10-04T12:00:00.000Z",
    auctionEndsAt: "2026-10-06T12:00:00.000Z",
    categories: ["รองเท้า"],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
    getAccessToken.mockReturnValue("mock-seller-token");
    getStoredUser.mockReturnValue(mockUser);

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "VERIFIED" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRound1],
          isSubmissionOpen: true,
          phase: "submission",
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({});
    });
  });

  it("opens the round picker even when only 1 round exists, without auto-selecting", async () => {
    render(<SellerAuctionsPage />);

    const openPickerButton = await screen.findByRole("button", {
      name: "เลือกรอบประมูล",
    });
    expect(screen.queryByText("รอบประมูลแฟชั่นวินเทจ")).not.toBeInTheDocument();
    fireEvent.click(openPickerButton);

    expect(
      await screen.findByText("รอบประมูลแฟชั่นวินเทจ"),
    ).toBeInTheDocument();
    expect(screen.getByText("กำลังเปิดรับ")).toBeInTheDocument();
    expect(screen.getByText("เสื้อผ้า")).toBeInTheDocument();
    expect(screen.getByText("เครื่องประดับ")).toBeInTheDocument();

    const selectLink = screen.getByRole("link", { name: "เลือกรอบนี้" });
    expect(selectLink).toBeInTheDocument();
    expect(selectLink).toHaveAttribute(
      "href",
      "/seller/auctions/submit?roundId=round-1",
    );

    // Verify router was not pushed automatically
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("renders all active submission rounds inside the popup", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "VERIFIED" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRound1, sampleRound2],
          isSubmissionOpen: true,
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({});
    });

    render(<SellerAuctionsPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "เลือกรอบประมูล" }),
    );

    expect(
      await screen.findByText("รอบประมูลแฟชั่นวินเทจ"),
    ).toBeInTheDocument();
    expect(screen.getByText("รอบประมูลรองเท้าผ้าใบ")).toBeInTheDocument();

    const selectLinks = screen.getAllByRole("link", { name: "เลือกรอบนี้" });
    expect(selectLinks).toHaveLength(2);
    expect(selectLinks[0]).toHaveAttribute(
      "href",
      "/seller/auctions/submit?roundId=round-1",
    );
    expect(selectLinks[1]).toHaveAttribute(
      "href",
      "/seller/auctions/submit?roundId=round-2",
    );
  });

  it("displays designated empty state and retry button when no active submission rounds exist", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "VERIFIED" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [],
          isSubmissionOpen: false,
          round: null,
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({});
    });

    render(<SellerAuctionsPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "เลือกรอบประมูล" }),
    );

    expect(
      await screen.findByText("ขณะนี้ยังไม่มีรอบประมูลที่เปิดรับสินค้า"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "ฝ่ายการตลาดยังไม่ได้เปิดรอบรับสินค้าเข้าประมูล กรุณากลับมาตรวจสอบอีกครั้งในภายหลัง",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ลองโหลดอีกครั้ง/ }),
    ).toBeInTheDocument();

    // Verify form is NOT rendered
    expect(
      screen.queryByPlaceholderText(/เช่น เสื้อยืดวินเทจ/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "เลือกรอบนี้" }),
    ).not.toBeInTheDocument();
  });

  it("shows KYC warning banner when KYC is not verified", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "PENDING" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRound1],
          isSubmissionOpen: true,
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({});
    });

    render(<SellerAuctionsPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "เลือกรอบประมูล" }),
    );

    expect(
      await screen.findByText(/บัญชีผู้ขายยังไม่ผ่านการยืนยันตัวตน \(KYC\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ต้องยืนยันตัวตน (KYC) ก่อนส่งสินค้า"),
    ).toBeInTheDocument();
  });

  it("renders seller's submitted auctions history", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "VERIFIED" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRound1],
          isSubmissionOpen: true,
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({
          items: [
            {
              id: "auc-1",
              sellerId: "seller-123",
              productId: "prod-1",
              status: "open",
              startingPrice: 500,
              product: { title: "เสื้อเชิ้ตลายสก็อต" },
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    render(<SellerAuctionsPage />);

    expect(await screen.findByText("เสื้อเชิ้ตลายสก็อต")).toBeInTheDocument();
    expect(screen.getByText("กำลังประมูล")).toBeInTheDocument();
    expect(screen.getByText("ราคาเริ่มต้น ฿500")).toBeInTheDocument();
  });

  it("renders 'รอคุณดำเนินการ' section for products with status auction_action_required", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine"))
        return Promise.resolve({ kycStatus: "VERIFIED" });
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRound1],
          isSubmissionOpen: true,
        });
      }
      if (url.includes("/api/products/mine?status=auction_action_required")) {
        return Promise.resolve({
          items: [
            {
              id: "prod-rec-1",
              title: "กางเกงยีนส์วินเทจ",
              category: "เสื้อผ้า",
              status: "auction_action_required",
            },
          ],
        });
      }
      if (url.includes("/api/products/auctions"))
        return Promise.resolve({ items: [] });
      return Promise.resolve({});
    });

    render(<SellerAuctionsPage />);

    expect(
      await screen.findByRole("heading", { name: /รอคุณดำเนินการ/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("กางเกงยีนส์วินเทจ")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ส่งเข้ารอบประมูลใหม่" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "นำกลับไปขายแบบปกติ" }),
    ).toBeInTheDocument();
  });

  it("allows relisting action required product as normal listing with new price validation", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine"))
        return Promise.resolve({ kycStatus: "VERIFIED" });
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRound1],
          isSubmissionOpen: true,
        });
      }
      if (url.includes("/api/products/mine?status=auction_action_required")) {
        return Promise.resolve({
          items: [
            {
              id: "prod-rec-1",
              title: "กางเกงยีนส์วินเทจ",
              category: "เสื้อผ้า",
              status: "auction_action_required",
            },
          ],
        });
      }
      if (url.includes("/relist-available")) {
        return Promise.resolve({
          id: "prod-rec-1",
          status: "available",
          price: 850,
        });
      }
      if (url.includes("/api/products/auctions"))
        return Promise.resolve({ items: [] });
      return Promise.resolve({});
    });

    render(<SellerAuctionsPage />);

    const relistBtn = await screen.findByRole("button", {
      name: "นำกลับไปขายแบบปกติ",
    });
    fireEvent.click(relistBtn);

    // Modal opens
    expect(
      screen.getByRole("heading", { name: "นำสินค้ากลับไปขายแบบปกติ" }),
    ).toBeInTheDocument();
    const priceInput = screen.getByPlaceholderText("กรอกราคาขายใหม่ เช่น 500");
    expect(priceInput).toHaveValue(null); // Price must NOT be pre-filled

    // Enter new positive price and submit
    fireEvent.change(priceInput, { target: { value: "850" } });
    const confirmBtn = screen.getByRole("button", { name: "ยืนยันการนำไปขาย" });
    fireEvent.click(confirmBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/prod-rec-1/relist-available",
      expect.objectContaining({
        method: "POST",
        body: { price: 850 },
      }),
    );
  });

  it("allows selecting new round for recovery product and passes productId in url", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine"))
        return Promise.resolve({ kycStatus: "VERIFIED" });
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRound1],
          isSubmissionOpen: true,
        });
      }
      if (url.includes("/api/products/mine?status=auction_action_required")) {
        return Promise.resolve({
          items: [
            {
              id: "prod-rec-1",
              title: "กางเกงยีนส์วินเทจ",
              category: "เสื้อผ้า",
              status: "auction_action_required",
            },
          ],
        });
      }
      if (url.includes("/api/products/auctions"))
        return Promise.resolve({ items: [] });
      return Promise.resolve({});
    });

    render(<SellerAuctionsPage />);

    const newRoundBtn = await screen.findByRole("button", {
      name: "ส่งเข้ารอบประมูลใหม่",
    });
    fireEvent.click(newRoundBtn);

    expect(
      screen.getByRole("heading", { name: "เลือกรอบประมูลใหม่" }),
    ).toBeInTheDocument();

    const chooseRoundLink = screen.getByRole("link", {
      name: "เลือกรอบนี้สำหรับสินค้านี้",
    });
    expect(chooseRoundLink).toBeInTheDocument();
    expect(chooseRoundLink).toHaveAttribute(
      "href",
      "/seller/auctions/submit?roundId=round-1&productId=prod-rec-1",
    );
  });
});
