import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";
import KycSection from "./KycSection";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  fetchAuthedBlobUrl: jest.fn(),
}));
jest.mock("../../ui/ToastProvider", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock("../../panel/ui/DropdownFilter", () => ({
  __esModule: true,
  default: ({ value, onChange, options }) => (
    <select
      aria-label="สถานะ KYC"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
jest.mock("../../ui/ConfirmDialog", () => ({
  __esModule: true,
  default: () => null,
}));

const application = {
  id: "kyc-1",
  userId: "seller-1",
  storageKey: "missing.png",
  fileType: "image/png",
  status: "REJECTED",
  reason: "image is unreadable",
  submittedAt: "2026-10-08T00:00:00.000Z",
  decidedAt: "2026-10-08T01:00:00.000Z",
  profileSnapshotAvailable: false,
  user: {
    firstName: "Test",
    lastName: "Seller",
    email: "seller@example.test",
    sellerProfile: {
      shopName: "Current shop name",
      idCardNumber: "1234567890123",
      address: "Bangkok",
      bankAccount: "123-456",
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

it("sends the explicit ALL status contract", async () => {
  apiFetch.mockResolvedValue({ items: [], total: 0, totalPages: 1 });
  render(<KycSection token="token" />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());

  fireEvent.change(screen.getByRole("combobox", { name: "สถานะ KYC" }), {
    target: { value: "ALL" },
  });

  await waitFor(() =>
    expect(
      apiFetch.mock.calls.some(([url]) => url.includes("status=ALL")),
    ).toBe(true),
  );
});

it("shows missing evidence as unavailable with resubmission guidance", async () => {
  apiFetch.mockResolvedValue({
    items: [application],
    total: 1,
    totalPages: 1,
  });
  fetchAuthedBlobUrl.mockRejectedValue(
    new Error("KYC document file is unavailable; ask the seller to resubmit"),
  );
  render(<KycSection token="token" />);

  fireEvent.click(
    (await screen.findByText("แสดงรูปถ่ายบัตรประชาชน")).closest("button"),
  );

  expect(
    await screen.findByText("ไฟล์เอกสารไม่พร้อมใช้งาน"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("กรุณาให้ผู้ขายส่งคำขอและไฟล์ใหม่อีกครั้ง"),
  ).toBeInTheDocument();
  expect(screen.getByText("เหตุผลที่ปฏิเสธ:")).toBeInTheDocument();
  expect(screen.getByText(/ตรวจแล้วเมื่อ:/)).toBeInTheDocument();
  expect(
    screen.getByText(/ข้อมูลด้านล่างเป็นโปรไฟล์ร้านค้าปัจจุบัน/),
  ).toBeInTheDocument();
});
