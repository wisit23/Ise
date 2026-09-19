import { act, render, screen } from "@testing-library/react";
import SwipePage from "./page";
import { apiFetch } from "../../lib/api";

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
      await screen.findByText("ยังไม่มีคลิปรีวิวในขณะนี้"),
    ).toBeInTheDocument();
  });

  it("renders video feed with product card above seller name and description", async () => {
    apiFetch.mockResolvedValueOnce({
      items: [
        {
          id: "video-1",
          videoUrl: "/uploads/video-1.mp4",
          sellerName: "Trusted Seller",
          description: "Demo clip",
          productId: "product-1",
          product: { id: "product-1", title: "Demo Shirt", price: 199 },
        },
      ],
    });

    render(<SwipePage />);

    expect(await screen.findByText("@Trusted Seller")).toBeInTheDocument();
    expect(screen.getByText("Demo clip")).toBeInTheDocument();
    expect(screen.getByText("Demo Shirt")).toBeInTheDocument();
    expect(screen.getByText("฿199")).toBeInTheDocument();

    const productLink = screen.getByRole("link", { name: /Demo Shirt/ });
    expect(productLink).toHaveAttribute("href", "/products/product-1");
  });

  it("reads video deep link query param and restores target active video on feed load", async () => {
    window.history.replaceState(null, "", "/swipe?video=video-2");

    apiFetch.mockResolvedValueOnce({
      items: [
        {
          id: "video-1",
          videoUrl: "/uploads/video-1.mp4",
          sellerName: "Seller One",
          description: "First clip",
        },
        {
          id: "video-2",
          videoUrl: "/uploads/video-2.mp4",
          sellerName: "Seller Two",
          description: "Second target clip",
        },
      ],
    });

    await act(async () => {
      render(<SwipePage />);
    });

    expect(await screen.findByText("@Seller Two")).toBeInTheDocument();
    expect(screen.getByText("Second target clip")).toBeInTheDocument();
  });

  it("falls back to first clip when deep link query param is not found in feed items", async () => {
    window.history.replaceState(null, "", "/swipe?video=missing-id");

    apiFetch.mockResolvedValueOnce({
      items: [
        {
          id: "video-1",
          videoUrl: "/uploads/video-1.mp4",
          sellerName: "Seller One",
          description: "First fallback clip",
        },
        {
          id: "video-2",
          videoUrl: "/uploads/video-2.mp4",
          sellerName: "Seller Two",
          description: "Second clip",
        },
      ],
    });

    await act(async () => {
      render(<SwipePage />);
    });

    expect(await screen.findByText("@Seller One")).toBeInTheDocument();
    expect(screen.getByText("First fallback clip")).toBeInTheDocument();
  });

  it("shows the API error instead of an empty feed", async () => {
    apiFetch.mockRejectedValueOnce(new Error("feed unavailable"));

    render(<SwipePage />);

    expect(await screen.findByText(/feed unavailable/)).toBeInTheDocument();
  });

  it("renders desktop left sidebar with RELOOP logo and primary navigation links", async () => {
    apiFetch.mockResolvedValueOnce({ items: [] });

    await act(async () => {
      render(<SwipePage />);
    });

    const sidebar = screen.getByRole("complementary", {
      name: "เมนูหลัก RELOOP",
    });
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass("hidden");
    expect(sidebar).toHaveClass("lg:flex");

    const logo = screen.getByRole("link", { name: "RE-LOOP หน้าแรก" });
    expect(logo).toHaveAttribute("href", "/");

    const mainNav = screen.getByRole("navigation", { name: "แถบนำทางหลัก" });
    expect(mainNav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "หน้าแรก" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "ปัดดู" })).toHaveAttribute(
      "href",
      "/swipe",
    );
    expect(screen.getByRole("link", { name: "สินค้าทั้งหมด" })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.getByRole("link", { name: "ประมูล" })).toHaveAttribute(
      "href",
      "/auctions",
    );

    const articleLinks = screen.getAllByRole("link", { name: "บทความ" });
    expect(articleLinks[0]).toHaveAttribute("href", "/articles");

    const loginButton = screen.getByRole("link", { name: "เข้าสู่ระบบ" });
    expect(loginButton).toHaveAttribute("href", "/login");
  });
});
