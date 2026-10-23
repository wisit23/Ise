import { render, screen, waitFor } from "@testing-library/react";
import CustomerDisputeCase from "./CustomerDisputeCase";
import { apiFetch } from "../../lib/api";
import { getStoredUser, getAccessToken } from "../../lib/auth";
const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../support/hooks/useCustomerServiceConfig", () => () =>
  require("../../../backend/shared/config/customer-service-client.json"),
);
jest.mock("../../lib/auth", () => ({
  getStoredUser: jest.fn(),
  getAccessToken: jest.fn(),
}));
jest.mock(
  "../NavBar",
  () =>
    function MockNavBar() {
      return <nav>Navigation</nav>;
    },
);
jest.mock(
  "../Footer",
  () =>
    function MockFooter() {
      return <footer>Footer</footer>;
    },
);
jest.mock(
  "../support/EmbeddedChat",
  () =>
    function Chat(props) {
      return (
        <div
          data-testid="chat"
          data-room={props.conversationId}
          data-readonly={String(props.readOnly)}
          data-private={String(props.hideInternal)}
        />
      );
    },
);
jest.mock(
  "./DisputeEvidence",
  () =>
    function Evidence({ dispute }) {
      return (
        <div>
          {dispute.status !== "DECIDED"
            ? "เพิ่มหลักฐานได้"
            : "หลักฐานอ่านอย่างเดียว"}
        </div>
      );
    },
);
const fixture = {
  id: "case-1",
  orderId: "order-1",
  reason: "มีรอยขาดที่ตะเข็บ",
  disputeType: "DAMAGED_ITEM",
  status: "OPEN",
  assignedTo: "cs",
  createdAt: "2026-10-11T04:00:00Z",
  order: {
    buyerId: "buyer",
    sellerId: "seller",
    productId: "product",
    productTitle: "แจ็กเก็ต",
    finalPrice: 800,
  },
  evidence: [],
};
beforeEach(() => {
  jest.clearAllMocks();
  getStoredUser.mockReturnValue({ id: "buyer", role: "BUYER" });
  getAccessToken.mockReturnValue("token");
  apiFetch.mockImplementation((url, options) =>
    Promise.resolve(
      options?.method ? { conversationId: "room", readOnly: false } : fixture,
    ),
  );
});
test("a Seller account buying this order joins the buyer side, with a private CS chat", async () => {
  getStoredUser.mockReturnValue({ id: "buyer", role: "SELLER" });
  render(<CustomerDisputeCase orderId="order-1" />);
  expect(
    await screen.findByText("ศูนย์ช่วยเหลือ · สำหรับผู้ซื้อ"),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/disputes/case-1/conversation",
      expect.objectContaining({ body: { side: "buyer" } }),
    ),
  );
  expect(await screen.findByTestId("chat")).toHaveAttribute(
    "data-private",
    "true",
  );
  expect(
    screen.queryByRole("button", { name: "อนุมัติคืนเงิน" }),
  ).not.toBeInTheDocument();
});
test("the selling owner gets the seller room and seller guidance", async () => {
  getStoredUser.mockReturnValue({ id: "seller", role: "SELLER" });
  render(<CustomerDisputeCase orderId="order-1" />);
  expect(
    await screen.findByText("ศูนย์ช่วยเหลือ · สำหรับผู้ขาย"),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/orders/disputes/case-1/conversation",
      expect.objectContaining({ body: { side: "seller" } }),
    ),
  );
  expect(screen.getByText("ส่งคำชี้แจงของร้านค้า")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "← กลับไปยังคำสั่งซื้อร้านค้า" }),
  ).toHaveAttribute("href", "/seller/dashboard");
});
test("decided cases translate the verdict and make chat and evidence read-only", async () => {
  apiFetch.mockImplementation((url, options) =>
    Promise.resolve(
      options?.method
        ? { conversationId: "room", readOnly: false }
        : {
            ...fixture,
            status: "DECIDED",
            decision: "RELEASE_ESCROW",
            decisionReason: "สภาพตรงตามประกาศ",
          },
    ),
  );
  render(<CustomerDisputeCase orderId="order-1" />);
  expect(
    await screen.findByRole("heading", { name: "ปล่อยเงินให้ผู้ขาย" }),
  ).toBeInTheDocument();
  expect(await screen.findByTestId("chat")).toHaveAttribute(
    "data-readonly",
    "true",
  );
  expect(screen.getByText("หลักฐานอ่านอย่างเดียว")).toBeInTheDocument();
});
test("access denial shows recovery without joining any conversation", async () => {
  apiFetch.mockRejectedValue(
    Object.assign(new Error("forbidden"), { status: 403 }),
  );
  render(<CustomerDisputeCase orderId="private" />);
  expect(
    await screen.findByRole("heading", { name: "ไม่สามารถเข้าถึงคำร้องนี้" }),
  ).toBeInTheDocument();
  expect(
    apiFetch.mock.calls.every(([, options]) => options.method !== "POST"),
  ).toBe(true);
});
test("signed-out visitor is directed to login without making an API request", async () => {
  getAccessToken.mockReturnValue(null);
  render(<CustomerDisputeCase orderId="order-1" />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(apiFetch).not.toHaveBeenCalled();
});
