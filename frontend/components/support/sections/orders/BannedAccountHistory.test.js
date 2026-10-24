import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { apiFetch } from "../../../../lib/api";
import BannedAccountHistory from "./BannedAccountHistory";

jest.mock("../../../../lib/api", () => ({ apiFetch: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
const entry = {
  id: "ban-1", targetId: "shop-123", reason: "หลอกลวง", createdAt: "2026-10-23T00:00:00Z",
  actor: { firstName: "เจ้าหน้าที่" },
  account: { id: "shop-123", firstName: "ผู้ขาย", status: "ACTIVE", role: "SELLER", roles: [], sellerProfile: { shopName: "ร้านตัวอย่าง" } },
};

it("shows restored accounts in ban history and opens their full account ID", async () => {
  apiFetch.mockResolvedValue({ items: [entry], total: 1, totalPages: 1 });
  const open = jest.fn();
  render(<BannedAccountHistory token="token" onOpenAccount={open} />);
  expect(await screen.findByText("ร้าน ร้านตัวอย่าง")).toBeInTheDocument();
  expect(screen.getByText("ปลดแบนแล้ว")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "shop-123" }));
  expect(open).toHaveBeenCalledWith("shop-123");
});

it("filters and searches the history independently and pages server results", async () => {
  apiFetch.mockResolvedValue({ items: [entry], total: 12, totalPages: 2 });
  render(<BannedAccountHistory token="token" onOpenAccount={jest.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "ร้านค้า", exact: true }));
  fireEvent.change(screen.getByRole("textbox", { name: "ค้นหาประวัติการแบน" }), { target: { value: "ร้านตัวอย่าง" } });
  fireEvent.click(screen.getByRole("button", { name: "ค้นหาประวัติ" }));
  await waitFor(() => {
    const params = new URL(apiFetch.mock.calls.at(-1)[0], "http://test").searchParams;
    expect(params.get("q")).toBe("ร้านตัวอย่าง");
    expect(params.get("role")).toBe("SELLER");
    expect(params.get("page")).toBe("1");
  });
  fireEvent.click(await screen.findByRole("button", { name: "ถัดไป" }));
  await waitFor(() => expect(new URL(apiFetch.mock.calls.at(-1)[0], "http://test").searchParams.get("page")).toBe("2"));
});

it("shows failures with retry and refreshes after moderation changes", async () => {
  apiFetch.mockRejectedValueOnce(new Error("โหลดไม่สำเร็จ")).mockResolvedValue({ items: [], total: 0, totalPages: 1 });
  const { rerender } = render(<BannedAccountHistory token="token" onOpenAccount={jest.fn()} />);
  expect(await screen.findByText("โหลดไม่สำเร็จ")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  expect(await screen.findByText(/ไม่พบประวัติการแบนที่ตรงกับเงื่อนไข/)).toBeInTheDocument();
  rerender(<BannedAccountHistory token="token" onOpenAccount={jest.fn()} refreshKey={1} />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
});
