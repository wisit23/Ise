import { render, screen, waitFor, act } from "@testing-library/react";
import ChatInboxPage from "./page";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";

jest.mock(
  "../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: (url) => url,
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

const mockPush = jest.fn();
// A stable object, not a fresh literal per call — next/navigation's real
// useRouter() returns a memoized router, and this page's effect depends on
// `router` in its dependency array; an unstable mock reference would make
// the effect re-run every render (each re-render creating a "new" router)
// and silently loop.
const mockRouter = { push: mockPush };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// The inbox reads the app-wide socket through the provider's hooks rather
// than owning a connection, so the fake is injected at that seam.
const mockSocketState = { socket: null, connected: false };

jest.mock("../../components/chat/ChatSocketProvider", () => {
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

function createFakeSocket() {
  const handlers = new Map();
  return {
    on: jest.fn((event, cb) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(cb);
    }),
    off: jest.fn((event, cb) => handlers.get(event)?.delete(cb)),
    emit: jest.fn(),
    close: jest.fn(),
    _trigger: (event, payload) => {
      for (const cb of handlers.get(event) || []) cb(payload);
    },
  };
}

describe("ChatInboxPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    getAccessToken.mockReset();
    getStoredUser.mockReset();
    mockPush.mockReset();
    mockSocketState.socket = null;
    mockSocketState.connected = false;
  });

  it("redirects a guest to /login without ever calling the API", async () => {
    getAccessToken.mockReturnValue(null);

    render(<ChatInboxPage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("shows an empty state when there are no conversations", async () => {
    getAccessToken.mockReturnValue("token-123");
    getStoredUser.mockReturnValue({ id: "buyer-1" });
    apiFetch.mockResolvedValueOnce({ items: [] });

    render(<ChatInboxPage />);

    expect(await screen.findByText("ยังไม่มีข้อความ")).toBeInTheDocument();
  });

  it("shows the API error instead of a blank page", async () => {
    getAccessToken.mockReturnValue("token-123");
    getStoredUser.mockReturnValue({ id: "buyer-1" });
    apiFetch.mockRejectedValueOnce(new Error("chat-service unavailable"));

    render(<ChatInboxPage />);

    expect(
      await screen.findByText("chat-service unavailable"),
    ).toBeInTheDocument();
  });

  it("renders a conversation row linking to its room", async () => {
    getAccessToken.mockReturnValue("token-123");
    getStoredUser.mockReturnValue({ id: "buyer-1" });
    apiFetch.mockImplementation((path) => {
      if (path === "/api/chat/conversations") {
        return Promise.resolve({
          items: [
            {
              id: "conv-1",
              contextType: "PRODUCT",
              lastMessagePreview: "สนใจสินค้านี้อยู่ครับ",
              lastMessageAt: "2026-09-03T10:00:00.000Z",
              participants: [
                {
                  userId: "buyer-1",
                  role: "BUYER",
                  lastReadAt: "2026-09-03T10:00:00.000Z",
                },
                {
                  userId: "seller-1",
                  role: "SELLER",
                  lastReadAt: null,
                  // Resolved server-side by chat-service; the browser never
                  // looks a userId up itself (that endpoint would let one
                  // account enumerate every user).
                  displayName: "ร้านของสะสม",
                },
              ],
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    render(<ChatInboxPage />);

    const link = await screen.findByRole("link", { name: /ร้านของสะสม/ });
    expect(link).toHaveAttribute("href", "/chat/conv-1");
    expect(screen.getByText("สนใจสินค้านี้อยู่ครับ")).toBeInTheDocument();
    // The enumeration guard: rendering an inbox must never turn into a
    // per-row "who is this userId?" request from the browser.
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/users/"),
      expect.anything(),
    );
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/users/"),
    );
    // The buyer (self) has already read up to lastMessageAt, so no unread dot.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("badges each row with the other side's role in that room", async () => {
    getAccessToken.mockReturnValue("token-123");
    getStoredUser.mockReturnValue({ id: "buyer-1" });
    apiFetch.mockImplementation((path) => {
      if (path === "/api/chat/conversations") {
        return Promise.resolve({
          items: [
            {
              id: "conv-shop",
              contextType: "PRODUCT",
              lastMessagePreview: "สนใจสินค้านี้ครับ",
              lastMessageAt: "2026-09-04T10:00:00.000Z",
              participants: [
                {
                  userId: "buyer-1",
                  role: "BUYER",
                  lastReadAt: "2026-09-04T10:00:00.000Z",
                },
                {
                  userId: "seller-1",
                  role: "SELLER",
                  lastReadAt: null,
                  displayName: "ร้านของสะสม",
                },
              ],
            },
            {
              id: "conv-support",
              contextType: "SUPPORT",
              lastMessagePreview: "รับเรื่องแล้วครับ",
              lastMessageAt: "2026-09-04T11:00:00.000Z",
              participants: [
                {
                  userId: "buyer-1",
                  role: "BUYER",
                  lastReadAt: "2026-09-04T11:00:00.000Z",
                },
                {
                  userId: "agent-1",
                  role: "AGENT",
                  lastReadAt: null,
                  displayName: "น่าน",
                },
              ],
            },
            {
              // A role this build doesn't know about must render no badge
              // at all rather than leaking the raw enum into the UI.
              id: "conv-unknown",
              contextType: "DIRECT",
              lastMessagePreview: "สวัสดี",
              lastMessageAt: "2026-09-04T12:00:00.000Z",
              participants: [
                {
                  userId: "buyer-1",
                  role: "BUYER",
                  lastReadAt: "2026-09-04T12:00:00.000Z",
                },
                {
                  userId: "mod-1",
                  role: "MODERATOR",
                  lastReadAt: null,
                  displayName: "ใครสักคน",
                },
              ],
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    render(<ChatInboxPage />);

    // The whole point of the badge: telling a shop thread from a support
    // thread without opening either one.
    expect(await screen.findByText("ร้านค้า")).toBeInTheDocument();
    expect(screen.getByText("ฝ่ายบริการลูกค้า")).toBeInTheDocument();
    expect(screen.queryByText("MODERATOR")).not.toBeInTheDocument();
    // "ผู้ซื้อ" is this user's own role — never shown, the badge describes
    // the person on the other side.
    expect(screen.queryByText("ผู้ซื้อ")).not.toBeInTheDocument();
  });

  it("shows an unread indicator when the current user hasn't read the latest message", async () => {
    getAccessToken.mockReturnValue("token-123");
    getStoredUser.mockReturnValue({ id: "buyer-1" });
    apiFetch.mockImplementation((path) => {
      if (path === "/api/chat/conversations") {
        return Promise.resolve({
          items: [
            {
              id: "conv-2",
              contextType: "PRODUCT",
              lastMessagePreview: "ตอบกลับล่าสุด",
              lastMessageAt: "2026-09-03T12:00:00.000Z",
              participants: [
                { userId: "buyer-1", role: "BUYER", lastReadAt: null },
                {
                  userId: "seller-2",
                  role: "SELLER",
                  lastReadAt: null,
                  displayName: "สมชาย",
                },
              ],
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    render(<ChatInboxPage />);

    await screen.findByText("ตอบกลับล่าสุด");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("refreshes the list live when the socket reports activity, with no reload", async () => {
    const fakeSocket = createFakeSocket();
    mockSocketState.socket = fakeSocket;
    mockSocketState.connected = true;

    getAccessToken.mockReturnValue("token-123");
    getStoredUser.mockReturnValue({ id: "buyer-1" });

    let preview = "ข้อความเดิม";
    apiFetch.mockImplementation((path) => {
      if (path === "/api/chat/conversations") {
        return Promise.resolve({
          items: [
            {
              id: "conv-live",
              contextType: "PRODUCT",
              lastMessagePreview: preview,
              lastMessageAt: "2026-09-03T10:00:00.000Z",
              participants: [
                {
                  userId: "buyer-1",
                  role: "BUYER",
                  lastReadAt: "2026-09-03T10:00:00.000Z",
                },
                {
                  userId: "seller-9",
                  role: "SELLER",
                  lastReadAt: null,
                  displayName: "ร้านสด",
                },
              ],
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    render(<ChatInboxPage />);
    await screen.findByText("ข้อความเดิม");

    // The server now says something newer exists; the push itself carries
    // no content, it only tells the client to re-read (see broadcast.js).
    preview = "ข้อความใหม่ล่าสุด";
    act(() =>
      fakeSocket._trigger("conversation:activity", {
        conversationId: "conv-live",
        messageId: "m-1",
        senderId: "seller-9",
      }),
    );

    expect(await screen.findByText("ข้อความใหม่ล่าสุด")).toBeInTheDocument();
  });
});
