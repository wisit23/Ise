import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AuctionDetailPage from "./page";
import { apiFetch } from "../../../lib/api";
import { useParams } from "next/navigation";
import {
  getAccessToken,
  getStoredUser,
  getAccessTokenClaims,
  getCurrentRoles,
} from "../../../lib/auth";

jest.mock("next/navigation", () => ({
  useParams: jest.fn(),
}));

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  apiUrl: jest.fn((path) => path),
  mediaUrl: jest.fn((url) => url || ""),
}));

jest.mock("../../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
  getAccessTokenClaims: jest.fn(),
  getCurrentRoles: jest.fn(),
  isCustomerAccountRoles: jest.fn(() => true),
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

jest.mock("../../../components/MediaGallery", () => {
  return function MockMediaGallery() {
    return <div data-testid="mock-media-gallery">MediaGallery</div>;
  };
});

describe("AuctionDetailPage - Navigation to Round", () => {
  const sampleAuctionWithRound = {
    id: "auc-101",
    roundId: "round-shoes",
    status: "open",
    startingPrice: 1500,
    bidIncrement: 100,
    scheduledStartAt: "2026-10-01T12:00:00.000Z",
    scheduledEndAt: "2026-10-05T12:00:00.000Z",
    product: {
      id: "prod-1",
      title: "รองเท้าผ้าใบ Air Jordan 1",
      photos: [],
    },
    round: {
      id: "round-shoes",
      title: "รอบรองเท้าผ้าใบและสตรีทแวร์",
    },
    bids: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useParams.mockReturnValue({ id: "auc-101" });
    getAccessToken.mockReturnValue("mock-buyer-token");
    getStoredUser.mockReturnValue({ id: "buyer-1", role: "BUYER" });
    getAccessTokenClaims.mockReturnValue({ sub: "buyer-1" });
    getCurrentRoles.mockReturnValue(["BUYER"]);

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/auc-101")) {
        return Promise.resolve(sampleAuctionWithRound);
      }
      return Promise.resolve({});
    });
  });

  it("displays round title and back-link to round items page when item has round", async () => {
    render(<AuctionDetailPage />);

    expect(
      await screen.findByText("รองเท้าผ้าใบ Air Jordan 1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("รอบประมูล: รอบรองเท้าผ้าใบและสตรีทแวร์"),
    ).toBeInTheDocument();

    const backLink = screen.getByRole("link", {
      name: /กลับไปดูสินค้าทั้งหมดในรอบนี้/,
    });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/auctions/rounds/round-shoes");
  });

  it("falls back to general auctions link when item has no round", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/auc-101")) {
        return Promise.resolve({
          ...sampleAuctionWithRound,
          roundId: null,
          round: null,
        });
      }
      return Promise.resolve({});
    });

    render(<AuctionDetailPage />);

    expect(
      await screen.findByText("รองเท้าผ้าใบ Air Jordan 1"),
    ).toBeInTheDocument();

    const backLink = screen.getByRole("link", {
      name: "← กลับหน้ารวมรอบประมูล",
    });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/auctions");
  });

  it("rejects an amount above 1,000,000 baht before calling the bid API", async () => {
    render(<AuctionDetailPage />);

    const input = await screen.findByRole("spinbutton");
    expect(input).toHaveAttribute("max", "1000000");
    fireEvent.change(input, { target: { value: "1000001" } });
    fireEvent.click(
      screen.getByRole("button", { name: "เสนอราคา ฿1,000,001" }),
    );

    expect(
      screen.getByText("ราคาเสนอประมูลต่อครั้งต้องไม่เกิน 1,000,000 บาท"),
    ).toBeInTheDocument();
    expect(
      apiFetch.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
  });

  it("submits a raise below 10,000 baht without opening confirmation", async () => {
    apiFetch.mockImplementation((url, options) => {
      if (options?.method === "POST") {
        return Promise.resolve({ id: "bid-1", amount: options.body.amount });
      }
      return Promise.resolve(sampleAuctionWithRound);
    });
    render(<AuctionDetailPage />);

    const input = await screen.findByRole("spinbutton");
    fireEvent.change(input, { target: { value: "11499" } });
    fireEvent.click(screen.getByRole("button", { name: "เสนอราคา ฿11,499" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/products/auctions/auc-101/bids",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ amount: 11_499 }),
        }),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("locks the bid button for 2 seconds after a successful bid", async () => {
    apiFetch.mockImplementation((url, options) => {
      if (options?.method === "POST") {
        return Promise.resolve({ id: "bid-1", amount: options.body.amount });
      }
      return Promise.resolve(sampleAuctionWithRound);
    });
    render(<AuctionDetailPage />);

    const input = await screen.findByRole("spinbutton");
    fireEvent.change(input, { target: { value: "1600" } });
    fireEvent.click(screen.getByRole("button", { name: "เสนอราคา ฿1,600" }));

    const cooldownButton = await screen.findByRole("button", {
      name: "รอ 2 วินาที",
    });
    expect(cooldownButton).toBeDisabled();
  });

  it("requires confirmation when the raise is at least 10,000 baht and submits the displayed amount", async () => {
    apiFetch.mockImplementation((url, options) => {
      if (options?.method === "POST") {
        return Promise.resolve({ id: "bid-1", amount: options.body.amount });
      }
      return Promise.resolve(sampleAuctionWithRound);
    });
    render(<AuctionDetailPage />);

    const input = await screen.findByRole("spinbutton");
    fireEvent.change(input, { target: { value: "11500" } });
    fireEvent.click(screen.getByRole("button", { name: "เสนอราคา ฿11,500" }));

    const dialog = screen.getByRole("dialog", { name: "ยืนยันยอดเสนอราคา" });
    expect(dialog).toHaveTextContent("ราคาปัจจุบัน ฿1,500");
    expect(dialog).toHaveTextContent("เพิ่มขึ้น ฿10,000");
    expect(
      screen.getByRole("button", { name: "ยืนยันเสนอราคา ฿11,500" }),
    ).toBeInTheDocument();
    expect(
      apiFetch.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: "ยืนยันเสนอราคา ฿11,500" }),
    );

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/products/auctions/auc-101/bids",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ amount: 11_500 }),
        }),
      ),
    );
  });

  it("TC_AUC15 reloads the committed auction immediately when SSE reports a bid", async () => {
    const originalEventSource = global.EventSource;
    let source;
    class MockEventSource {
      constructor(url) {
        this.url = url;
        this.listeners = new Map();
        source = this;
      }
      addEventListener(type, listener) {
        this.listeners.set(type, listener);
      }
      removeEventListener(type) {
        this.listeners.delete(type);
      }
      close() {}
    }
    global.EventSource = MockEventSource;

    try {
      render(<AuctionDetailPage />);
      await screen.findByText("รองเท้าผ้าใบ Air Jordan 1");
      expect(source.url).toBe("/api/products/auctions/auc-101/events");
      apiFetch.mockClear();

      await act(async () => {
        source.listeners.get("auction-update")?.({ type: "auction-update" });
      });

      await waitFor(() =>
        expect(apiFetch).toHaveBeenCalledWith(
          "/api/products/auctions/auc-101",
        ),
      );
    } finally {
      global.EventSource = originalEventSource;
    }
  });
});

describe("AuctionDetailPage - Closed auction after payment-rollover", () => {
  const closedAuctionAfterRollover = {
    id: "auc-rollover",
    roundId: "round-rollover",
    status: "closed",
    startingPrice: 500,
    bidIncrement: 10,
    winningBidId: "bid-promoted",
    scheduledStartAt: "2026-10-01T12:00:00.000Z",
    scheduledEndAt: "2026-10-05T12:00:00.000Z",
    product: { id: "prod-rollover", title: "เสื้อแจ็คเก็ต", photos: [] },
    round: { id: "round-rollover", title: "รอบเสื้อผ้า" },
    bids: [
      { id: "bid-expired", amount: 5585, bidderId: "buyer-expired" },
      { id: "bid-promoted", amount: 5580, bidderId: "buyer-promoted" },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useParams.mockReturnValue({ id: "auc-rollover" });
    getAccessToken.mockReturnValue("mock-token");
    getCurrentRoles.mockReturnValue(["BUYER"]);
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/auc-rollover")) {
        return Promise.resolve(closedAuctionAfterRollover);
      }
      return Promise.resolve({});
    });
  });

  it("congratulates the promoted winner, not the original highest bidder who forfeited", async () => {
    getStoredUser.mockReturnValue({ id: "buyer-promoted" });
    getAccessTokenClaims.mockReturnValue({ sub: "buyer-promoted" });

    render(<AuctionDetailPage />);

    expect(await screen.findByText("เสื้อแจ็คเก็ต")).toBeInTheDocument();
    expect(
      screen.getByText("ยินดีด้วย! คุณเป็นผู้ชนะการประมูลสินค้านี้"),
    ).toBeInTheDocument();
    expect(screen.getByText(/ที่ราคา ฿5,580/)).toBeInTheDocument();
  });

  it("does not congratulate the original highest bidder once they lose their payment right", async () => {
    getStoredUser.mockReturnValue({ id: "buyer-expired" });
    getAccessTokenClaims.mockReturnValue({ sub: "buyer-expired" });

    render(<AuctionDetailPage />);

    expect(await screen.findByText("เสื้อแจ็คเก็ต")).toBeInTheDocument();
    expect(
      screen.queryByText("ยินดีด้วย! คุณเป็นผู้ชนะการประมูลสินค้านี้"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/มีผู้ชนะการประมูลที่ราคา ฿5,580/)).toBeInTheDocument();
  });

  it("shows the historical highest price label and the actual winning amount to other viewers", async () => {
    getStoredUser.mockReturnValue({ id: "some-other-buyer" });
    getAccessTokenClaims.mockReturnValue({ sub: "some-other-buyer" });

    render(<AuctionDetailPage />);

    expect(await screen.findByText("เสื้อแจ็คเก็ต")).toBeInTheDocument();
    expect(screen.getByText("ราคาสูงสุดที่เคยมี")).toBeInTheDocument();
    expect(screen.getAllByText("฿5,585").length).toBeGreaterThan(0);
    expect(screen.getByText(/มีผู้ชนะการประมูลที่ราคา ฿5,580/)).toBeInTheDocument();
  });

  it("labels the actual winning bid row in the bid history table, not the forfeited highest bid", async () => {
    getStoredUser.mockReturnValue({ id: "some-other-buyer" });
    getAccessTokenClaims.mockReturnValue({ sub: "some-other-buyer" });

    render(<AuctionDetailPage />);

    await screen.findByText("เสื้อแจ็คเก็ต");

    expect(screen.getByText("ผู้ชนะ")).toBeInTheDocument();
    expect(screen.getByText("เสียสิทธิ์")).toBeInTheDocument();
    expect(screen.queryByText("สูงสุด")).not.toBeInTheDocument();

    const winningRow = screen.getByText("ผู้ชนะ").closest("tr");
    expect(within(winningRow).getByText("ผู้ใช้ omoted")).toBeInTheDocument();

    const forfeitedRow = screen.getByText("เสียสิทธิ์").closest("tr");
    expect(within(forfeitedRow).getByText("ผู้ใช้ xpired")).toBeInTheDocument();
  });
});
