import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReportModal from "./ReportModal";
import { createReportWithEvidence } from "../lib/api";

jest.mock("../lib/api", () => ({ createReportWithEvidence: jest.fn() }));
jest.mock("../lib/auth", () => ({ getAccessToken: () => "buyer-token" }));

test("sends the selected image together with the report", async () => {
  createReportWithEvidence.mockResolvedValue({ id: "report-1" });
  const { container } = render(<ReportModal open onClose={() => {}} targetId="seller-1" productId="product-1" />);
  const file = new File(["image bytes"], "proof.png", { type: "image/png" });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  fireEvent.change(screen.getByPlaceholderText("อธิบายปัญหาที่พบ..."), { target: { value: "สินค้าผิดรายละเอียด" } });
  fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));
  await waitFor(() => expect(createReportWithEvidence).toHaveBeenCalledWith({
    targetId: "seller-1", productId: "product-1", reason: "สินค้าผิดรายละเอียด", file,
  }, "buyer-token"));
  expect(await screen.findByText("ส่งรายงานเรียบร้อยแล้ว")).toBeInTheDocument();
});
