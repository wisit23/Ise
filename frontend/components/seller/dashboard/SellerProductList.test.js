import { fireEvent, render, screen } from "@testing-library/react";
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

test("keeps the edit and delete actions for a normal listing", () => {
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
  expect(screen.getByRole("button", { name: "ลบ" })).not.toBeDisabled();
});

test("shows delete confirmation popup and allows canceling", () => {
  render(
    <SellerProductList
      products={[
        {
          ...removedProduct,
          id: "product-available",
          title: "เสื้อเชิ้ตลายสก็อต",
          status: "available",
          moderationReason: null,
        },
      ]}
    />,
  );

  const deleteBtn = screen.getByRole("button", { name: "ลบ" });
  fireEvent.click(deleteBtn);

  expect(screen.getByText("ยืนยันการลบสินค้า")).toBeInTheDocument();
  expect(
    screen.getByText(/คุณแน่ใจว่าต้องการลบสินค้า "เสื้อเชิ้ตลายสก็อต" ใช่หรือไม่\?/),
  ).toBeInTheDocument();

  // Cancel closes popup
  const cancelBtn = screen.getByRole("button", { name: "ยกเลิก" });
  fireEvent.click(cancelBtn);
  expect(screen.queryByText("ยืนยันการลบสินค้า")).not.toBeInTheDocument();
});

test("disables delete button when product is reserved in cart/order", () => {
  render(
    <SellerProductList
      products={[
        {
          ...removedProduct,
          id: "product-reserved",
          status: "reserved",
          moderationReason: null,
        },
      ]}
    />,
  );

  expect(screen.getByRole("button", { name: "ลบ" })).toBeDisabled();
});
