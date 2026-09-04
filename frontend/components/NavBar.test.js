import { render, screen, act, waitFor } from "@testing-library/react";
import NavBar from "./NavBar";
import { getUnreadCount } from "../lib/chat";
import { getAccessToken, getStoredUser } from "../lib/auth";

jest.mock("../lib/api", () => ({
  apiFetch: jest.fn().mockResolvedValue({ total: 0 }),
  mediaUrl: (url) => url,
}));

jest.mock("../lib/catalog", () => ({
  fetchActiveCategories: jest.fn().mockResolvedValue([]),
}));

jest.mock("../lib/chat", () => ({ getUnreadCount: jest.fn() }));

jest.mock("../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
  clearSession: jest.fn(),
}));

// The badge reads the app-wide socket through the provider's hooks; the
// fake is injected at that seam so a pushed event can be fired by hand.
const mockSocketState = { socket: null, connected: false };

jest.mock("./chat/ChatSocketProvider", () => {
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
    close: jest.fn(),
    _trigger: (event, payload) => {
      for (const cb of handlers.get(event) || []) cb(payload);
    },
  };
}

describe("NavBar unread badge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketState.socket = null;
    mockSocketState.connected = false;
    getStoredUser.mockReturnValue({
      id: "buyer-1",
      firstName: "ผู้ซื้อ",
      role: "BUYER",
    });
    getAccessToken.mockReturnValue("token-123");
  });

  it("shows no badge when there is nothing unread", async () => {
    getUnreadCount.mockResolvedValue({ total: 0 });

    render(<NavBar />);

    const link = await screen.findByRole("link", { name: /^ข้อความ$/ });
    expect(link).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /ยังไม่อ่าน/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the unread total it loads on mount", async () => {
    getUnreadCount.mockResolvedValue({ total: 3 });

    render(<NavBar />);

    expect(
      await screen.findByRole("link", { name: /มี 3 รายการที่ยังไม่อ่าน/ }),
    ).toBeInTheDocument();
  });

  it("updates the badge live on a pushed activity event, without a reload", async () => {
    const fakeSocket = createFakeSocket();
    mockSocketState.socket = fakeSocket;
    mockSocketState.connected = true;
    getUnreadCount.mockResolvedValue({ total: 0 });

    render(<NavBar />);
    await screen.findByRole("link", { name: /^ข้อความ$/ });

    // A message arrives while the user is on some other page entirely.
    getUnreadCount.mockResolvedValue({ total: 1 });
    act(() =>
      fakeSocket._trigger("conversation:activity", {
        conversationId: "c-1",
        messageId: "m-1",
        senderId: "seller-1",
      }),
    );

    expect(
      await screen.findByRole("link", { name: /มี 1 รายการที่ยังไม่อ่าน/ }),
    ).toBeInTheDocument();
  });

  it("re-reads the total when the socket reconnects (it missed events while down)", async () => {
    const fakeSocket = createFakeSocket();
    mockSocketState.socket = fakeSocket;
    mockSocketState.connected = false;
    getUnreadCount.mockResolvedValue({ total: 0 });

    const { rerender } = render(<NavBar />);
    await screen.findByRole("link", { name: /^ข้อความ$/ });

    // Whatever arrived during the outage is only discoverable by asking
    // again — a reconnect is exactly when that has to happen.
    getUnreadCount.mockResolvedValue({ total: 5 });
    mockSocketState.connected = true;
    rerender(<NavBar />);

    expect(
      await screen.findByRole("link", { name: /มี 5 รายการที่ยังไม่อ่าน/ }),
    ).toBeInTheDocument();
  });

  it("never asks for an unread count when nobody is logged in", async () => {
    getAccessToken.mockReturnValue(null);
    getStoredUser.mockReturnValue(null);

    render(<NavBar />);

    await waitFor(() => expect(getUnreadCount).not.toHaveBeenCalled());
  });
});
