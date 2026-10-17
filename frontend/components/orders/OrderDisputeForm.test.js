import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrderDisputeForm from "./OrderDisputeForm";
import { apiFetch, uploadDisputeEvidence } from "../../lib/api";
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
  uploadDisputeEvidence: jest.fn(),
}));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));
beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockResolvedValue({ id: "case-1" });
  uploadDisputeEvidence.mockResolvedValue({ id: "evidence" });
});
function complete() {
  fireEvent.click(screen.getByRole("button", { name: "เลือกประเภทปัญหา" }));
  fireEvent.click(
    screen.getByRole("radio", { name: "สินค้าชำรุดหรือเสียหาย" }),
  );
  fireEvent.change(screen.getByLabelText("รายละเอียดปัญหา"), {
    target: { value: "ตะเข็บฉีกขาดหลังรับสินค้า" },
  });
}
test("a partial upload retries only failed files and never opens the case twice", async () => {
  const submitted = jest.fn();
  const first = new File(["photo"], "first.png", { type: "image/png" });
  const second = new File(["photo"], "second.png", { type: "image/png" });
  uploadDisputeEvidence
    .mockResolvedValueOnce({ id: "one" })
    .mockRejectedValueOnce(new Error("network unavailable"))
    .mockResolvedValueOnce({ id: "two" });
  render(
    <OrderDisputeForm order={{ id: "order-1" }} onSubmitted={submitted} />,
  );
  complete();
  fireEvent.change(screen.getByLabelText("แนบหลักฐานคำร้อง"), {
    target: { files: [first, second] },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "เปิดคำร้องและส่งข้อมูล" }),
  );
  expect(
    await screen.findByText(/เปิดคำร้องแล้ว แต่บางไฟล์/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ส่งหลักฐานที่เหลือ" }));
  await waitFor(() => expect(submitted).toHaveBeenCalledWith({ id: "case-1" }));
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(apiFetch).toHaveBeenCalledWith("/api/orders/order-1/disputes", {
    method: "POST",
    token: "token",
    body: { reason: "ตะเข็บฉีกขาดหลังรับสินค้า", disputeType: "DAMAGED_ITEM" },
  });
  expect(uploadDisputeEvidence).toHaveBeenCalledTimes(3);
  expect(uploadDisputeEvidence.mock.calls[2][1]).toBe(second);
  expect(mockPush).toHaveBeenCalledWith("/support/cases/order-1");
});
test("unsupported evidence is rejected before creating a case", async () => {
  render(<OrderDisputeForm order={{ id: "order-1" }} />);
  complete();
  fireEvent.change(screen.getByLabelText("แนบหลักฐานคำร้อง"), {
    target: {
      files: [new File(["pdf"], "receipt.pdf", { type: "application/pdf" })],
    },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "เปิดคำร้องและส่งข้อมูล" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("รองรับรูป");
  expect(apiFetch).not.toHaveBeenCalled();
});

test("selected evidence can be removed before submission", async () => {
  render(<OrderDisputeForm order={{ id: "order-1" }} />);
  complete();
  const keep = new File(["image"], "keep.png", { type: "image/png" });
  const remove = new File(["image"], "remove.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("แนบหลักฐานคำร้อง"), {
    target: { files: [keep, remove] },
  });
  fireEvent.click(screen.getByRole("button", { name: "ลบไฟล์ remove.png" }));
  expect(screen.queryByText("remove.png")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "เปิดคำร้องและส่งข้อมูล" }),
  );
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  expect(uploadDisputeEvidence).toHaveBeenCalledTimes(1);
  expect(uploadDisputeEvidence).toHaveBeenCalledWith("case-1", keep, "token");
});
