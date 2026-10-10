import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EvidenceInspector from "./EvidenceInspector";
import { fetchAuthedBlobUrl } from "../../../lib/api";
jest.mock("../../../lib/api", () => ({ fetchAuthedBlobUrl: jest.fn() }));
beforeEach(() => {
  fetchAuthedBlobUrl
    .mockReset()
    .mockImplementation((path) => Promise.resolve("blob:" + path));
  URL.revokeObjectURL = jest.fn();
});
const dispute = {
  id: "d",
  order: { buyerId: "buyer", sellerId: "seller" },
  evidence: [
    {
      id: "buyer-file",
      uploaderId: "buyer",
      fileType: "image/png",
      fileName: "buyer.png",
    },
    {
      id: "seller-file",
      uploaderId: "seller",
      fileType: "video/mp4",
      fileName: "seller.mp4",
    },
    { id: "unknown", uploaderId: "other", fileType: null },
  ],
};
test("authenticated evidence comparison shows both parties and cleans private URLs on close", async () => {
  const { container } = render(<EvidenceInspector dispute={dispute} />);
  expect(
    screen.getByRole("heading", { name: "หลักฐานอื่น" }),
  ).toBeInTheDocument();
  expect(fetchAuthedBlobUrl).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "เปรียบเทียบสองฝ่าย" }));
  await screen.findByRole("img", { name: "หลักฐานที่ผู้ใช้แนบในเคส" });
  expect(container.querySelector("video")).toHaveAttribute("controls");
  expect(fetchAuthedBlobUrl).toHaveBeenCalledWith(
    "/api/orders/disputes/d/evidence/buyer-file",
  );
  expect(fetchAuthedBlobUrl).toHaveBeenCalledWith(
    "/api/orders/disputes/d/evidence/seller-file",
  );
  fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าต่าง" }));
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2));
});
test("permission denied is a retryable file error rather than empty evidence", async () => {
  fetchAuthedBlobUrl.mockRejectedValue(new Error("ไม่มีสิทธิ์เปิดหลักฐาน"));
  render(<EvidenceInspector dispute={dispute} />);
  fireEvent.click(screen.getByRole("button", { name: /buyer.png/ }));
  await screen.findByText("ไม่มีสิทธิ์เปิดหลักฐาน");
  expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeInTheDocument();
});
