import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SellerVideoList from "./SellerVideoList";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: (url) => url,
}));
jest.mock("../../../lib/auth", () => ({ getAccessToken: () => "token" }));
jest.mock("../../../lib/useSellerLiveRefresh", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock(
  "../../VideoUploader",
  () =>
    function MockUploader() {
      return <div>Video uploader</div>;
    },
);

const products = [{ id: "p1", title: "เสื้อ", status: "available" }];
const clip = {
  id: "v1",
  title: "คลิปเสื้อ",
  productId: "p1",
  product: products[0],
  videoUrl: "/uploads/a.mp4",
  createdAt: "2026-10-24T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("shows clip details, playable preview and upload link", async () => {
  apiFetch.mockResolvedValue({ items: [clip], totalPages: 1 });
  const { container } = render(<SellerVideoList products={products} />);
  expect(await screen.findByText("คลิปเสื้อ")).toBeInTheDocument();
  expect(container.querySelector("video")).toHaveAttribute("controls");
  expect(screen.getByText("พร้อมขาย")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /ดูสินค้าที่เชื่อมโยง/ }),
  ).toHaveAttribute("href", "/products/p1");
  expect(screen.getByRole("link", { name: "ดูในหน้าปัดคลิป" })).toHaveAttribute(
    "href",
    "/swipe?video=v1",
  );
  expect(screen.getByRole("link", { name: "อัปโหลดคลิปใหม่" })).toHaveAttribute(
    "href",
    "/seller/videos/new",
  );
});

test("edits a clip through the authenticated API then refreshes", async () => {
  apiFetch.mockResolvedValue({ items: [clip], totalPages: 1 });
  render(<SellerVideoList products={products} />);
  fireEvent.click(await screen.findByRole("button", { name: "แก้ไข" }));
  fireEvent.change(screen.getByLabelText("ชื่อคลิป"), {
    target: { value: "ชื่อใหม่" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/videos/v1",
      expect.objectContaining({
        method: "PATCH",
        token: "token",
        body: expect.objectContaining({ title: "ชื่อใหม่", productId: "p1" }),
      }),
    ),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("form", { name: "แก้ไขคลิป" }),
    ).not.toBeInTheDocument(),
  );
});

test("requires confirmation for deletion and recovers pagination after deleting last clip", async () => {
  apiFetch.mockImplementation((url, options) => {
    if (options.method === "DELETE") return Promise.resolve({ success: true });
    return Promise.resolve({ items: [clip], totalPages: 2 });
  });
  render(<SellerVideoList products={products} />);
  fireEvent.click(await screen.findByRole("button", { name: "ลบคลิป" }));
  expect(apiFetch).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ method: "DELETE" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await screen.findByText("หน้า 2 / 2");
  apiFetch.mockResolvedValue({ items: [], totalPages: 1 });
  fireEvent.click(screen.getByRole("button", { name: "ลบคลิป" }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบคลิป" }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/videos/v1",
      expect.objectContaining({ method: "DELETE" }),
    ),
  );
  expect(
    await screen.findByText(/ยังไม่มีคลิปสินค้าที่ยังไม่ขาย/),
  ).toBeInTheDocument();
});

test("preserves edit form after failure and offers list retry", async () => {
  apiFetch
    .mockResolvedValueOnce({ items: [clip], totalPages: 1 })
    .mockRejectedValue(new Error("บันทึกไม่สำเร็จ"));
  render(<SellerVideoList products={products} />);
  fireEvent.click(await screen.findByRole("button", { name: "แก้ไข" }));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกไม่สำเร็จ");
  expect(screen.getByLabelText("ชื่อคลิป")).toHaveValue("คลิปเสื้อ");
});
