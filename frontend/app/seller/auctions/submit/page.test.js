import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SellerAuctionSubmitPage from "./page";
import { apiFetch } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";
import { useRouter, useSearchParams } from "next/navigation";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock("../../../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

jest.mock("../../../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../../../lib/catalog", () => ({
  fetchCategories: jest.fn(() =>
    Promise.resolve(["เสื้อผ้า", "รองเท้า", "กระเป๋า"]),
  ),
  fetchConditions: jest.fn(() =>
    Promise.resolve([
      { value: "new_with_tag", label: "ใหม่พร้อมป้าย" },
      { value: "like_new", label: "เหมือนใหม่" },
    ]),
  ),
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

jest.mock("../../../../components/MediaUploader", () => {
  return function MockMediaUploader({ onChange }) {
    return (
      <div data-testid="mock-media-uploader">
        <button
          type="button"
          onClick={() =>
            onChange([
              "https://example.com/1.jpg",
              "https://example.com/2.jpg",
              "https://example.com/3.jpg",
              "https://example.com/4.jpg",
            ])
          }
        >
          Add 4 Media
        </button>
      </div>
    );
  };
});

jest.mock("../../../../components/TagInput", () => {
  return function MockTagInput({ onChange }) {
    return (
      <input
        data-testid="mock-tag-input"
        placeholder="tag"
        onChange={(e) => onChange([e.target.value])}
      />
    );
  };
});

describe("SellerAuctionSubmitPage - Explicit roundId submission and category validation", () => {
  const mockPush = jest.fn();
  const mockUser = {
    id: "seller-123",
    role: "SELLER",
    name: "Seller One",
  };

  const sampleRoundShoesOnly = {
    id: "round-shoes",
    title: "รอบรองเท้าผ้าใบ",
    submissionStartsAt: "2026-10-01T00:00:00.000Z",
    submissionEndsAt: "2026-10-30T00:00:00.000Z",
    auctionStartsAt: "2026-10-30T12:00:00.000Z",
    auctionEndsAt: "2026-11-02T12:00:00.000Z",
    categories: ["รองเท้า"],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
    useSearchParams.mockReturnValue(new URLSearchParams("roundId=round-shoes"));
    getAccessToken.mockReturnValue("mock-seller-token");
    getStoredUser.mockReturnValue(mockUser);

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "VERIFIED" });
      }
      if (url.includes("/api/products/auctions/rounds/round-shoes")) {
        return Promise.resolve(sampleRoundShoesOnly);
      }
      return Promise.resolve({});
    });
  });

  it("shows error and does not render form when roundId query param is missing", async () => {
    useSearchParams.mockReturnValue(new URLSearchParams(""));

    render(<SellerAuctionSubmitPage />);

    expect(
      await screen.findByText("กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /เปลี่ยนรอบประมูล/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/เช่น เสื้อยืดวินเทจ/),
    ).not.toBeInTheDocument();
  });

  it("shows error and does not render form when selected round is expired", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "VERIFIED" });
      }
      if (url.includes("/api/products/auctions/rounds/")) {
        return Promise.resolve({
          ...sampleRoundShoesOnly,
          submissionStartsAt: "2026-09-01T00:00:00.000Z",
          submissionEndsAt: "2026-09-05T00:00:00.000Z",
        });
      }
      return Promise.resolve({});
    });

    render(<SellerAuctionSubmitPage />);

    expect(
      await screen.findByText("รอบประมูลนี้ปิดรับสินค้าแล้ว กรุณาเลือกรอบอื่น"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /เปลี่ยนรอบประมูล/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/เช่น เสื้อยืดวินเทจ/),
    ).not.toBeInTheDocument();
  });

  it("renders round banner and 'เปลี่ยนรอบประมูล' button when round is active", async () => {
    render(<SellerAuctionSubmitPage />);

    expect(await screen.findByText("รอบรองเท้าผ้าใบ")).toBeInTheDocument();
    expect(screen.getByText("เปลี่ยนรอบประมูล")).toBeInTheDocument();
    expect(screen.getByText("รองเท้า")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/เช่น เสื้อยืดวินเทจ/),
    ).toBeInTheDocument();
  });

  it("rejects client submission when category is not accepted by selected round", async () => {
    render(<SellerAuctionSubmitPage />);

    await screen.findByText("รอบรองเท้าผ้าใบ");

    fireEvent.change(screen.getByPlaceholderText(/เช่น เสื้อยืดวินเทจ/), {
      target: { value: "เสื้อเชิ้ต" },
    });
    fireEvent.change(screen.getByPlaceholderText(/พิมพ์หรือเลือกหมวดหมู่/), {
      target: { value: "เสื้อผ้า" },
    });
    fireEvent.change(screen.getByLabelText(/สภาพสินค้า/), {
      target: { value: "like_new" },
    });
    fireEvent.change(screen.getByLabelText(/ราคาเริ่มต้น/), {
      target: { value: "300" },
    });
    fireEvent.change(screen.getByLabelText(/เพิ่มขั้นต่ำต่อครั้ง/), {
      target: { value: "50" },
    });

    fireEvent.click(screen.getByRole("button", { name: /ลงสินค้าเข้าประมูล/ }));

    expect(
      await screen.findByText(
        /รอบประมูลนี้ไม่เปิดรับสินค้าหมวดหมู่ "เสื้อผ้า"/,
      ),
    ).toBeInTheDocument();
  });

  it("submits atomic payload including roundId when category is valid", async () => {
    let capturedBody = null;
    let capturedUrl = null;
    let capturedMethod = null;

    apiFetch.mockImplementation((url, opts) => {
      if (url.includes("/api/auth/kyc/mine")) {
        return Promise.resolve({ kycStatus: "VERIFIED" });
      }
      if (url.includes("/api/products/auctions/rounds/round-shoes")) {
        return Promise.resolve(sampleRoundShoesOnly);
      }
      if (opts?.method === "POST" && url === "/api/products/auctions") {
        capturedMethod = opts.method;
        capturedUrl = url;
        capturedBody = opts.body;
        return Promise.resolve({ id: "auc-created-1" });
      }
      return Promise.resolve({});
    });

    render(<SellerAuctionSubmitPage />);

    await screen.findByText("รอบรองเท้าผ้าใบ");

    fireEvent.change(screen.getByPlaceholderText(/เช่น เสื้อยืดวินเทจ/), {
      target: { value: "รองเท้าผ้าใบ Nike Dunk Low" },
    });
    fireEvent.change(screen.getByPlaceholderText(/พิมพ์หรือเลือกหมวดหมู่/), {
      target: { value: "รองเท้า" },
    });
    fireEvent.change(screen.getByLabelText(/สภาพสินค้า/), {
      target: { value: "like_new" },
    });
    fireEvent.change(screen.getByLabelText(/ราคาเริ่มต้น/), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText(/เพิ่มขั้นต่ำต่อครั้ง/), {
      target: { value: "100" },
    });

    // Add media
    fireEvent.click(screen.getByText("Add 4 Media"));

    fireEvent.click(screen.getByRole("button", { name: /ลงสินค้าเข้าประมูล/ }));

    await waitFor(() => {
      expect(capturedUrl).toBe("/api/products/auctions");
      expect(capturedMethod).toBe("POST");
      expect(capturedBody).toEqual({
        roundId: "round-shoes",
        title: "รองเท้าผ้าใบ Nike Dunk Low",
        description: "",
        category: "รองเท้า",
        condition: "like_new",
        size: "Free size",
        location: "",
        tags: [],
        media: [
          "https://example.com/1.jpg",
          "https://example.com/2.jpg",
          "https://example.com/3.jpg",
          "https://example.com/4.jpg",
        ],
        startingPrice: 2500,
        bidIncrement: 100,
      });
      expect(mockPush).toHaveBeenCalledWith("/seller/auctions");
    });
  });
});
