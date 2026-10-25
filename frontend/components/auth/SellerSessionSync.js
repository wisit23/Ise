"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, refreshAccessToken } from "../../lib/api";
import {
  getAccessToken,
  getAccessTokenClaims,
  getCurrentRoles,
  isCustomerAccountRoles,
} from "../../lib/auth";
import useSellerLiveRefresh from "../../lib/useSellerLiveRefresh";

/** Keep the signed seller permissions current while KYC is being reviewed. */
export default function SellerSessionSync() {
  const [token, setToken] = useState(null);
  useEffect(() => {
    const sync = () => setToken(getAccessToken());
    sync();
    window.addEventListener("reloop:auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("reloop:auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const enabled = Boolean(token) && isCustomerAccountRoles(getCurrentRoles());
  const syncSellerSession = useCallback(async () => {
    const currentToken = getAccessToken();
    if (!currentToken || !isCustomerAccountRoles(getCurrentRoles())) return;
    const status = await apiFetch("/api/auth/kyc/mine");
    // Ignore a response belonging to a session that has since changed.
    if (getAccessToken() !== currentToken) return;
    const claims = getAccessTokenClaims();
    const kycStatus = status.kycStatus || "NONE";
    if (
      (claims?.kycStatus || "NONE") !== kycStatus ||
      (status.sellerProfile && !getCurrentRoles().includes("SELLER"))
    ) {
      await refreshAccessToken();
    }
  }, []);

  useEffect(() => {
    if (enabled) syncSellerSession().catch(() => {});
    // Token changes include login and a silent refresh after KYC changes.
  }, [token, enabled, syncSellerSession]);

  useSellerLiveRefresh(syncSellerSession, {
    enabled,
    events: ["notification:new"],
  });
  return null;
}
