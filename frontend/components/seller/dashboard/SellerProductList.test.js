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

test.each([["sold", null], ["hidden", "sold"]])(
  "seller panel hides edit and delete for %s sold products",
  (status, preRemovalStatus) => {
    render(<SellerProductList products={[{ ...removedProduct, status, preRemovalStatus }]} />);
    expect(screen.queryByRole("link", { name: "แก้ไข" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ลบ" })).not.toBeInTheDocument();
  },
);

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

test("shows the real leading bid instead of the auction starting price", () => {
  render(<SellerProductList products={[{
    id: "auction-open", title: "สินค้าประมูล", price: 69,
    status: "auction", auctionStatus: "open",
    auctionStartingPrice: 69, auctionCurrentBid: 275,
  }]} />);
  expect(screen.getByText("฿275")).toBeInTheDocument();
  expect(screen.getByText("ราคาบิดสูงสุด")).toBeInTheDocument();
  expect(screen.queryByText("฿69")).toBeNull();
});

test("shows a clear Thai status and filter for an auction item awaiting a new sale choice", () => {
  render(<SellerProductList products={[
    { id: "auction-relist", title: "สินค้าที่ยกเลิกประมูล", price: 125, status: "auction_action_required" },
  ]} />);

  expect(screen.getByText("รอเลือกขายปกติหรือประมูลใหม่")).toBeInTheDocument();
  expect(screen.queryByText("auction_action_required")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "รอเลือกวิธีขายใหม่" }));
  expect(screen.getByText("รอเลือกขายปกติหรือประมูลใหม่")).toBeInTheDocument();
});

test("uses the assigned winning bid after the auction closes, even if an older bid was higher", () => {
  render(<SellerProductList products={[{
    id: "auction-closed", title: "สินค้าขายประมูล", price: 69,
    status: "sold", auctionStatus: "closed", auctionCurrentBid: 500,
    auctionWinningPrice: 400,
  }]} />);
  expect(screen.getByText("฿400")).toBeInTheDocument();
  expect(screen.getByText("ราคาที่ชนะประมูล")).toBeInTheDocument();
  expect(screen.queryByText("฿500")).toBeNull();
});

test("labels the starting price when no bids have been placed", () => {
  render(<SellerProductList products={[{
    id: "auction-empty", title: "ยังไม่มีบิด", price: 69,
    status: "auction", auctionStatus: "open", auctionCurrentBid: null,
    auctionStartingPrice: 69,
  }]} />);
  expect(screen.getByText("฿69")).toBeInTheDocument();
  expect(screen.getByText("ราคาเริ่มต้น")).toBeInTheDocument();
});

test("displays 'ขายแล้ว' and 'หมด' for a sold product", () => {
  render(
    <SellerProductList
      products={[{
        id: "prod-sold",
        title: "สินค้าที่ขายแล้ว",
        price: 150,
        status: "sold",
      }]}
    />,
  );
  expect(screen.getAllByText("ขายแล้ว").length).toBeGreaterThan(0);
  expect(screen.getByText("หมด")).toBeInTheDocument();
});

test("displays 'หมด' for a product handed to the carrier", () => {
  render(
    <SellerProductList
      products={[{
        id: "prod-shipped",
        title: "สินค้าที่จัดส่งเสร็จเรียบร้อย",
        price: 200,
        status: "available",
      }]}
      orders={[{
        id: "order-1",
        productId: "prod-shipped",
        status: "in_transit",
      }]}
    />,
  );
  expect(screen.getAllByText("ขายแล้ว").length).toBeGreaterThan(0);
  expect(screen.getByText("หมด")).toBeInTheDocument();
});

test.each([
  ["ready_to_ship", "เรียกขนส่ง"],
  ["pickup_in_progress", "ส่งมอบให้ขนส่งแล้ว"],
])("reserved listing offers the %s shipping step", (status, label) => {
  render(<SellerProductList
    products={[{ ...removedProduct, id: "p1", status: "reserved", moderationReason: null }]}
    orders={[{ id: "o1", productId: "p1", status }]}
  />);
  expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ลบ" })).toBeDisabled();
});
