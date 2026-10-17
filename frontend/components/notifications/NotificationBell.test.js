import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import NotificationBell from "./NotificationBell";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "../../lib/notifications";

import { getAccessToken } from "../../lib/auth";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
}));

jest.mock("../../lib/notifications", () => ({
  getNotifications: jest.fn(),
  getUnreadNotificationCount: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
  deleteNotification: jest.fn(),
}));


let socketHandler = null;
jest.mock("../chat/ChatSocketProvider", () => {
  return {
    useChatSocket: () => ({ connected: true }),
    useChatSocketEvent: (event, handler) => {
      if (event === "notification:new") {
        socketHandler = handler;
      }
    },
  };
});

describe("NotificationBell", () => {
  const mockUser = { id: "user-1", firstName: "สมชาย", role: "BUYER" };

  beforeEach(() => {
    jest.clearAllMocks();
    getAccessToken.mockReturnValue("mock-token");
    getUnreadNotificationCount.mockResolvedValue({ total: 2 });
    getNotifications.mockResolvedValue({
      items: [
        {
          id: "n-1",
          type: "DISCOUNT",
          title: "โค้ดส่วนลดใหม่!",
          message: "โค้ด SALE50 ลด 50%",
          link: "/campaigns",
          read: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: "n-2",
          type: "AUCTION",
          title: "เริ่มการประมูลแล้ว",
          message: "รอบประมูลเปิดให้เสนอราคา",
          link: "/auctions/round-1",
          read: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: "n-3",
          type: "ORDER",
          title: "มีลูกค้าสั่งสินค้า",
          message: "ลูกค้าสั่งซื้อสินค้า #order-101",
          link: "/orders",
          read: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: "n-4",
          type: "DISPUTE",
          title: "มีข้อพิพาทใหม่",
          message: "คำสั่งซื้อ #order-102 ถูกเปิดข้อพิพาท",
          link: "/orders",
          read: true,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 4,
    });
    markNotificationRead.mockResolvedValue({ success: true });
    markAllNotificationsRead.mockResolvedValue({ success: true });
  });

  it("renders nothing when user is null", () => {
    const { container } = render(<NotificationBell user={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders notification bell button with unread count badge", async () => {
    render(<NotificationBell user={mockUser} />);
    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.getByLabelText(/การแจ้งเตือน มี 2 รายการที่ยังไม่อ่าน/)).toBeInTheDocument();
  });

  it("opens dropdown panel on click and displays notification list", async () => {
    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByRole("dialog", { name: /หน้าต่างการแจ้งเตือน/i })).toBeInTheDocument();
    expect(await screen.findByText("โค้ดส่วนลดใหม่!")).toBeInTheDocument();
    expect(screen.getByText("เริ่มการประมูลแล้ว")).toBeInTheDocument();
    expect(screen.getByText("มีลูกค้าสั่งสินค้า")).toBeInTheDocument();
    expect(screen.getByText("มีข้อพิพาทใหม่")).toBeInTheDocument();
  });

  it("filters notifications by unread tab", async () => {
    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const unreadTab = await screen.findByRole("button", { name: /^ยังไม่อ่าน/ });
    await act(async () => {
      fireEvent.click(unreadTab);
    });

    expect(screen.getByText("โค้ดส่วนลดใหม่!")).toBeInTheDocument();
    expect(screen.getByText("เริ่มการประมูลแล้ว")).toBeInTheDocument();
    expect(screen.queryByText("มีลูกค้าสั่งสินค้า")).not.toBeInTheDocument();
  });

  it("filters notifications by read tab and moves clicked notification to read", async () => {
    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const readTab = await screen.findByRole("button", { name: /^อ่านแล้ว/ });
    await act(async () => {
      fireEvent.click(readTab);
    });

    expect(screen.getByText("มีลูกค้าสั่งสินค้า")).toBeInTheDocument();
    expect(screen.getByText("มีข้อพิพาทใหม่")).toBeInTheDocument();
    expect(screen.queryByText("โค้ดส่วนลดใหม่!")).not.toBeInTheDocument();
  });

  it("marks all notifications as read when clicking mark all read button", async () => {
    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const markAllBtn = await screen.findByRole("button", { name: /อ่านทั้งหมด/i });
    await act(async () => {
      fireEvent.click(markAllBtn);
    });

    expect(markAllNotificationsRead).toHaveBeenCalledWith("mock-token");
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("marks single notification as read and navigates when clicked", async () => {
    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const notifItem = await screen.findByText("โค้ดส่วนลดใหม่!");
    await act(async () => {
      fireEvent.click(notifItem.closest('[role="button"]') || notifItem.closest("button"));
    });

    expect(markNotificationRead).toHaveBeenCalledWith("mock-token", "n-1");
    expect(mockPush).toHaveBeenCalledWith("/campaigns");
  });


  it("handles real-time notification:new socket event", async () => {
    render(<NotificationBell user={mockUser} />);
    await screen.findByText("2");

    act(() => {
      socketHandler?.({
        id: "n-live",
        type: "ORDER",
        title: "ลูกค้าชำระเงินแล้ว",
        message: "คำสั่งซื้อ #order-999 ชำระเงินเรียบร้อย",
        link: "/orders",
        createdAt: new Date().toISOString(),
      });
    });

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("supersedes previous notification for the same entity and does not increase unread count if already unread", async () => {
    getNotifications.mockResolvedValue({
      items: [
        {
          id: "n-order-1",
          entityId: "order-100",
          type: "ORDER",
          title: "มีคำสั่งซื้อใหม่",
          message: "ลูกค้าสร้างคำสั่งซื้อ #order-100 รอการชำระเงิน",
          link: "/orders",
          read: false,
          metadata: { orderId: "order-100", status: "pending_payment" },
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    });
    getUnreadNotificationCount.mockResolvedValue({ total: 1 });

    render(<NotificationBell user={mockUser} />);
    expect(await screen.findByText("1")).toBeInTheDocument();

    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText("มีคำสั่งซื้อใหม่")).toBeInTheDocument();

    // Customer completes payment: socket event arrives with updated status for the same order
    await act(async () => {
      socketHandler?.({
        id: "n-order-1",
        entityId: "order-100",
        type: "ORDER",
        title: "ผู้ซื้อชำระเงินแล้ว",
        message: "ลูกค้าชำระเงินสำหรับสินค้า #order-100 เรียบร้อยแล้ว",
        link: "/seller/dashboard?orderId=order-100",
        metadata: { orderId: "order-100", status: "paid" },
        createdAt: new Date().toISOString(),
      });
    });

    // Unread count should remain 1 (NOT 2) because it replaced the existing unread stage
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("ผู้ซื้อชำระเงินแล้ว")).toBeInTheDocument();
    expect(screen.queryByText("มีคำสั่งซื้อใหม่")).not.toBeInTheDocument();
  });

  it("supersedes read notification for the same entity and increments unread count by 1", async () => {
    getNotifications.mockResolvedValue({
      items: [
        {
          id: "n-order-read",
          entityId: "order-200",
          type: "ORDER",
          title: "ผู้ซื้อชำระเงินแล้ว",
          message: "ชำระเงินสำเร็จ #order-200",
          link: "/orders",
          read: true,
          metadata: { orderId: "order-200", status: "paid" },
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    });
    getUnreadNotificationCount.mockResolvedValue({ total: 0 });

    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText("ผู้ซื้อชำระเงินแล้ว")).toBeInTheDocument();

    // Order status changes to confirmed: socket event arrives
    await act(async () => {
      socketHandler?.({
        id: "n-order-read",
        entityId: "order-200",
        type: "ORDER",
        title: "ผู้ขายยืนยันคำสั่งซื้อแล้ว",
        message: "ผู้ขายยืนยันคำสั่งซื้อ #order-200 แล้ว",
        link: "/orders",
        metadata: { orderId: "order-200", status: "confirmed" },
        createdAt: new Date().toISOString(),
      });
    });

    // Unread count should now be 1
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("ผู้ขายยืนยันคำสั่งซื้อแล้ว")).toBeInTheDocument();
    expect(screen.queryByText("ชำระเงินสำเร็จ #order-200")).not.toBeInTheDocument();
  });

  it("dismisses dropdown when Escape is pressed", async () => {
    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Requirement 3: deletes notification when clicking the cross button", async () => {
    deleteNotification.mockResolvedValue({ success: true });
    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const deleteButtons = screen.getAllByRole("button", { name: /ลบการแจ้งเตือน/i });
    expect(deleteButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(deleteNotification).toHaveBeenCalledWith("mock-token", "n-1");
    expect(screen.queryByText("โค้ดส่วนลดใหม่!")).not.toBeInTheDocument();
  });

  it("Requirement 2: clicking a report notification opens ReportDecisionModal", async () => {
    getNotifications.mockResolvedValue({
      items: [
        {
          id: "n-report-1",
          type: "REPORT",
          title: "ผลการพิจารณารายงาน",
          message: "รายงานความคิดเห็นได้รับการพิจารณาแล้ว โดยมีผลการตัดสิน: ตักเตือนผู้ใช้",
          link: "/products/prod-1",
          read: false,
          createdAt: new Date().toISOString(),
          metadata: {
            reportId: "rep-101",
            decision: "WARN_USER",
            reason: "แสดงความเห็นไม่สุภาพและก่อกวน",
            role: "reporter",
          },
        },
      ],
      total: 1,
    });

    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const notifItem = await screen.findByText("ผลการพิจารณารายงาน");
    await act(async () => {
      fireEvent.click(notifItem.closest('[role="button"]'));
    });

    // ReportDecisionModal should pop up!
    expect(await screen.findByText("รายละเอียดผลการตัดสินจากผู้ดูแลระบบ")).toBeInTheDocument();
    expect(screen.getByText("ตักเตือนผู้ใช้")).toBeInTheDocument();
    expect(screen.getByText("แสดงความเห็นไม่สุภาพและก่อกวน")).toBeInTheDocument();
    expect(screen.getByText("คุณเป็นผู้รายงาน")).toBeInTheDocument();
  });

  it("clicking a dispute notification opens ReportDecisionModal with dispute details", async () => {
    getNotifications.mockResolvedValue({
      items: [
        {
          id: "n-dispute-1",
          type: "DISPUTE",
          title: "ผลการตัดสินข้อพิพาท",
          message: "ข้อพิพาทสำหรับคำสั่งซื้อ #ord-123 ได้รับการตัดสินแล้ว",
          link: "/orders",
          read: false,
          createdAt: new Date().toISOString(),
          metadata: {
            disputeId: "disp-101",
            orderId: "ord-123",
            decision: "APPROVE_REFUND",
            reason: "สินค้าชำรุดเสียหายจริงตามหลักฐาน",
            role: "buyer",
          },
        },
      ],
      total: 1,
    });

    render(<NotificationBell user={mockUser} />);
    const button = await screen.findByRole("button", { name: /การแจ้งเตือน/i });

    await act(async () => {
      fireEvent.click(button);
    });

    const notifItem = await screen.findByText("ผลการตัดสินข้อพิพาท");
    await act(async () => {
      fireEvent.click(notifItem.closest('[role="button"]'));
    });

    // ReportDecisionModal should pop up with dispute info!
    expect(await screen.findByText("รายละเอียดข้อพิพาทและผลการตัดสิน")).toBeInTheDocument();
    expect(screen.getByText("อนุมัติคืนเงินเต็มจำนวนให้ผู้ซื้อ")).toBeInTheDocument();
    expect(screen.getByText("สินค้าชำรุดเสียหายจริงตามหลักฐาน")).toBeInTheDocument();
    expect(screen.getByText("คุณเป็นผู้ซื้อในคำสั่งซื้อนี้")).toBeInTheDocument();
  });
});


