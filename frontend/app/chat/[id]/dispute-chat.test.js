import {
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import ChatRoomPage from "./page";
import {
  getConversation,
  listMessages,
  listConversations,
  markRead,
} from "../../../lib/chat";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { apiFetch } from "../../../lib/api";

jest.mock(
  "../../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock("../../../components/chat/ChatProductHeader", () => {
  return function MockProductHeader({ productId }) {
    return <div data-testid="chat-product-header">Product ID: {productId}</div>;
  };
});

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  uploadChatAttachment: jest.fn(),
  mediaUrl: (url) => url,
}));

jest.mock("../../../lib/chat", () => ({
  ...jest.requireActual("../../../lib/chat"),
  getConversation: jest.fn(),
  listMessages: jest.fn(),
  listConversations: jest.fn(),
  sendMessage: jest.fn(),
  markRead: jest.fn(),
  connectSocket: jest.fn(),
}));

jest.mock("../../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

const mockSocketState = { socket: null, connected: false };

jest.mock("../../../components/chat/ChatSocketProvider", () => {
  const { useEffect, useRef } = require("react");
  return {
    useChatSocket: () => mockSocketState,
    useChatSocketEvent: (event, handler) => {
      const handlerRef = useRef(handler);
      handlerRef.current = handler;
      const socket = mockSocketState.socket;
      useEffect(() => {
        if (!socket) return undefined;
        const listener = (...args) => handlerRef.current?.(...args);
        socket.on(event, listener);
        return () => socket.off(event, listener);
      }, [socket, event]);
    },
  };
});

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace };
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "test-conv-1" }),
  useRouter: () => mockRouter,
}));

function createFakeSocket() {
  const handlers = new Map();
  return {
    on: jest.fn((event, cb) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(cb);
    }),
    off: jest.fn((event, cb) => {
      handlers.get(event)?.delete(cb);
    }),
    emit: jest.fn((event, arg, ack) => {
      if (event === "join" && typeof ack === "function") ack({ ok: true });
    }),
    close: jest.fn(),
    _trigger: (event, payload) => {
      for (const cb of handlers.get(event) || []) cb(payload);
    },
  };
}

describe("ChatRoomPage — Normal Chat UX and Dispute Redirection", () => {
  let fakeSocket;
  const originalAlert = window.alert;

  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    fakeSocket = createFakeSocket();
    mockSocketState.socket = fakeSocket;
    mockSocketState.connected = true;

    apiFetch.mockResolvedValue({});
    getAccessToken.mockReturnValue("valid-token");
    getStoredUser.mockReturnValue({
      id: "buyer-1",
      firstName: "Somchai",
      role: "BUYER",
    });
  });

  afterEach(() => {
    window.alert = originalAlert;
  });

  it("displays usernames and roles of both parties in the room header for normal chat", async () => {
    const conv = {
      id: "test-conv-1",
      contextType: "PRODUCT",
      contextId: "prod-999",
      status: "ACTIVE",
      participants: [
        { userId: "buyer-1", role: "BUYER", displayName: "สมชาย ผู้ซื้อ", lastReadAt: null },
        { userId: "seller-1", role: "SELLER", displayName: "ร้านเสื้อผ้าวินเทจ", lastReadAt: null },
      ],
    };
    getConversation.mockResolvedValue(conv);
    listMessages.mockResolvedValue({ items: [] });
    listConversations.mockResolvedValue({ items: [conv] });

    render(<ChatRoomPage />);

    // Should display other user's name in room header
    const headings = await screen.findAllByText("ร้านเสื้อผ้าวินเทจ");
    expect(headings.length).toBeGreaterThan(0);
    expect(screen.getAllByText("ร้านค้า").length).toBeGreaterThan(0);

    // Should display current user's name and role in the header
    expect(screen.getByText("สมชาย ผู้ซื้อ")).toBeInTheDocument();
    expect(screen.getByText("(ผู้ซื้อ)")).toBeInTheDocument();
  });

  it("redirects to /orders when opening a dispute conversation directly", async () => {
    const disputeConv = {
      id: "test-conv-1",
      contextType: "DISPUTE_BUYER",
      contextId: "disp-123",
      status: "ACTIVE",
      participants: [
        { userId: "buyer-1", role: "BUYER", displayName: "ผู้ซื้อ", lastReadAt: null },
        { userId: "admin-1", role: "ADMIN", displayName: "เจ้าหน้าที่ Admin", lastReadAt: null },
      ],
    };
    getConversation.mockResolvedValue(disputeConv);
    listMessages.mockResolvedValue({ items: [] });
    listConversations.mockResolvedValue({ items: [disputeConv] });

    render(<ChatRoomPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/orders");
    });
  });

  it("filters out dispute conversations from sidebar list", async () => {
    const normalConv = {
      id: "test-conv-1",
      contextType: "PRODUCT",
      contextId: "prod-1",
      status: "ACTIVE",
      participants: [
        { userId: "buyer-1", role: "BUYER", displayName: "สมชาย", lastReadAt: null },
        { userId: "seller-1", role: "SELLER", displayName: "ร้านปกติ", lastReadAt: null },
      ],
    };
    const disputeConv = {
      id: "disp-conv-9",
      contextType: "DISPUTE_BUYER",
      contextId: "disp-9",
      status: "ACTIVE",
      participants: [
        { userId: "buyer-1", role: "BUYER", displayName: "สมชาย", lastReadAt: null },
      ],
    };

    getConversation.mockResolvedValue(normalConv);
    listMessages.mockResolvedValue({ items: [] });
    listConversations.mockResolvedValue({ items: [normalConv, disputeConv] });

    render(<ChatRoomPage />);

    // The normal conversation should be in sidebar, but dispute should be excluded
    await screen.findByText("สมชาย");
    expect(screen.queryByText("disp-conv-9")).not.toBeInTheDocument();
  });

  it("removes conversation and redirects when conversation:deleted socket event arrives", async () => {
    const normalConv = {
      id: "test-conv-1",
      contextType: "PRODUCT",
      contextId: "prod-1",
      status: "ACTIVE",
      participants: [
        { userId: "buyer-1", role: "BUYER", displayName: "สมชาย", lastReadAt: null },
        { userId: "seller-1", role: "SELLER", displayName: "ร้านค้า", lastReadAt: null },
      ],
    };
    getConversation.mockResolvedValue(normalConv);
    listMessages.mockResolvedValue({ items: [] });
    listConversations.mockResolvedValue({ items: [normalConv] });

    render(<ChatRoomPage />);
    await screen.findAllByText("ร้านค้า");

    // Socket broadcasts conversation:deleted
    act(() => {
      fakeSocket._trigger("conversation:deleted", {
        conversationId: "test-conv-1",
      });
    });

    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("ห้องสนทนาข้อพิพาทนี้ถูกปิดและลบออกจากระบบ"),
    );
    expect(mockPush).toHaveBeenCalledWith("/chat");
  });
});
