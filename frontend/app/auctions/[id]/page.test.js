import { render, screen } from "@testing-library/react";
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
});
