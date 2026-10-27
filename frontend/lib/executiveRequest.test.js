import {
  executiveFetch,
  EXECUTIVE_REQUEST_TIMEOUT_MS,
} from "./executiveRequest";
import { fetchOverview } from "./executive";

describe("Executive request deadline", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => new Promise(() => {}));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("aborts a stalled request with a retryable timeout", async () => {
    const pending = executiveFetch("/api/auth/executive/reports", {
      token: "t",
    });
    const check = expect(pending).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    await jest.advanceTimersByTimeAsync(EXECUTIVE_REQUEST_TIMEOUT_MS);
    await check;
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("finishes the overview as unavailable when its providers never answer", async () => {
    const pending = fetchOverview(
      "today",
      "t",
      new Date("2026-10-25T05:00:00Z"),
    );
    await jest.advanceTimersByTimeAsync(EXECUTIVE_REQUEST_TIMEOUT_MS);
    expect(await pending).toMatchObject({
      order: null,
      auth: null,
      trend: null,
      rankings: null,
      orderStatus: null,
    });
  });
});
