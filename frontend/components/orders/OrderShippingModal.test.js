import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {apiFetch} from "../../lib/api";import {getStoredUser} from "../../lib/auth";import OrderShippingModal from "./OrderShippingModal";
jest.mock("../../lib/api",()=>({apiFetch:jest.fn()}));jest.mock("../../lib/auth",()=>({getAccessToken:()=>"token",getStoredUser:jest.fn()}));
const order={id:"o1",sellerId:"seller",status:"confirmed",version:7,price:100,shipping:{addressSnapshot:{recipientName:"Buyer",phone:"0812345678",addressLine:"Test Road",postalCode:"10110"}}};
beforeEach(()=>{jest.clearAllMocks();apiFetch.mockImplementation((url,options)=>Promise.resolve(options?.method?{...order,status:"shipped"}:order));});
it("seller must enter carrier and tracking before confirming shipment",async()=>{
 getStoredUser.mockReturnValue({id:"seller",role:"SELLER"});const onShipped=jest.fn();render(<OrderShippingModal orderId="o1" initialOrder={order} isOpen onClose={()=>{}} onShipped={onShipped}/>);
 const submit=await screen.findByRole("button",{name:"ยืนยันการจัดส่งสินค้า"});expect(submit).toBeDisabled();
 fireEvent.change(screen.getByLabelText("บริษัทขนส่ง"),{target:{value:"Kerry Express"}});fireEvent.change(screen.getByLabelText("เลขติดตามพัสดุ"),{target:{value:"TRACK123"}});fireEvent.click(submit);
 await waitFor(()=>expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/status",expect.objectContaining({method:"PATCH",body:{status:"shipped",company:"Kerry Express",trackingNumber:"TRACK123",version:7}})));
});
it("provides dropdown with required shipping company options", async () => {
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  render(
    <OrderShippingModal
      orderId="o1"
      initialOrder={order}
      isOpen
      onClose={() => {}}
    />
  );
  const select = await screen.findByLabelText("บริษัทขนส่ง");
  expect(select.tagName).toBe("SELECT");
  const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
  expect(options).toEqual([
    "",
    "Thailand Post",
    "Kerry Express",
    "J&T Express",
    "Flash Express",
    "SPX Express",
    "Best Express",
  ]);
});
it("allows selecting carrier from scrollable custom dropdown menu", async () => {
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  render(
    <OrderShippingModal
      orderId="o1"
      initialOrder={order}
      isOpen
      onClose={() => {}}
    />
  );
  const trigger = await screen.findByTestId("shipping-company-trigger");
  expect(trigger).toHaveTextContent("-- เลือกบริษัทขนส่ง --");
  
  fireEvent.click(trigger);
  const menu = screen.getByTestId("shipping-company-menu");
  expect(menu).toHaveClass("overflow-y-auto");
  expect(menu).toHaveClass("max-h-40");
  expect(menu).toHaveClass("top-full");

  const flashOption = within(menu).getByText("Flash Express");
  fireEvent.click(flashOption);

  expect(trigger).toHaveTextContent("Flash Express");
  expect(screen.queryByTestId("shipping-company-menu")).not.toBeInTheDocument();
  expect(screen.getByLabelText("บริษัทขนส่ง")).toHaveValue("Flash Express");
});
it("buyer sees delivery address without seller shipment controls",async()=>{getStoredUser.mockReturnValue({id:"buyer",role:"BUYER"});render(<OrderShippingModal orderId="o1" initialOrder={order} isOpen onClose={()=>{}}/>);expect(await screen.findByText(/Test Road/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"ยืนยันการจัดส่งสินค้า"})).not.toBeInTheDocument();});
it("seller must confirm paid order before shipping controls appear", async () => {
  const paidOrder = { ...order, status: "paid" };
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  apiFetch.mockImplementation((url, options) => {
    if (url === "/api/orders/o1/confirm" && options?.method === "POST") {
      return Promise.resolve({ ...paidOrder, status: "confirmed" });
    }
    return Promise.resolve(paidOrder);
  });
  const onOrderUpdated = jest.fn();
  render(
    <OrderShippingModal
      orderId="o1"
      initialOrder={paidOrder}
      isOpen
      onClose={() => {}}
      onOrderUpdated={onOrderUpdated}
    />
  );
  expect(
    await screen.findByText("ก่อนผู้ขายจะกดจัดส่งสินค้าได้ ต้องทำการยืนยันรับออเดอร์ก่อน")
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "ยืนยันการจัดส่งสินค้า" })
  ).not.toBeInTheDocument();

  const confirmBtn = screen.getByRole("button", { name: "ยืนยันรับออเดอร์" });
  fireEvent.click(confirmBtn);

  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/o1/confirm",
      expect.objectContaining({ method: "POST" })
    )
  );
  expect(
    await screen.findByRole("button", { name: "ยืนยันการจัดส่งสินค้า" })
  ).toBeInTheDocument();
  expect(onOrderUpdated).toHaveBeenCalledWith(
    expect.objectContaining({ status: "confirmed" })
  );
});

it("seller can reject confirmed order directly from shipping modal", async () => {
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  const cancelledOrder = { ...order, status: "cancelled" };
  apiFetch.mockImplementation((url, options) => {
    if (options?.method === "POST" && url === "/api/orders/o1/reject") {
      return Promise.resolve(cancelledOrder);
    }
    return Promise.resolve(order);
  });
  const onRejected = jest.fn();
  const onOrderUpdated = jest.fn();

  render(
    <OrderShippingModal
      orderId="o1"
      initialOrder={order}
      isOpen
      onClose={() => {}}
      onRejected={onRejected}
      onOrderUpdated={onOrderUpdated}
    />,
  );

  const rejectBtn = await screen.findByRole("button", { name: "ปฏิเสธ" });
  fireEvent.click(rejectBtn);

  expect(screen.getByText("คำเตือนเกี่ยวกับการปฏิเสธออเดอร์")).toBeInTheDocument();
  fireEvent.click(screen.getByText("สินค้าชำรุดก่อนจัดส่ง"));

  const confirmReject = screen.getByRole("button", { name: "ยืนยันการปฏิเสธออเดอร์" });
  fireEvent.click(confirmReject);

  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/o1/reject",
      expect.objectContaining({
        method: "POST",
        body: { reason: "สินค้าชำรุดก่อนจัดส่ง" },
      }),
    ),
  );

  expect(onRejected).toHaveBeenCalledWith(cancelledOrder);
  expect(onOrderUpdated).toHaveBeenCalledWith(cancelledOrder);
});


