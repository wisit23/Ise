import {
  apiFetch,
  uploadFiles,
  uploadDisputeEvidence,
  submitKyc,
  fetchAuthedBlobUrl,
} from "./api";
import { saveSession, getAccessToken, getRefreshToken } from "./auth";

function response(status, data) {
  return { status, ok: status < 400, json: async () => data };
}

beforeEach(() => {
  // Avoid navigation in jsdom; the login form also uses these helpers.
  window.history.replaceState({}, "", "/login");
  saveSession({
    accessToken: "old-access",
    refreshToken: "old-refresh",
    user: { id: "buyer-1" },
  });
  global.fetch = jest.fn();
});

afterEach(() => jest.restoreAllMocks());

test.each([
  ["JSON", () => apiFetch("/api/orders/mine")],
  ["product upload", () => uploadFiles([])],
  [
    "evidence upload",
    () => uploadDisputeEvidence("case-1", new File(["x"], "evidence.png")),
  ],
  ["KYC upload", () => submitKyc({}, new File(["x"], "kyc.png"))],
  ["private document", () => fetchAuthedBlobUrl("/api/auth/kyc/doc/document")],
])(
  "%s clears a suspended session without trying to refresh",
  async (_name, run) => {
    fetch.mockResolvedValue(
      response(403, { code: "ACCOUNT_SUSPENDED", error: "บัญชีถูกระงับ" }),
    );
    await expect(run()).rejects.toThrow("บัญชีถูกระงับ");
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

test("suspension returned during refresh clears the old session", async () => {
  fetch
    .mockResolvedValueOnce(response(401, { error: "expired" }))
    .mockResolvedValueOnce(
      response(403, { code: "ACCOUNT_SUSPENDED", error: "บัญชีถูกระงับ" }),
    );
  await expect(apiFetch("/api/orders/mine")).rejects.toThrow("บัญชีถูกระงับ");
  expect(getAccessToken()).toBeNull();
});

test("ordinary permission denial does not log out the user", async () => {
  fetch.mockResolvedValue(response(403, { error: "Forbidden" }));
  await expect(apiFetch("/api/auth/admin/audit")).rejects.toThrow("Forbidden");
  expect(getAccessToken()).toBe("old-access");
});

test("Auth outage while refreshing keeps the session for retry", async () => {
  fetch
    .mockResolvedValueOnce(response(401, { error: "expired" }))
    .mockResolvedValueOnce(response(503, { error: "Auth unavailable" }));
  await expect(apiFetch("/api/orders/mine")).rejects.toThrow(
    "Auth unavailable",
  );
  expect(getRefreshToken()).toBe("old-refresh");
});

test("a valid legacy session refreshes and retries the request", async () => {
  fetch
    .mockResolvedValueOnce(response(401, { code: "SESSION_REVOKED" }))
    .mockResolvedValueOnce(
      response(200, { accessToken: "new-access-with-sid" }),
    )
    .mockResolvedValueOnce(response(200, { items: [] }));
  await expect(apiFetch("/api/orders/mine")).resolves.toEqual({ items: [] });
  expect(getAccessToken()).toBe("new-access-with-sid");
  expect(fetch.mock.calls[2][1].headers.Authorization).toBe(
    "Bearer new-access-with-sid",
  );
});
