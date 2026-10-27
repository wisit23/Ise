import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

it("refreshes an open returned dispute when CS sends it back, without reopening", async () => {
  let latest = { ...dispute, version: 2, status: "NEEDS_INFO", assignedRole: "CUSTOMER_SERVICE", assignedTo: "cs", returnedAt: "2026-10-27T00:00:00Z" };
  apiFetch.mockImplementation(() => Promise.resolve(latest));
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" currentUserId="ts" />);
  expect(await screen.findByText(/ส่งกลับให้ CS แล้ว/)).toBeInTheDocument();
  latest = { ...dispute, version: 3, status: "NEEDS_INFO", assignedRole: "TRUST_AND_SAFETY", assignedTo: null, returnedAt: null, capabilities: { canClaim: true } };
  fireEvent(window, new Event("focus"));
  expect(await screen.findByRole("button", { name: "รับเคสเพื่อพิจารณา" })).toBeEnabled();
  expect(screen.queryByText(/ส่งกลับให้ CS แล้ว/)).not.toBeInTheDocument();
});

it("preserves the reason draft but cancels confirmation when a newer version arrives", async () => {
  let latest = { ...dispute, version: 4, status: "OPEN", assignedRole: "TRUST_AND_SAFETY", assignedTo: "ts", capabilities: { canDecide: true } };
  apiFetch.mockImplementation(() => Promise.resolve(latest));
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" currentUserId="ts" />);
  fireEvent.change(await screen.findByRole("textbox", { name: "เหตุผลการตัดสิน" }), { target: { value: "draft reason" } });
  fireEvent.click(screen.getByRole("button", { name: "คืนเงินผู้ซื้อ" }));
  expect(await screen.findByRole("dialog", { name: "ยืนยันคืนเงินผู้ซื้อ" })).toBeInTheDocument();
  latest = { ...latest, version: 5 };
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "ยืนยันคืนเงินผู้ซื้อ" })).not.toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "เหตุผลการตัดสิน" })).toHaveValue("draft reason");
  expect(screen.getByText("เคสมีข้อมูลใหม่ กรุณาตรวจสอบก่อนยืนยันอีกครั้ง")).toBeInTheDocument();
});

it("a background response from before claim cannot restore an unassigned case", async () => {
  const initial = { ...dispute, version: 3, status: "OPEN", assignedRole: "TRUST_AND_SAFETY", assignedTo: null, capabilities: { canClaim: true } };
  let reads = 0, finishOld;
  apiFetch.mockImplementation((_url, options) => {
    if (options?.method === "POST") return Promise.resolve({ ...initial, version: 4, assignedTo: "ts", capabilities: { canDecide: true } });
    if (++reads === 1) return Promise.resolve(initial);
    return new Promise((resolve) => { finishOld = resolve; });
  });
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" currentUserId="ts" />);
  const claim = await screen.findByRole("button", { name: "รับเคสเพื่อพิจารณา" });
  fireEvent(window, new Event("focus"));
  fireEvent.click(claim);
  expect(await screen.findByRole("textbox", { name: "เหตุผลการตัดสิน" })).toBeInTheDocument();
  await act(async () => finishOld(initial));
  expect(screen.queryByRole("button", { name: "รับเคสเพื่อพิจารณา" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "เหตุผลการตัดสิน" })).toBeInTheDocument();
});

it("opens evidence immediately in the page even when new browser windows are blocked", async () => {
  let finishDownload;
  fetchAuthedBlobUrl.mockReturnValue(
    new Promise((resolve) => {
      finishDownload = resolve;
    }),
  );
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" />);
  fireEvent.click(await screen.findByRole("button", { name: /รูปภาพ/ }));
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
  fireEvent.click(await screen.findByRole("button", { name: /รูปภาพ/ }));
  expect(
    await screen.findByText("evidence file is missing"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  expect(
    await screen.findByRole("img", { name: "หลักฐานที่ผู้ใช้แนบในเคส" }),
  ).toHaveAttribute("src", "blob:retry");
});

it("retries a committed verdict with the original version, reason and idempotency key", async () => {
  const detail = { ...dispute, status: "OPEN", version: 4, assignedRole: "TRUST_AND_SAFETY", assignedTo: "staff", capabilities: { canDecide: true } };
  const decided = { ...detail, version: 5, status: "DECIDED", decision: "APPROVE_REFUND", decisionReason: "verified" };
  let attempts = 0;
  apiFetch.mockImplementation((url, options) => {
    if (options?.method === "POST") return Promise.resolve(++attempts === 1 ? { ...decided, chatLockError: "chat unavailable" } : decided);
    return Promise.resolve(attempts ? decided : detail);
  });
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" currentUserId="staff" />);
  fireEvent.change(await screen.findByRole("textbox", { name: "เหตุผลการตัดสิน" }), { target: { value: "verified" } });
  fireEvent.click(screen.getByRole("button", { name: "คืนเงินผู้ซื้อ" }));
  fireEvent.click(await screen.findByRole("button", { name: "ยืนยันคำสั่ง" }));
  fireEvent.click(await screen.findByRole("button", { name: "ลองส่งผลการตัดสินอีกครั้ง" }));
  await waitFor(() => expect(attempts).toBe(2));
  const calls = apiFetch.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(calls[0][1].body).toEqual({ version: 4, reason: "verified", decision: "APPROVE_REFUND", idempotencyKey: "case-1:4:APPROVE_REFUND" });
  expect(calls[1][1].body).toEqual(calls[0][1].body);
  await waitFor(() => expect(screen.queryByRole("button", { name: "ลองส่งผลการตัดสินอีกครั้ง" })).not.toBeInTheDocument());
});

it("does not append an old buyer transcript page after switching to the seller", async () => {
  let finishOlder;
  const message = (id, body) => ({ id, body, senderRole: "BUYER", senderId: "buyer", createdAt: "2026-10-14T00:00:00Z" });
  apiFetch.mockImplementation((url) => {
    if (url.includes("before=")) return new Promise((resolve) => { finishOlder = resolve; });
    if (url.includes("side=buyer")) return Promise.resolve({ messages: [message("b1", "Buyer current")], nextCursor: "older" });
    if (url.includes("side=seller")) return Promise.resolve({ messages: [message("s1", "Seller current")] });
    return Promise.resolve({ ...dispute });
  });
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" />);
  fireEvent.click(screen.getByRole("button", { name: /คลี่ดู.*Log/ }));
  expect(await screen.findByText("Buyer current")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "โหลดข้อความเก่ากว่า" }));
  fireEvent.click(screen.getByRole("tab", { name: "ผู้ขาย" }));
  expect(await screen.findByText("Seller current")).toBeInTheDocument();
  await act(async () => finishOlder({ messages: [message("b0", "Buyer old")] }));
  expect(screen.queryByText("Buyer old")).not.toBeInTheDocument();
  expect(screen.getByText("Seller current")).toBeInTheDocument();
});

it("keeps every verdict action in the console, gated by ownership and a written reason", async () => {
  const owned = { ...dispute, version: 4, status: "OPEN", assignedRole: "TRUST_AND_SAFETY", assignedTo: "ts", capabilities: { canDecide: true, canRequestEvidence: true } };
  apiFetch.mockImplementation(() => Promise.resolve(owned));
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" currentUserId="ts" />);
  const refund = await screen.findByRole("button", { name: "คืนเงินผู้ซื้อ" });
  const release = screen.getByRole("button", { name: "ปล่อยเงินให้ผู้ขาย" });
  expect(refund).toBeDisabled();
  expect(release).toBeDisabled();
  expect(screen.getByRole("button", { name: "ตีกลับให้ CS" })).toBeEnabled();
  fireEvent.change(screen.getByRole("textbox", { name: "เหตุผลการตัดสิน" }), { target: { value: "หลักฐานชัดเจน" } });
  expect(refund).toBeEnabled();
  expect(release).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "ตีกลับให้ CS" }));
  expect(await screen.findByRole("dialog", { name: "ส่งกลับให้ CS ดำเนินการเพิ่ม" })).toBeInTheDocument();
});

it("shows the claim button to an unassigned case and nobody else's verdict controls", async () => {
  apiFetch.mockImplementation(() => Promise.resolve({ ...dispute, version: 2, status: "OPEN", assignedRole: "TRUST_AND_SAFETY", assignedTo: "other-ts", assigneeName: "T&S อีกคน", capabilities: {} }));
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" currentUserId="ts" />);
  expect(await screen.findByText(/T&S อีกคน/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "คืนเงินผู้ซื้อ" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ตีกลับให้ CS" })).not.toBeInTheDocument();
});

it("shows the recorded verdict instead of controls once decided", async () => {
  apiFetch.mockImplementation(() => Promise.resolve({ ...dispute, version: 6, status: "DECIDED", decision: "APPROVE_REFUND", decisionReason: "ผู้ซื้อมีหลักฐาน", assignedRole: "TRUST_AND_SAFETY", assignedTo: "ts", capabilities: {} }));
  render(<AdminDisputeAuditPanel dispute={dispute} token="token" currentUserId="ts" />);
  expect(await screen.findByText("ผู้ซื้อมีหลักฐาน")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ตีกลับให้ CS" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "เหตุผลการตัดสิน" })).not.toBeInTheDocument();
});
