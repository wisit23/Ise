import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import useCaseWorkspace from "./useCaseWorkspace";
import { apiFetch } from "../../../lib/api";
import config from "../../../lib/customerServiceConfig";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  window.history.replaceState(null, "", "?section=disputes");
});
afterEach(() => jest.useRealTimers());

it("receives returned work on polling and focus, and stops after unmount", async () => {
  let items = [];
  apiFetch.mockImplementation(() => Promise.resolve({ items, total: items.length, totalPages: 1 }));
  const { result, unmount } = renderHook(() => useCaseWorkspace("disputes", "token", "poll-cs"));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  items = [{ id: "returned", assignedTo: "poll-cs" }];
  await act(async () => jest.advanceTimersByTime(config.timing.dashboardRefreshMs));
  expect(result.current.queue.items).toEqual(items);
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
  unmount();
  await act(async () => jest.advanceTimersByTime(config.timing.dashboardRefreshMs * 2));
  fireEvent(window, new Event("focus"));
  expect(apiFetch).toHaveBeenCalledTimes(3);
});

it("pauses background refresh during uploads and resumes afterward", async () => {
  apiFetch.mockResolvedValue({ items: [], totalPages: 1 });
  const { rerender } = renderHook(({ paused }) => useCaseWorkspace("tickets", "token", "upload-cs", { pauseRefresh: paused }), { initialProps: { paused: false } });
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  rerender({ paused: true });
  await act(async () => jest.advanceTimersByTime(config.timing.dashboardRefreshMs));
  fireEvent(window, new Event("focus"));
  expect(apiFetch).toHaveBeenCalledTimes(1);
  rerender({ paused: false });
  await act(async () => jest.advanceTimersByTime(config.timing.dashboardRefreshMs));
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

it("a delayed background detail cannot replace the next selected case", async () => {
  window.history.replaceState(null, "", "?section=disputes&case=a");
  let reads = 0, finishOld;
  apiFetch.mockImplementation((url) => {
    if (url.includes("/queue?")) return Promise.resolve({ items: [], totalPages: 1 });
    if (url.endsWith("/a") && ++reads > 1) return new Promise((resolve) => { finishOld = resolve; });
    return Promise.resolve({ id: url.endsWith("/b") ? "b" : "a", version: 1 });
  });
  const { result } = renderHook(() => useCaseWorkspace("disputes", "token", "stale-cs"));
  await waitFor(() => expect(result.current.detail?.id).toBe("a"));
  await act(async () => jest.advanceTimersByTime(config.timing.dashboardRefreshMs));
  expect(finishOld).toEqual(expect.any(Function));
  act(() => result.current.update({ selectedId: "b" }));
  await waitFor(() => expect(result.current.detail?.id).toBe("b"));
  await act(async () => finishOld({ id: "a", version: 2 }));
  expect(result.current.detail.id).toBe("b");
});

it("resumes polling even when a mutation fails immediately", async () => {
  window.history.replaceState(null, "", "?section=disputes&case=a");
  apiFetch.mockImplementation((url, options) => {
    if (options?.method === "POST") return Promise.reject(new Error("offline"));
    return Promise.resolve(url.includes("/queue?") ? { items: [], totalPages: 1 } : { id: "a", version: 1 });
  });
  const { result } = renderHook(() => useCaseWorkspace("disputes", "token", "failed-mutation-cs"));
  await waitFor(() => expect(result.current.detail?.id).toBe("a"));
  await act(async () => {
    await expect(result.current.mutate("escalate", { reason: "review" })).rejects.toThrow("offline");
  });
  const queueCalls = () => apiFetch.mock.calls.filter(([url]) => url.includes("/queue?")).length;
  const before = queueCalls();
  await act(async () => jest.advanceTimersByTime(config.timing.dashboardRefreshMs));
  expect(queueCalls()).toBe(before + 1);
});
