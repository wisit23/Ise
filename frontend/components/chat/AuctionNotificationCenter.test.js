import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AuctionNotificationCenter from "./AuctionNotificationCenter";
import {
  getConversation,
  listConversations,
  listMessages,
  markRead,
} from "../../lib/chat";
import { getAccessToken, getStoredUser } from "../../lib/auth";

const push = jest.fn();
let activityHandler;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/products",
}));
jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getCurrentRoles: jest.fn(() => ["SELLER"]),
  getStoredUser: jest.fn(),
  isCustomerAccountRoles: jest.fn(() => true),
}));
jest.mock("../../lib/chat", () => ({
  getConversation: jest.fn(),
  hasUnread: jest.fn(() => true),
  listConversations: jest.fn(),
  listMessages: jest.fn(),
  markRead: jest.fn(),
}));
jest.mock("./ChatSocketProvider", () => ({
  useChatSocket: () => ({ connected: true }),
  useChatSocketEvent: (event, handler) => {
    if (event === "conversation:activity") activityHandler = handler;
  },
}));

const auctionMessage = {
  id: "message-1",
  type: "SYSTEM",
  payload: {
    event: "auction.item_cancelled",
    summary: 'รายการประมูล "เสื้อแจ็กเก็ต" ถูกยกเลิก',
  },
};

describe("AuctionNotificationCenter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activityHandler = undefined;
    getAccessToken.mockReturnValue("token-1");
    getStoredUser.mockReturnValue({ id: "seller-1" });
    listConversations.mockResolvedValue({
      items: [
        {
          id: "room-1",
          contextType: "AUCTION",
          lastMessageAt: "2026-10-15T10:00:00.000Z",
          participants: [
            { userId: "seller-1", lastReadAt: null, joinedAt: null },
          ],
        },
      ],
    });
    listMessages.mockResolvedValue({ items: [auctionMessage] });
    markRead.mockResolvedValue({});
  });

  it("keeps an unread auction alert in the center until the user acknowledges it", async () => {
    render(<AuctionNotificationCenter />);

    expect(
      await screen.findByRole("dialog", { name: "การแจ้งเตือนการประมูล" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('รายการประมูล "เสื้อแจ็กเก็ต" ถูกยกเลิก'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "รับทราบ" }));
    await waitFor(() => expect(markRead).toHaveBeenCalledWith("room-1", "token-1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens the notification room when the user asks for full details", async () => {
    render(<AuctionNotificationCenter />);
    await screen.findByRole("dialog");

    fireEvent.click(
      screen.getByRole("button", { name: /เปิดรายละเอียดในแชท/ }),
    );
    expect(push).toHaveBeenCalledWith("/chat/room-1");
  });

  it("keeps the alert visible when acknowledging cannot be persisted", async () => {
    markRead.mockRejectedValueOnce(new Error("chat unavailable"));
    render(<AuctionNotificationCenter />);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "รับทราบ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ยังบันทึกการรับทราบไม่ได้",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("reacts only to pushed activity from an AUCTION room", async () => {
    listConversations.mockResolvedValue({ items: [] });
    getConversation.mockResolvedValue({ id: "room-live", contextType: "AUCTION" });
    render(<AuctionNotificationCenter />);

    await act(async () => {
      await activityHandler({ conversationId: "room-live" });
    });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(listMessages).toHaveBeenCalledWith(
      "room-live",
      { limit: 1 },
      "token-1",
    );
  });
});
