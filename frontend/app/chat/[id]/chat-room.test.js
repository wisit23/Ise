import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import ChatRoomPage from "./page";
import {
  getConversation,
  listMessages,
  sendMessage,
  markRead,
} from "../../../lib/chat";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

jest.mock(
  "../../../components/NavBar",
  () =>
    function MockNavBar() {
      return <nav aria-label="main navigation" />;
    },
);

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn().mockResolvedValue({ shopName: "ร้านทดสอบ" }),
  mediaUrl: (url) => url,
}));

jest.mock("../../../lib/chat", () => ({
  // Only the network-touching functions are faked. The pure helpers come
  // from the real module (requireActual) so a hand-rolled copy here can't
  // quietly drift from the implementation the app actually ships.
  ...jest.requireActual("../../../lib/chat"),
  getConversation: jest.fn(),
  listMessages: jest.fn(),
  sendMessage: jest.fn(),
  markRead: jest.fn(),
  connectSocket: jest.fn(),
}));

jest.mock("../../../lib/auth", () => ({
  getAccessToken: jest.fn(),
  getStoredUser: jest.fn(),
}));

// Mutable so each test can decide whether the app-wide socket is connected.
// The page reads this through the provider's hooks rather than creating a
// socket itself (see ChatSocketProvider), so the fake has to be injected
// here — mocking lib/chat's connectSocket alone would no longer reach it,
// and a version of this file that did exactly that passed VACUOUSLY: the
// "socket echo" it fired went to a socket the page was no longer listening
// to, so the race below was never actually exercised.
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

// A stable object, not a fresh literal per call — real useRouter() returns a
// memoized router, and this page's effects depend on `router`/`id` in their
// dependency arrays. An unstable mock reference makes those effects re-run
// every render and re-fetch, silently wiping any optimistically-added
// message (see teachme.md's CHAT-004 lesson — the same mistake, again).
const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "conv-1" }),
  useRouter: () => mockRouter,
}));

/** A fake Socket.IO client the test drives by hand — `emit("join", ...)`
 * auto-acks ok (mirroring a real successful join), and `_trigger` fires a
 * server-pushed event at whatever moment the test needs to reproduce a race
 * with the REST response. */
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
    _listenerCount: (event) => handlers.get(event)?.size || 0,
  };
}

const CONVERSATION = {
  id: "conv-1",
  status: "ACTIVE",
  participants: [
    { userId: "buyer-1", role: "BUYER", lastReadAt: null },
    {
      userId: "seller-1",
      role: "SELLER",
      lastReadAt: null,
      // chat-service resolves this server-side; the room header reads it off
      // the conversation rather than looking the userId up from the browser.
      displayName: "ร้านของสะสม",
    },
  ],
};

describe("ChatRoomPage — live delivery vs. REST response race", () => {
  let fakeSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    getAccessToken.mockReturnValue("token-123");
    getStoredUser.mockReturnValue({ id: "buyer-1", role: "BUYER" });
    getConversation.mockResolvedValue(CONVERSATION);
    listMessages.mockResolvedValue({ items: [], nextCursor: null });
    markRead.mockResolvedValue({});
    fakeSocket = createFakeSocket();
    mockSocketState.socket = fakeSocket;
    mockSocketState.connected = true;
  });

  it("shows the other side's role for this room under their name", async () => {
    sendMessage.mockResolvedValue({});
    render(<ChatRoomPage />);
    expect(await screen.findByText("ร้านของสะสม")).toBeInTheDocument();
    expect(screen.getByText("ร้านค้า")).toBeInTheDocument();
    // The badge describes the OTHER person, never the viewer's own side.
    expect(screen.queryByText("ผู้ซื้อ")).not.toBeInTheDocument();
  });

  it("subscribes to the shared socket's message:new (guards against the subscription silently going missing)", async () => {
    sendMessage.mockResolvedValue({});
    render(<ChatRoomPage />);
    await screen.findByLabelText("พิมพ์ข้อความ");
    // Without this the race test below would pass for the wrong reason —
    // firing an event nobody listens to trivially produces one bubble.
    expect(fakeSocket._listenerCount("message:new")).toBeGreaterThan(0);
  });

  it("joins the room on the shared socket rather than opening its own connection", async () => {
    sendMessage.mockResolvedValue({});
    render(<ChatRoomPage />);
    await screen.findByLabelText("พิมพ์ข้อความ");
    await waitFor(() =>
      expect(fakeSocket.emit).toHaveBeenCalledWith(
        "join",
        "conv-1",
        expect.any(Function),
      ),
    );
  });

  it("does not render the same message twice when the socket echo arrives before the REST response (the reported bug)", async () => {
    // The REST call is held open under test control, so the test can
    // deliver the socket's own echo of this exact message FIRST — exactly
    // the ordering a real WebSocket push racing an awaited fetch produces.
    let resolveSend;
    sendMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );

    render(<ChatRoomPage />);
    await screen.findByLabelText("พิมพ์ข้อความ");

    const composer = screen.getByLabelText("พิมพ์ข้อความ");
    fireEvent.change(composer, { target: { value: "สวัสดีครับ" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));

    const realMessage = {
      id: "real-msg-1",
      conversationId: "conv-1",
      senderId: "buyer-1",
      senderRole: "BUYER",
      type: "TEXT",
      body: "สวัสดีครับ",
      createdAt: new Date().toISOString(),
    };

    // The server's broadcast (which targets every participant INCLUDING
    // the sender — see backend broadcast.js) reaches this same client's
    // socket before the awaited sendMessage() promise below resolves.
    act(() => fakeSocket._trigger("message:new", realMessage));

    // Only now does the REST call the composer kicked off actually settle.
    await act(async () => {
      resolveSend(realMessage);
    });

    await waitFor(() => {
      const bubbles = screen.getAllByText("สวัสดีครับ");
      expect(bubbles).toHaveLength(1);
    });
  });

  it("still renders the message once when the REST response arrives first (no realtime race)", async () => {
    sendMessage.mockResolvedValue({
      id: "real-msg-2",
      conversationId: "conv-1",
      senderId: "buyer-1",
      senderRole: "BUYER",
      type: "TEXT",
      body: "ข้อความปกติ",
      createdAt: new Date().toISOString(),
    });

    render(<ChatRoomPage />);
    await screen.findByLabelText("พิมพ์ข้อความ");

    const composer = screen.getByLabelText("พิมพ์ข้อความ");
    fireEvent.change(composer, { target: { value: "ข้อความปกติ" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));

    await waitFor(() => {
      expect(screen.getAllByText("ข้อความปกติ")).toHaveLength(1);
    });
  });

  it("renders a message pushed for THIS conversation and ignores one for another", async () => {
    render(<ChatRoomPage />);
    await screen.findByLabelText("พิมพ์ข้อความ");

    act(() =>
      fakeSocket._trigger("message:new", {
        id: "m-other",
        conversationId: "some-other-conversation",
        senderId: "seller-1",
        senderRole: "SELLER",
        type: "TEXT",
        body: "ข้อความห้องอื่น",
        createdAt: new Date().toISOString(),
      }),
    );
    act(() =>
      fakeSocket._trigger("message:new", {
        id: "m-mine",
        conversationId: "conv-1",
        senderId: "seller-1",
        senderRole: "SELLER",
        type: "TEXT",
        body: "ข้อความห้องนี้",
        createdAt: new Date().toISOString(),
      }),
    );

    expect(await screen.findByText("ข้อความห้องนี้")).toBeInTheDocument();
    expect(screen.queryByText("ข้อความห้องอื่น")).not.toBeInTheDocument();
  });

  it("leaves the room on unmount so a shared socket doesn't keep receiving it", async () => {
    const { unmount } = render(<ChatRoomPage />);
    await screen.findByLabelText("พิมพ์ข้อความ");
    await waitFor(() =>
      expect(fakeSocket.emit).toHaveBeenCalledWith(
        "join",
        "conv-1",
        expect.any(Function),
      ),
    );

    unmount();
    expect(fakeSocket.emit).toHaveBeenCalledWith("leave", "conv-1");
  });
});
