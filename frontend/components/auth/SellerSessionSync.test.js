import { act, render, waitFor } from "@testing-library/react";
import SellerSessionSync from "./SellerSessionSync";
import { useChatSocket } from "../chat/ChatSocketProvider";
import { apiFetch } from "../../lib/api";
import {
  getAccessTokenClaims,
  getStoredUser,
  saveSession,
} from "../../lib/auth";

jest.mock("../chat/ChatSocketProvider", () => ({ useChatSocket: jest.fn() }));

function token(role, kycStatus) {
  return `header.${btoa(JSON.stringify({ sub: "buyer-1", role, roles: [role], kycStatus }))}.signature`;
}
function response(data, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}

let status;
let listeners;
beforeEach(() => {
  localStorage.clear();
  status = "PENDING";
  listeners = new Map();
  useChatSocket.mockReturnValue({
    connected: false,
    socket: {
      on: (name, listener) => listeners.set(name, listener),
      off: (name) => listeners.delete(name),
    },
  });
  saveSession({
    accessToken: token("BUYER", null),
    refreshToken: "refresh-token",
    user: { id: "buyer-1", role: "BUYER", firstName: "Buyer" },
  });
  global.fetch = jest.fn(async (url) => {
    if (url.endsWith("/api/auth/refresh")) {
      return response({ accessToken: token("SELLER", status) });
    }
    if (url.endsWith("/api/auth/kyc/mine")) {
      return response({
        kycStatus: status,
        sellerProfile: status === "NONE" ? null : {},
      });
    }
    return response({ ok: true });
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("an existing buyer session gains signed seller permissions without logging in again", async () => {
  status = "VERIFIED";
  render(<SellerSessionSync />);
  await waitFor(() =>
    expect(getAccessTokenClaims()).toMatchObject({
      role: "SELLER",
      kycStatus: "VERIFIED",
    }),
  );
  expect(getStoredUser()).toMatchObject({ role: "SELLER", firstName: "Buyer" });
  await apiFetch("/api/products/seller/mine");
  expect(fetch).toHaveBeenLastCalledWith(
    expect.stringContaining("/api/products/seller/mine"),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: `Bearer ${token("SELLER", "VERIFIED")}`,
      }),
    }),
  );
});

test("a KYC notification refreshes a pending session to verified", async () => {
  render(<SellerSessionSync />);
  await waitFor(() =>
    expect(getAccessTokenClaims()?.kycStatus).toBe("PENDING"),
  );
  status = "VERIFIED";
  await act(async () => {
    listeners.get("notification:new")?.({ metadata: { decision: "VERIFIED" } });
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  await waitFor(() =>
    expect(getAccessTokenClaims()?.kycStatus).toBe("VERIFIED"),
  );
});

test.each(["focus", "poll"])(
  "%s recovers a missed approval notification",
  async (trigger) => {
    jest.useFakeTimers();
    await act(async () => {
      render(<SellerSessionSync />);
    });
    expect(getAccessTokenClaims()?.kycStatus).toBe("PENDING");
    status = "VERIFIED";
    await act(async () => {
      if (trigger === "focus") window.dispatchEvent(new Event("focus"));
      jest.advanceTimersByTime(trigger === "focus" ? 150 : 30150);
    });
    expect(getAccessTokenClaims()?.kycStatus).toBe("VERIFIED");
  },
);

test("an unchanged buyer account does not repeatedly refresh its token", async () => {
  status = "NONE";
  render(<SellerSessionSync />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(
    fetch.mock.calls.some(([url]) => url.endsWith("/api/auth/refresh")),
  ).toBe(false);
});

test("staff accounts do not fetch customer KYC data", async () => {
  saveSession({
    accessToken: token("ADMIN", null),
    refreshToken: "refresh-token",
    user: { id: "buyer-1", role: "ADMIN" },
  });
  render(<SellerSessionSync />);
  expect(fetch).not.toHaveBeenCalled();
});

test("a temporary refresh failure preserves the pending session for a later retry", async () => {
  fetch.mockImplementation(async (url) =>
    url.endsWith("/api/auth/refresh")
      ? response({ error: "Auth unavailable" }, 503)
      : response({ kycStatus: "VERIFIED", sellerProfile: {} }),
  );
  render(<SellerSessionSync />);
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/refresh"),
      expect.any(Object),
    ),
  );
  expect(getAccessTokenClaims()?.role).toBe("BUYER");
  expect(getStoredUser()?.id).toBe("buyer-1");
});
