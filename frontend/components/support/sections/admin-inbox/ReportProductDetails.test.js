import { fireEvent, render, screen } from "@testing-library/react";
import ReportProductDetails from "./ReportProductDetails";

it("shows listing details and media, enlarges photos, and links directly to the product", async () => {
  const { container } = render(
    <ReportProductDetails
      productId="p-1"
      detail={{
        available: true,
        product: {
          id: "p-1",
          title: "กางเกงยีนส์ทรงตรง",
          price: 350,
          status: "available",
          description: "เอว 26 นิ้ว\nมีตำหนิบริเวณกระเป๋า",
          brand: "Denim",
          condition: "Good",
          size: "S",
          category: "เสื้อผ้า",
          location: "กรุงเทพฯ",
          tags: ["ยีนส์"],
          media: [
            { type: "image", url: "/uploads/jeans.jpg" },
            { type: "video", url: "/uploads/jeans.mp4" },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText("กางเกงยีนส์ทรงตรง")).toBeInTheDocument();
  expect(screen.getByText("350 บาท")).toBeInTheDocument();
  expect(screen.getByText(/มีตำหนิบริเวณกระเป๋า/)).toBeInTheDocument();
  expect(container.querySelector("video")).toHaveAttribute("controls");
  expect(screen.getByRole("link", { name: /View Product/ })).toHaveAttribute(
    "href",
    "/products/p-1",
  );
  fireEvent.click(screen.getByRole("button", { name: "ขยายรูปสินค้า 1" }));
  expect(
    await screen.findByRole("dialog", { name: "รูปสินค้า" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "กางเกงยีนส์ทรงตรง" }),
  ).toHaveAttribute("src", "/uploads/jeans.jpg");
});
