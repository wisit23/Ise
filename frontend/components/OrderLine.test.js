import { render, screen } from "@testing-library/react";
import OrderLine from "./OrderLine";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock("../lib/api", () => ({
  mediaUrl: (url) => url,
}));

jest.mock("../lib/products", () => ({
  fetchProduct: jest.fn().mockResolvedValue({
    id: "p1",
    condition: "Good",
    brand: "Nike",
    size: "L",
    media: [{ url: "/product-photo.jpg" }],
  }),
}));

jest.mock("../lib/catalog", () => ({
  fetchConditions: jest.fn().mockResolvedValue([
    { value: "Good", label: "สภาพดี" },
  ]),
}));

describe("OrderLine", () => {
  it("renders order information without syntax error", async () => {
    const order = {
      id: "ORD-1234567890",
      productId: "p1",
      productTitle: "เสื้อกีฬา Nike",
      price: 1200,
      status: "completed",
    };

    render(
      <OrderLine
        order={order}
        status={<span data-testid="status">สำเร็จ</span>}
      />,
    );

    expect(screen.getByText("เสื้อกีฬา Nike")).toBeInTheDocument();
    expect(screen.getByText("#ORD-1234567890")).toBeInTheDocument();
    expect(screen.getByText("฿1,200")).toBeInTheDocument();
    expect(screen.getByTestId("status")).toBeInTheDocument();
    const photo = await screen.findByRole("img", { name: order.productTitle });
    expect(photo.closest("a")).toHaveAttribute("href", "/products/p1");
  });

  it("can show a non-linked photo while keeping the product title link", async () => {
    const order = {
      id: "order-1", productId: "p1", productTitle: "เสื้อกีฬา Nike", price: 1200,
    };
    render(<OrderLine order={order} linkThumbnail={false} />);
    const photo = await screen.findByRole("img", { name: order.productTitle });
    expect(photo.closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: `ดูสินค้า ${order.productTitle}` })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: order.productTitle })).toHaveAttribute("href", "/products/p1");
  });
});
