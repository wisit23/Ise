import { render, screen, waitFor } from "@testing-library/react";
import ChatProductHeader from "./ChatProductHeader";
import { fetchProduct } from "../../lib/products";

jest.mock("../../lib/products", () => ({
  fetchProduct: jest.fn(),
}));

jest.mock("../../lib/api", () => ({
  mediaUrl: (url) => url,
}));

describe("ChatProductHeader", () => {
  beforeEach(() => {
    fetchProduct.mockReset();
  });

  it("renders nothing when productId is not provided", () => {
    const { container } = render(<ChatProductHeader productId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("fetches and renders product details with price and status", async () => {
    fetchProduct.mockResolvedValueOnce({
      id: "prod-1",
      title: "เสื้อแจ็คเก็ตยีนส์ Levi's",
      price: 1590,
      status: "available",
      media: [{ url: "https://example.com/jacket.jpg" }],
    });

    render(<ChatProductHeader productId="prod-1" />);

    await waitFor(() => {
      expect(screen.getByText("เสื้อแจ็คเก็ตยีนส์ Levi's")).toBeInTheDocument();
    });

    expect(screen.getByText("฿1,590")).toBeInTheDocument();
    expect(screen.getByText("พร้อมขาย")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ดูสินค้า/ })).toHaveAttribute(
      "href",
      "/products/prod-1",
    );
  });

  it("renders reserved status badge when product is reserved", async () => {
    fetchProduct.mockResolvedValueOnce({
      id: "prod-2",
      title: "กระเป๋าสะพาย",
      price: 890,
      status: "reserved",
      media: [],
    });

    render(<ChatProductHeader productId="prod-2" />);

    await waitFor(() => {
      expect(screen.getByText("ถูกจองแล้ว")).toBeInTheDocument();
    });
  });
});
