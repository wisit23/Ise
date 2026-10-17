import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { apiFetch, fetchAuthedBlobUrl } from "../../../../lib/api";
import AdminDisputeAuditPanel from "./AdminDisputeAuditPanel";

jest.mock("../../../../lib/api", () => ({
  apiFetch: jest.fn(),
  fetchAuthedBlobUrl: jest.fn(),
}));
const dispute = {
  id: "case-1",
  orderId: "order-1",
  order: { buyerId: "buyer", sellerId: "seller" },
};
const evidence = {
  id: "file-1",
  uploaderId: "buyer",
  fileType: "image/png",
  createdAt: "2026-10-14T13:09:36Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockResolvedValue({ ...dispute, evidence: [evidence] });
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(window, "open").mockReturnValue(null);
});
afterEach(() => jest.restoreAllMocks());

it("opens evidence immediately in the page even when new browser windows are blocked", async () => {
  let finishDownload;
  fetchAuthedBlobUrl.mockReturnValue(
    new Promise((resolve) => {
      finishDownload = resolve;
    }),
  );
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" />);
  fireEvent.click(await screen.findByRole("button", { name: /▣ รูปภาพ/ }));
  expect(
    screen.getByRole("dialog", { name: "หลักฐานประกอบข้อพิพาท" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("กำลังโหลดหลักฐาน");
  finishDownload("blob:uploaded-image");
  expect(
    await screen.findByRole("img", { name: "หลักฐานที่ผู้ใช้แนบในเคส" }),
  ).toHaveAttribute("src", "blob:uploaded-image");
  expect(fetchAuthedBlobUrl).toHaveBeenCalledWith(
    "/api/orders/disputes/case-1/evidence/file-1",
  );
  expect(window.open).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog", { name: "หลักฐานประกอบข้อพิพาท" })).getByRole("button", { name: "ปิดหน้าต่าง" }));
  await waitFor(() =>
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:uploaded-image"),
  );
});

it("shows a missing-file failure inside the evidence viewer and allows retry", async () => {
  fetchAuthedBlobUrl
    .mockRejectedValueOnce(new Error("evidence file is missing"))
    .mockResolvedValueOnce("blob:retry");
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" />);
  fireEvent.click(await screen.findByRole("button", { name: /▣ รูปภาพ/ }));
  expect(
    await screen.findByText("evidence file is missing"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  expect(
    await screen.findByRole("img", { name: "หลักฐานที่ผู้ใช้แนบในเคส" }),
  ).toHaveAttribute("src", "blob:retry");
});
