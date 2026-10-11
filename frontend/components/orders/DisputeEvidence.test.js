import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DisputeEvidence, { EvidenceUpload } from "./DisputeEvidence";
import { fetchAuthedBlobUrl, uploadDisputeEvidence } from "../../lib/api";
jest.mock("../../lib/api", () => ({
  fetchAuthedBlobUrl: jest.fn(),
  uploadDisputeEvidence: jest.fn(),
}));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));
beforeEach(() => {
  jest.clearAllMocks();
  fetchAuthedBlobUrl.mockResolvedValue("blob:private");
  URL.revokeObjectURL = jest.fn();
});
test("Thai file button opens a hidden input without displaying the native English control", () => {
  render(<EvidenceUpload disputeId="case-1" onUploaded={() => {}} />);
  const input = screen.getByLabelText("เลือกหลักฐานเพิ่มเติม");
  expect(input).toHaveAttribute("hidden");
  const click = jest.spyOn(input, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "เลือกไฟล์จากอุปกรณ์" }));
  expect(click).toHaveBeenCalledTimes(1);
});
test("partial evidence failure preserves pending files and refreshes successful evidence", async () => {
  const refresh = jest.fn().mockResolvedValue();
  uploadDisputeEvidence
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error("temporary outage"))
    .mockResolvedValueOnce({});
  const first = new File(["1"], "first.png", { type: "image/png" }),
    second = new File(["2"], "second.png", { type: "image/png" });
  render(<EvidenceUpload disputeId="case-1" onUploaded={refresh} />);
  fireEvent.change(screen.getByLabelText("เลือกหลักฐานเพิ่มเติม"), {
    target: { files: [first, second] },
  });
  fireEvent.click(screen.getByRole("button", { name: "ส่งหลักฐาน 2 ไฟล์" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "ส่งสำเร็จแล้ว 1 ไฟล์",
  );
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "ส่งหลักฐาน 1 ไฟล์" }));
  await waitFor(() => expect(uploadDisputeEvidence).toHaveBeenCalledTimes(3));
  expect(uploadDisputeEvidence.mock.calls[2][1]).toBe(second);
});
test("private evidence URLs are released and a decided case cannot upload more", async () => {
  const { unmount } = render(
    <DisputeEvidence
      dispute={{
        id: "case-1",
        status: "DECIDED",
        order: { buyerId: "buyer", sellerId: "seller" },
        evidence: [{ id: "e1", uploaderId: "seller", fileType: "image/png" }],
      }}
      userId="seller"
      onUploaded={() => {}}
    />,
  );
  expect(
    await screen.findByRole("img", { name: "หลักฐานผู้ขาย 1" }),
  ).toHaveAttribute("src", "blob:private");
  expect(
    screen.queryByLabelText("เลือกหลักฐานเพิ่มเติม"),
  ).not.toBeInTheDocument();
  expect(fetchAuthedBlobUrl).toHaveBeenCalledWith(
    "/api/orders/disputes/case-1/evidence/e1",
  );
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private");
});
