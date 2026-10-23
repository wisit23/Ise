import { render, screen } from "@testing-library/react";
import OrderLine from "./OrderLine";

jest.mock("../lib/api", () => ({
  mediaUrl: (url) => url,
}));

jest.mock("../lib/products", () => ({
  fetchProduct: jest.fn().mockResolvedValue({
    id: "p1",
    condition: "Good",
    brand: "Nike",
    size: "L",
    media: [],
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
  });
});
