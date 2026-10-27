import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SellerAutoMessages from "./SellerAutoMessages";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("../../../lib/auth", () => ({
  getAccessToken: jest.fn(() => "mock-seller-token"),
}));

describe("SellerAutoMessages", () => {
  const mockMessages = [
    { id: "msg-1", userId: "seller-1", messageText: "สินค้ายังอยู่ไหมครับ?", isActive: true },
    { id: "msg-2", userId: "seller-1", messageText: "ลดราคาได้ไหมครับ?", isActive: false },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders loaded auto messages with active counts and preview", async () => {
    apiFetch.mockResolvedValueOnce(mockMessages);

    render(<SellerAutoMessages />);

    expect(screen.getByText("กำลังโหลดข้อมูล...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("auto-message-msg-1")).toBeInTheDocument();
      expect(screen.getByTestId("auto-message-msg-2")).toBeInTheDocument();
    });

    expect(screen.getByText("เปิดใช้งานอยู่ 1 / 2 ข้อ (สูงสุด 20 ข้อ)")).toBeInTheDocument();
    expect(screen.getByText("เปิดใช้งาน")).toBeInTheDocument();
    expect(screen.getByText("ปิดใช้งาน")).toBeInTheDocument();

    // Buyer preview section
    expect(screen.getByText("ตัวอย่างมุมมองของผู้ซื้อ (Buyer Preview)")).toBeInTheDocument();
  });

  it("allows creating a new automated question", async () => {
    apiFetch
      .mockResolvedValueOnce(mockMessages)
      .mockResolvedValueOnce({
        id: "msg-3",
        userId: "seller-1",
        messageText: "มีของพร้อมส่งไหมครับ?",
        isActive: true,
      });

    render(<SellerAutoMessages />);

    await waitFor(() => {
      expect(screen.getByTestId("auto-message-msg-1")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/พิมพ์คำถามที่ต้องการ/);
    fireEvent.change(input, { target: { value: "มีของพร้อมส่งไหมครับ?" } });

    fireEvent.click(screen.getByRole("button", { name: /เพิ่มคำถาม/ }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/shop/auto-messages", {
        method: "POST",
        token: "mock-seller-token",
        body: { messageText: "มีของพร้อมส่งไหมครับ?", isActive: true },
      });
      expect(screen.getByTestId("auto-message-msg-3")).toBeInTheDocument();
    });
  });

  it("disables new questions when the shop has 20", async () => {
    apiFetch.mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => ({
      id: `msg-${index}`,
      messageText: `คำถาม ${index + 1}`,
      isActive: true,
    })));

    render(<SellerAutoMessages />);

    await waitFor(() => {
      expect(screen.getByText("ทั้งหมด 20 รายการ")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /เพิ่มคำถาม/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /สินค้ายังอยู่ไหมครับ/ })).toBeDisabled();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("toggles active/inactive status", async () => {
    apiFetch
      .mockResolvedValueOnce(mockMessages)
      .mockResolvedValueOnce({ id: "msg-2", messageText: "ลดราคาได้ไหมครับ?", isActive: true });

    render(<SellerAutoMessages />);

    await waitFor(() => {
      expect(screen.getByText("ปิดใช้งาน")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("ปิดใช้งาน"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/shop/auto-messages/msg-2", {
        method: "PATCH",
        token: "mock-seller-token",
        body: { isActive: true },
      });
    });
  });

  it("allows editing a question", async () => {
    apiFetch
      .mockResolvedValueOnce(mockMessages)
      .mockResolvedValueOnce({
        id: "msg-1",
        userId: "seller-1",
        messageText: "สินค้าสภาพเป็นอย่างไรบ้างครับ?",
        isActive: true,
      });

    render(<SellerAutoMessages />);

    await waitFor(() => {
      expect(screen.getByTestId("auto-message-msg-1")).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle("แก้ไขข้อความ");
    fireEvent.click(editBtns[0]);

    const editInput = screen.getByDisplayValue("สินค้ายังอยู่ไหมครับ?");
    fireEvent.change(editInput, { target: { value: "สินค้าสภาพเป็นอย่างไรบ้างครับ?" } });

    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/shop/auto-messages/msg-1", {
        method: "PATCH",
        token: "mock-seller-token",
        body: { messageText: "สินค้าสภาพเป็นอย่างไรบ้างครับ?" },
      });
      expect(screen.getByTestId("auto-message-msg-1")).toHaveTextContent("สินค้าสภาพเป็นอย่างไรบ้างครับ?");
    });
  });

  it("allows adding via suggestion chips", async () => {
    apiFetch
      .mockResolvedValueOnce(mockMessages)
      .mockResolvedValueOnce({
        id: "msg-4",
        userId: "seller-1",
        messageText: "สะดวกจัดส่งวันไหนครับ?",
        isActive: true,
      });

    render(<SellerAutoMessages />);

    await waitFor(() => {
      expect(screen.getByTestId("auto-message-msg-1")).toBeInTheDocument();
    });

    const suggestionBtn = screen.getByRole("button", { name: /สะดวกจัดส่งวันไหนครับ\?/ });
    fireEvent.click(suggestionBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/shop/auto-messages", {
        method: "POST",
        token: "mock-seller-token",
        body: { messageText: "สะดวกจัดส่งวันไหนครับ?", isActive: true },
      });
    });
  });

  it("shows confirmation popup when clicking delete and allows canceling", async () => {
    apiFetch.mockResolvedValueOnce(mockMessages);

    render(<SellerAutoMessages />);

    await waitFor(() => {
      expect(screen.getByTestId("auto-message-msg-1")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle("ลบคำถามนี้");
    fireEvent.click(deleteBtns[0]);

    // Popup opens
    expect(screen.getByText("ยืนยันการลบคำถามอัตโนมัติ")).toBeInTheDocument();
    expect(
      screen.getByText(/คุณแน่ใจว่าต้องการลบคำถาม "สินค้ายังอยู่ไหมครับ\?" ใช่หรือไม่\?/),
    ).toBeInTheDocument();

    // Click cancel in popup
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));

    // Popup closes and item is still there, API not called
    expect(screen.queryByText("ยืนยันการลบคำถามอัตโนมัติ")).not.toBeInTheDocument();
    expect(screen.getByTestId("auto-message-msg-1")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1); // only initial load
  });

  it("deletes a question when confirmed in the confirmation popup", async () => {
    apiFetch
      .mockResolvedValueOnce(mockMessages)
      .mockResolvedValueOnce({ success: true });

    render(<SellerAutoMessages />);

    await waitFor(() => {
      expect(screen.getByTestId("auto-message-msg-1")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle("ลบคำถามนี้");
    fireEvent.click(deleteBtns[0]);

    // Popup opens
    expect(screen.getByText("ยืนยันการลบคำถามอัตโนมัติ")).toBeInTheDocument();

    // Click confirm deletion button in popup
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการลบ" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/shop/auto-messages/msg-1", {
        method: "DELETE",
        token: "mock-seller-token",
      });
      expect(screen.queryByTestId("auto-message-msg-1")).not.toBeInTheDocument();
      expect(screen.getByText("ลบคำถามเรียบร้อยแล้ว")).toBeInTheDocument();
    });
  });
});
