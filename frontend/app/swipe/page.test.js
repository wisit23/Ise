import { render, screen } from "@testing-library/react";
import SwipePage from "./page";
import { apiFetch } from "../../lib/api";

jest.mock(
  "../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: (url) => url,
}));

describe("SwipePage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("shows a clear empty state when the feed has no clips", async () => {
    apiFetch.mockResolvedValueOnce({ items: [] });

    render(<SwipePage />);

    expect(
      await screen.findByText("ยังไม่มีวิดีโอรีวิวในระบบ"),
    ).toBeInTheDocument();
  });

  it("renders a product link from the video feed", async () => {
    apiFetch.mockResolvedValueOnce({
      items: [
        {
          id: "video-1",
          videoUrl: "/uploads/video-1.mp4",
          sellerName: "Trusted Seller",
          description: "Demo clip",
          productId: "product-1",
          product: { id: "product-1", price: 199 },
        },
      ],
    });

    render(<SwipePage />);

    const productLink = await screen.findByRole("link", {
      name: /ดูรายละเอียดสินค้า/,
    });
    expect(productLink).toHaveAttribute("href", "/products/product-1");
    expect(screen.getByText("@Trusted Seller")).toBeInTheDocument();
  });

  it("shows the API error instead of an empty feed", async () => {
    apiFetch.mockRejectedValueOnce(new Error("feed unavailable"));

    render(<SwipePage />);

    expect(await screen.findByText(/feed unavailable/)).toBeInTheDocument();
  });
});
