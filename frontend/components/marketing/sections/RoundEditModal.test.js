import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RoundEditModal from "./RoundEditModal";
import { apiFetch } from "../../../lib/api";
jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
const round = { id: "round-test", title: "รอบทดสอบ", updatedAt: "2030-01-01T00:00:00Z",
  submissionStartsAt: "2035-01-01T10:00:01Z", submissionEndsAt: "2035-01-01T11:00:00Z",
  auctionStartsAt: "2035-01-01T12:00:00Z", auctionEndsAt: "2035-01-01T13:00:00Z" };
beforeEach(() => { jest.clearAllMocks(); Object.defineProperty(window.crypto, "randomUUID", { configurable: true, value: () => "12345678-1234-1234-1234-123456789abc" }); });
test("saves through the round API and preserves unchanged timestamp seconds", async () => {
  apiFetch.mockResolvedValue({ warnings: [] });
  const close = jest.fn();
  const saved = jest.fn();
  render(<RoundEditModal round={round} token="test-token" onClose={close} onSaved={saved} />);
  fireEvent.click(screen.getByRole("button", { name: "บันทึกเวลา" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(saved).toHaveBeenCalled();
  expect(apiFetch).toHaveBeenCalledWith(`/api/products/auctions/rounds/${round.id}`, expect.objectContaining({
    method: "PATCH", body: expect.objectContaining({ expectedUpdatedAt: round.updatedAt,
      submissionStartsAt: "2035-01-01T10:00:01.000Z" }),
  }));
});
test("warning retry resends identical operation and freezes fields", async () => {
  apiFetch.mockResolvedValueOnce({ warnings: ["ส่งแจ้งเตือนไม่ครบ"] }).mockResolvedValueOnce({ warnings: [] });
  const close = jest.fn();
  render(<RoundEditModal round={round} onClose={close} onSaved={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "บันทึกเวลา" }));
  await screen.findByRole("status");
  expect(screen.getByLabelText(/ปิดประมูล/)).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ส่งคำขอเดิมซ้ำ" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(apiFetch.mock.calls[1][1].body).toEqual(apiFetch.mock.calls[0][1].body);
});
test("submits the edited time from the form rather than the original round", async () => {
  apiFetch.mockResolvedValue({ warnings: [] });
  render(<RoundEditModal round={round} onClose={() => {}} onSaved={() => {}} />);
  const value = "2035-01-01T15:00";
  fireEvent.change(screen.getByLabelText(/ปิดประมูล/), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกเวลา" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  expect(apiFetch.mock.calls[0][1].body.auctionEndsAt).toBe(new Date(value).toISOString());
});
test("started milestones are disabled and validation errors permit correction", async () => {
  apiFetch.mockRejectedValue(Object.assign(new Error("เวลาต้องอยู่ในอนาคต"), { status: 400 }));
  render(<RoundEditModal round={{ ...round, submissionStartsAt: "2020-01-01T00:00:00Z" }} onClose={() => {}} onSaved={() => {}} />);
  expect(screen.getByLabelText(/เริ่มรับสินค้า/)).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกเวลา" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText(/ปิดประมูล/)).toBeEnabled();
});
