import { act, renderHook } from "@testing-library/react";
import { io } from "socket.io-client";
import useCatalogLiveRefresh from "./useCatalogLiveRefresh";

jest.mock("socket.io-client", () => ({ io: jest.fn() }));

let listeners;
let socket;
function emit(event) {
  for (const listener of listeners.get(event) || []) listener();
}

beforeEach(() => {
  jest.useFakeTimers();
  listeners = new Map();
  socket = {
    connected: false,
    on: jest.fn((event, fn) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
    }),
    off: jest.fn((event, fn) => listeners.get(event)?.delete(fn)),
    close: jest.fn(),
  };
  io.mockReturnValue(socket);
});
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

it("shares a guest connection, debounces bursts and cleans up after the final subscriber", async () => {
  const first = jest.fn();
  const second = jest.fn();
  const a = renderHook(() => useCatalogLiveRefresh(first));
  const b = renderHook(() => useCatalogLiveRefresh(second));
  expect(io).toHaveBeenCalledTimes(1);
  expect(io).toHaveBeenCalledWith(expect.stringMatching(/\/catalog$/), expect.objectContaining({ path: "/api/chat/socket.io" }));
  await act(async () => {
    emit("catalog:changed");
    emit("catalog:changed");
    jest.advanceTimersByTime(150);
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  a.unmount();
  expect(socket.close).not.toHaveBeenCalled();
  b.unmount();
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(listeners.get("catalog:changed").size).toBe(0);
  expect(listeners.get("connect").size).toBe(0);
});

it("reconciles on reconnect, focus, visibility and the fallback timer", async () => {
  const refresh = jest.fn().mockResolvedValue();
  const { unmount } = renderHook(() => useCatalogLiveRefresh(refresh));
  await act(async () => { emit("connect"); jest.advanceTimersByTime(150); });
  await act(async () => { window.dispatchEvent(new Event("focus")); jest.advanceTimersByTime(150); });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); jest.advanceTimersByTime(150); });
  expect(refresh).toHaveBeenCalledTimes(3);
  await act(async () => { jest.advanceTimersByTime(30000); });
  expect(refresh).toHaveBeenCalledTimes(4);
  unmount();
});

it("queues a change during a refresh and skips hidden tabs", async () => {
  let finish;
  const refresh = jest.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { unmount } = renderHook(() => useCatalogLiveRefresh(refresh));
  await act(async () => { emit("catalog:changed"); jest.advanceTimersByTime(150); });
  await act(async () => { emit("catalog:changed"); jest.advanceTimersByTime(150); });
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(refresh).toHaveBeenCalledTimes(2);
  const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(async () => { emit("catalog:changed"); jest.advanceTimersByTime(150); });
  expect(refresh).toHaveBeenCalledTimes(2);
  visibility.mockRestore();
  unmount();
});
