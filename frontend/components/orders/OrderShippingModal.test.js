import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {apiFetch} from "../../lib/api";import {getStoredUser} from "../../lib/auth";import OrderShippingModal from "./OrderShippingModal";
jest.mock("../../lib/api",()=>({apiFetch:jest.fn()}));jest.mock("../../lib/auth",()=>({getAccessToken:()=>"token",getStoredUser:jest.fn()}));
const order={id:"o1",sellerId:"seller",status:"ready_to_ship",version:7,price:100,shipping:{addressSnapshot:{recipientName:"Buyer",phone:"0812345678",addressLine:"Test Road",postalCode:"10110"}}};
beforeEach(()=>{jest.clearAllMocks();apiFetch.mockImplementation((url,options)=>Promise.resolve(options?.method?{...order,status:"shipped"}:order));});
it("seller must enter carrier and tracking before confirming shipment",async()=>{
 getStoredUser.mockReturnValue({id:"seller",role:"SELLER"});const onShipped=jest.fn();render(<OrderShippingModal orderId="o1" initialOrder={order} isOpen onClose={()=>{}} onShipped={onShipped}/>);
 const submit=await screen.findByRole("button",{name:"ยืนยันการจัดส่งสินค้า"});expect(submit).toBeDisabled();
 fireEvent.change(screen.getByLabelText("บริษัทขนส่ง"),{target:{value:"Kerry"}});fireEvent.change(screen.getByLabelText("เลขติดตามพัสดุ"),{target:{value:"TRACK123"}});fireEvent.click(submit);
 await waitFor(()=>expect(apiFetch).toHaveBeenCalledWith("/api/orders/o1/status",expect.objectContaining({method:"PATCH",body:{status:"shipped",company:"Kerry",trackingNumber:"TRACK123",version:7}})));
});
it("buyer sees delivery address without seller shipment controls",async()=>{getStoredUser.mockReturnValue({id:"buyer",role:"BUYER"});render(<OrderShippingModal orderId="o1" initialOrder={order} isOpen onClose={()=>{}}/>);expect(await screen.findByText(/Test Road/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"ยืนยันการจัดส่งสินค้า"})).not.toBeInTheDocument();});
