import { renderHook, act } from "@testing-library/react";
import { mergeMessages, useSocketResync } from "./messageSync";

describe("mergeMessages", () => {
  it("orders by createdAt like the server, not by id", () => {
    // Idempotency-keyed ids are hashes, so their string order is arbitrary.
    const older = { id: "ffff", createdAt: "2026-10-14T10:00:00.000Z" };
    const newer = { id: "0000", createdAt: "2026-10-14T10:00:01.000Z" };
    expect(mergeMessages([newer], [older]).map((m) => m.id)).toEqual([
      "ffff",
      "0000",
    ]);
  });

  it("replaces an existing message with the incoming copy and breaks ties by id", () => {
    const at = "2026-10-14T10:00:00.000Z";
    const merged = mergeMessages(
      [{ id: "b", createdAt: at, body: "old" }],
      [
        { id: "b", createdAt: at, body: "new" },
        { id: "a", createdAt: at },
      ],
    );
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
    expect(merged[1].body).toBe("new");
  });
});

describe("useSocketResync", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(initial) {
    const resync = jest.fn();
    const hook = renderHook((props) => useSocketResync(props), {
      initialProps: { intervalMs: 1000, resync, ...initial },
    });
    return { resync, ...hook };
  }

  it("polls while the socket is down", () => {
    const { resync } = setup({ active: true, live: false });
    act(() => jest.advanceTimersByTime(3000));
    expect(resync).toHaveBeenCalledTimes(3);
  });

  it("does not poll while live", () => {
    const { resync } = setup({ active: true, live: true });
    act(() => jest.advanceTimersByTime(5000));
    expect(resync).not.toHaveBeenCalled();
  });

  it("does nothing while inactive", () => {
    const { resync } = setup({ active: false, live: false });
    act(() => jest.advanceTimersByTime(5000));
    expect(resync).not.toHaveBeenCalled();
  });

  it("catches up once on reconnect, then stops polling", () => {
    const { resync, rerender } = setup({ active: true, live: true });
    rerender({ intervalMs: 1000, resync, active: true, live: false });
    act(() => jest.advanceTimersByTime(1000));
    expect(resync).toHaveBeenCalledTimes(1);

    rerender({ intervalMs: 1000, resync, active: true, live: true });
    expect(resync).toHaveBeenCalledTimes(2);
    act(() => jest.advanceTimersByTime(5000));
    expect(resync).toHaveBeenCalledTimes(2);
  });

  it("skips ticks while the tab is hidden", () => {
    const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { resync } = setup({ active: true, live: false });
    act(() => jest.advanceTimersByTime(3000));
    expect(resync).not.toHaveBeenCalled();
    hidden.mockRestore();
  });
});
