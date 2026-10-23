import { act, renderHook } from "@testing-library/react";
import { useChatSocket } from "../components/chat/ChatSocketProvider";
import useSellerLiveRefresh from "./useSellerLiveRefresh";

jest.mock("../components/chat/ChatSocketProvider", () => ({
  useChatSocket: jest.fn(),
}));

describe("useSellerLiveRefresh", () => {
  let listeners;
  let socket;
  let connection;

  beforeEach(() => {
    jest.useFakeTimers();
    listeners = new Map();
    socket = {
      on: jest.fn((event, listener) => listeners.set(event, listener)),
      off: jest.fn((event, listener) => {
        if (listeners.get(event) === listener) listeners.delete(event);
      }),
    };
    connection = { socket, connected: false };
    useChatSocket.mockImplementation(() => connection);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("refreshes on live events, reconnect, and focus without leaving socket listeners behind", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(() =>
      useSellerLiveRefresh(refresh, { events: ["notification:new"] }),
    );

    await act(async () => {
      listeners.get("notification:new")?.({ type: "AUCTION" });
      jest.advanceTimersByTime(150);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    connection = { socket, connected: true };
    rerender();
    await act(async () => { jest.advanceTimersByTime(150); });
    expect(refresh).toHaveBeenCalledTimes(2);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      jest.advanceTimersByTime(150);
    });
    expect(refresh).toHaveBeenCalledTimes(3);

    unmount();
    expect(listeners.has("notification:new")).toBe(false);
  });
});
