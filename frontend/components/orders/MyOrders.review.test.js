import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import MyOrders from "./MyOrders";
import { apiFetch, uploadReviewFiles } from "../../lib/api";

jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
const mockRouter = { push: jest.fn() };
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));
jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(), uploadReviewFiles: jest.fn(), mediaUrl: (url) => url,
}));
jest.mock("../chat/ChatSocketProvider", () => ({ useChatSocketEvent: jest.fn() }));
jest.mock("../OrderLine", () => ({
  __esModule: true,
  default: ({ actions }) => <div>{actions}</div>,
  ProductThumb: () => null,
}));

const originalMedia = [
  { url: "/review-uploads/old.jpg", type: "image" },
  { url: "/review-uploads/old.mp4", type: "video" },
];
let savedReview;
beforeEach(() => {
  jest.clearAllMocks();
  savedReview = { id: "review-1", orderId: "order-1", rating: 4, comment: "รีวิวเดิม", media: originalMedia };
  apiFetch.mockImplementation((url, options) => {
    if (url.startsWith("/api/orders/mine")) return Promise.resolve({
      items: [{ id: "order-1", productId: "product", status: "completed", price: 800 }], totalPages: 1,
    });
    if (url.startsWith("/api/reviews/mine")) return Promise.resolve({ items: savedReview ? [savedReview] : [] });
    if (url === "/api/reviews/review-1" && options?.method === "PATCH") {
      savedReview = { ...savedReview, ...options.body };
      return Promise.resolve(savedReview);
    }
    if (url === "/api/reviews" && options?.method === "POST") {
      savedReview = { id: "review-new", ...options.body };
      return Promise.resolve(savedReview);
    }
    return Promise.resolve({ items: [] });
  });
});

async function openEditor() {
  fireEvent.click(await screen.findByRole("button", { name: /แก้ไขรีวิว/ }));
  return screen.getByRole("textbox");
}

test("edit starts with existing values and saves the same review, including media changes", async () => {
  const view = render(<MyOrders />);
  const comment = await openEditor();
  expect(comment).toHaveValue("รีวิวเดิม");
  expect(screen.getAllByRole("button", { name: "ลบไฟล์นี้" })).toHaveLength(2);
  fireEvent.change(comment, { target: { value: "แก้แล้ว สินค้าดี" } });
  fireEvent.click(screen.getByRole("button", { name: "ให้ 5 ดาว" }));
  fireEvent.click(screen.getAllByRole("button", { name: "ลบไฟล์นี้" })[0]);
  const added = { url: "/review-uploads/new.jpg", type: "image" };
  uploadReviewFiles.mockResolvedValue([added]);
  fireEvent.change(view.container.querySelector('input[type="file"]'), {
    target: { files: [new File(["image"], "new.jpg", { type: "image/jpeg" })] },
  });
  await waitFor(() => expect(uploadReviewFiles).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText("แนบรูปภาพหรือวิดีโอ").closest("button")).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  await screen.findByRole("button", { name: /แก้ไขรีวิว/ });
  expect(apiFetch).toHaveBeenCalledWith("/api/reviews/review-1", {
    method: "PATCH", token: "token",
    body: { rating: 5, comment: "แก้แล้ว สินค้าดี", media: [originalMedia[1], added] },
  });
  expect(screen.getByLabelText("5.0 จาก 5 ดาว")).toBeInTheDocument();
  expect(screen.getByText(/แก้แล้ว สินค้าดี/)).toBeInTheDocument();
  view.unmount();
  render(<MyOrders />);
  expect(await screen.findByText(/แก้แล้ว สินค้าดี/)).toBeInTheDocument();
});

test("cancel keeps the original review and reopening discards unsaved edits", async () => {
  render(<MyOrders />);
  fireEvent.change(await openEditor(), { target: { value: "ยังไม่บันทึก" } });
  fireEvent.click(screen.getByRole("button", { name: "ให้ 1 ดาว" }));
  fireEvent.click(screen.getAllByRole("button", { name: "ลบไฟล์นี้" })[0]);
  fireEvent.click(within(screen.getByRole("textbox").closest("form")).getByRole("button", { name: "ยกเลิก" }));
  expect(screen.getByText(/รีวิวเดิม/)).toBeInTheDocument();
  expect(await openEditor()).toHaveValue("รีวิวเดิม");
  expect(screen.getAllByRole("button", { name: "ลบไฟล์นี้" })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  await screen.findByRole("button", { name: /แก้ไขรีวิว/ });
  expect(apiFetch).toHaveBeenCalledWith("/api/reviews/review-1", expect.objectContaining({
    body: { rating: 4, comment: "รีวิวเดิม", media: originalMedia },
  }));
});

test("a failed save keeps the draft and allows retry", async () => {
  render(<MyOrders />);
  fireEvent.change(await openEditor(), { target: { value: "แก้ไขใหม่" } });
  apiFetch.mockRejectedValueOnce(new Error("บันทึกไม่สำเร็จ"));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  expect(await screen.findByText("บันทึกไม่สำเร็จ")).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("แก้ไขใหม่");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  await screen.findByRole("button", { name: /แก้ไขรีวิว/ });
  expect(screen.getByText(/แก้ไขใหม่/)).toBeInTheDocument();
});

test("an order without a review can still submit a new one", async () => {
  savedReview = null;
  render(<MyOrders />);
  fireEvent.click(await screen.findByRole("button", { name: /ให้คะแนนร้านค้า/ }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "รีวิวใหม่" } });
  fireEvent.click(screen.getByRole("button", { name: "ส่งรีวิว" }));
  await screen.findByRole("button", { name: /แก้ไขรีวิว/ });
  expect(apiFetch).toHaveBeenCalledWith("/api/reviews", {
    method: "POST", token: "token",
    body: { orderId: "order-1", rating: 5, comment: "รีวิวใหม่", media: [] },
  });
});
