import { render, screen } from "@testing-library/react";
import SellerProductList from "./SellerProductList";

const removedProduct = {
  id: "product-removed",
  title: "กระเป๋าที่ถูกระงับ",
  price: 1200,
  status: "removed",
  moderationReason: "ตรวจพบว่าสินค้าอาจไม่ตรงกับรายละเอียด",
  tags: [],
};

test("shows a moderated listing as read-only with its reason", () => {
  render(<SellerProductList products={[removedProduct]} />);

  expect(screen.getByText("ถูกระงับโดย Trust & Safety")).toBeInTheDocument();
  expect(
    screen.getByText("เหตุผล: ตรวจพบว่าสินค้าอาจไม่ตรงกับรายละเอียด"),
  ).toBeInTheDocument();
  expect(screen.getByText("ดูได้อย่างเดียว")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "แก้ไข" })).not.toBeInTheDocument();
});

test("keeps the edit action for a normal listing", () => {
  render(
    <SellerProductList
      products={[
        {
          ...removedProduct,
          id: "product-available",
          status: "available",
          moderationReason: null,
        },
      ]}
    />,
  );

  expect(screen.getByRole("link", { name: "แก้ไข" })).toHaveAttribute(
    "href",
    "/products/product-available/edit",
  );
});
