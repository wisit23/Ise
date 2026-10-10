import { render, screen, act, waitFor } from "@testing-library/react";
import ChatSocketProvider, {
  useChatSocket,
  useChatSocketEvent,
} from "./ChatSocketProvider";
import { connectSocket } from "../../lib/chat";
import { getAccessToken } from "../../lib/auth";

jest.mock("../../lib/chat", () => ({ connectSocket: jest.fn() }));
jest.mock("../../lib/auth", () => ({ getAccessToken: jest.fn() }));

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
    _listenerCount: (event) => handlers.get(event)?.size || 0,
  };
}

function Probe({ onActivity }) {
  const { socket, connected } = useChatSocket();
  useChatSocketEvent("conversation:activity", onActivity);
  return (
    <div>
      <span data-testid="connected">{String(connected)}</span>
      <span data-testid="has-socket">{String(Boolean(socket))}</span>
    </div>
  );
}

describe("ChatSocketProvider", () => {
  let fakeSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeSocket = createFakeSocket();
    connectSocket.mockReturnValue(fakeSocket);
  });

  it("does not open a socket at all for a guest (no token)", () => {
    getAccessToken.mockReturnValue(null);

    render(
      <ChatSocketProvider>
        <Probe onActivity={jest.fn()} />
      </ChatSocketProvider>,
    );

    expect(connectSocket).not.toHaveBeenCalled();
    expect(screen.getByTestId("has-socket")).toHaveTextContent("false");
    expect(screen.getByTestId("connected")).toHaveTextContent("false");
  });

  it("opens exactly ONE socket for the whole tree, however many consumers subscribe", async () => {
    getAccessToken.mockReturnValue("token-123");

    render(
      <ChatSocketProvider>
        <Probe onActivity={jest.fn()} />
        <Probe onActivity={jest.fn()} />
        <Probe onActivity={jest.fn()} />
      </ChatSocketProvider>,
    );

    // The entire point of hoisting the connection into a provider: three
    // subscribers must not mean three WebSocket connections.
    expect(connectSocket).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(fakeSocket._listenerCount("conversation:activity")).toBe(3),
    );
  });

  it("reports connected only after the socket actually connects, and false again on disconnect", async () => {
    getAccessToken.mockReturnValue("token-123");

    render(
      <ChatSocketProvider>
        <Probe onActivity={jest.fn()} />
      </ChatSocketProvider>,
    );

    // Not connected merely because a socket object exists — consumers rely
    // on this to decide whether to fall back to REST polling.
    expect(screen.getByTestId("connected")).toHaveTextContent("false");

    act(() => fakeSocket._trigger("connect"));
    await waitFor(() =>
      expect(screen.getByTestId("connected")).toHaveTextContent("true"),
    );

    act(() => fakeSocket._trigger("disconnect"));
    await waitFor(() =>
      expect(screen.getByTestId("connected")).toHaveTextContent("false"),
    );
  });

  it("treats connect_error as not-connected so consumers fall back rather than going stale", async () => {
    getAccessToken.mockReturnValue("token-123");

    render(
      <ChatSocketProvider>
        <Probe onActivity={jest.fn()} />
      </ChatSocketProvider>,
    );

    act(() => fakeSocket._trigger("connect"));
    await waitFor(() =>
      expect(screen.getByTestId("connected")).toHaveTextContent("true"),
    );

    act(() => fakeSocket._trigger("connect_error"));
    await waitFor(() =>
      expect(screen.getByTestId("connected")).toHaveTextContent("false"),
    );
  });

  it("delivers events to subscribers and unsubscribes them on unmount", async () => {
    getAccessToken.mockReturnValue("token-123");
    const onActivity = jest.fn();

    const { unmount } = render(
      <ChatSocketProvider>
        <Probe onActivity={onActivity} />
      </ChatSocketProvider>,
    );
    await waitFor(() =>
      expect(fakeSocket._listenerCount("conversation:activity")).toBe(1),
    );

    act(() => fakeSocket._trigger("conversation:activity", { c: 1 }));
    expect(onActivity).toHaveBeenCalledWith({ c: 1 });

    // A shared socket outlives any single page, so a handler that isn't
    // removed on unmount would accumulate one leak per navigation.
    unmount();
    expect(fakeSocket._listenerCount("conversation:activity")).toBe(0);
    expect(fakeSocket.close).toHaveBeenCalled();
  });
});
