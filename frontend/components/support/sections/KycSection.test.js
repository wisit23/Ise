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

it("approves without an optional note and sends the application version", async () => {
  apiFetch.mockImplementation((url, options) => Promise.resolve(options?.method === "POST" ? {} : { items: [{ ...application, status: "PENDING", reason: null, version: 3 }], total: 1, totalPages: 1 }));
  render(<KycSection token="token" />);
  fireEvent.click(await screen.findByRole("button", { name: /อนุมัติ \(VERIFY\)/ }));
  expect(screen.getByText("ไม่บังคับ")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันอนุมัติ (VERIFY)" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/auth/admin/kyc/kyc-1/decision", {
    method: "POST", token: "token", body: { decision: "VERIFIED", reason: "", version: 3 },
  }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("still requires a reason when rejecting an application", async () => {
  apiFetch.mockResolvedValue({ items: [{ ...application, status: "PENDING", reason: null, version: 3 }], total: 1, totalPages: 1 });
  render(<KycSection token="token" />);
  fireEvent.click(await screen.findByRole("button", { name: /ปฏิเสธ \(REJECT\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันปฏิเสธ (REJECT)" }));
  expect(apiFetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  fireEvent.change(screen.getByRole("textbox", { name: /ระบุเหตุผลในการปฏิเสธ/ }), { target: { value: "เอกสารไม่ชัดเจน" } });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันปฏิเสธ (REJECT)" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/auth/admin/kyc/kyc-1/decision", {
    method: "POST", token: "token", body: { decision: "REJECTED", reason: "เอกสารไม่ชัดเจน", version: 3 },
  }));
});

it.each([["อนุมัติ", "VERIFY", "VERIFIED"], ["ปฏิเสธ", "REJECT", "REJECTED"]])(
  "reuses the card reason in the %s confirmation without asking for it again",
  async (label, buttonCode, decision) => {
    apiFetch.mockImplementation((url, options) => Promise.resolve(options?.method === "POST" ? {} : { items: [{ ...application, status: "PENDING", reason: null, version: 3 }], total: 1, totalPages: 1 }));
    render(<KycSection token="token" />);
    fireEvent.change(await screen.findByPlaceholderText("เหตุผลหรือหมายเหตุประกอบการตัดสินใจ..."), { target: { value: "ตรวจเอกสารแล้ว" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`${label} \\(${buttonCode}\\)`) }));
    expect(screen.getByRole("textbox", { name: decision === "VERIFIED" ? "เหตุผลหรือบันทึกเพิ่มเติม" : /ระบุเหตุผลในการปฏิเสธ/ })).toHaveValue("ตรวจเอกสารแล้ว");
    fireEvent.click(screen.getByRole("button", { name: `ยืนยัน${label} (${buttonCode})` }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/auth/admin/kyc/kyc-1/decision", {
      method: "POST", token: "token", body: { decision, reason: "ตรวจเอกสารแล้ว", version: 3 },
    }));
  },
);

it("uses the edited confirmation note, including clearing an optional note", async () => {
  apiFetch.mockImplementation((url, options) => Promise.resolve(options?.method === "POST" ? {} : { items: [{ ...application, status: "PENDING", reason: null, version: 3 }], total: 1, totalPages: 1 }));
  render(<KycSection token="token" />);
  fireEvent.change(await screen.findByPlaceholderText("เหตุผลหรือหมายเหตุประกอบการตัดสินใจ..."), { target: { value: "หมายเหตุเดิม" } });
  fireEvent.click(screen.getByRole("button", { name: /อนุมัติ \(VERIFY\)/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "เหตุผลหรือบันทึกเพิ่มเติม" }), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันอนุมัติ (VERIFY)" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/auth/admin/kyc/kyc-1/decision", {
    method: "POST", token: "token", body: { decision: "VERIFIED", reason: "", version: 3 },
  }));
});

it("keeps the note and dialog open after an API failure so the decision can be retried", async () => {
  let attempts = 0;
  apiFetch.mockImplementation((url, options) => {
    if (options?.method === "POST") return ++attempts === 1 ? Promise.reject(new Error("service unavailable")) : Promise.resolve({});
    return Promise.resolve({ items: [{ ...application, status: "PENDING", reason: null, version: 3 }], total: 1, totalPages: 1 });
  });
  render(<KycSection token="token" />);
  fireEvent.click(await screen.findByRole("button", { name: /อนุมัติ \(VERIFY\)/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "เหตุผลหรือบันทึกเพิ่มเติม" }), { target: { value: "ตรวจเอกสารแล้ว" } });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันอนุมัติ (VERIFY)" }));
  expect(await screen.findByText("service unavailable")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "เหตุผลหรือบันทึกเพิ่มเติม" })).toHaveValue("ตรวจเอกสารแล้ว");
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันอนุมัติ (VERIFY)" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(attempts).toBe(2);
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
