import { sendMessage } from "./chat";
import { apiFetch } from "./api";

jest.mock("./api", () => ({ apiFetch: jest.fn() }));

afterEach(() => { jest.useRealTimers(); jest.resetAllMocks(); });

test("waits for Retry-After and retries a rejected rate-limited message once", async () => {
  jest.useFakeTimers();
  apiFetch.mockRejectedValueOnce({ status: 429, retryAfterSeconds: 3 })
    .mockResolvedValueOnce({ id: "saved" });
  const pending = sendMessage("room", "hello", "token");
  await jest.advanceTimersByTimeAsync(2999);
  expect(apiFetch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toEqual({ id: "saved" });
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(apiFetch.mock.calls[1]).toEqual(apiFetch.mock.calls[0]);
});

test.each([500, 403, undefined])("does not retry ambiguous or forbidden failure %s", async (status) => {
  const error = Object.assign(new Error("failed"), { status });
  apiFetch.mockRejectedValueOnce(error);
  await expect(sendMessage("room", "hello", "token")).rejects.toBe(error);
  expect(apiFetch).toHaveBeenCalledTimes(1);
});

test("stops after a second rate-limit rejection", async () => {
  jest.useFakeTimers();
  const error = { status: 429, retryAfterSeconds: 1 };
  apiFetch.mockRejectedValue(error);
  const pending = expect(sendMessage("room", "hello", "token")).rejects.toBe(error);
  await jest.advanceTimersByTimeAsync(1000);
  await pending;
  expect(apiFetch).toHaveBeenCalledTimes(2);
});
