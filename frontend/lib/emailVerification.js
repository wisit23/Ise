import { apiFetch } from "./api";
import { takeTokenFromUrl } from "./urlToken";

export function confirmEmail(token) {
  return apiFetch("/api/auth/email/verify", {
    method: "POST",
    body: { token },
  });
}

export function resendConfirmation(email) {
  return apiFetch("/api/auth/email/resend", {
    method: "POST",
    body: { email },
  });
}

/** Reads the confirmation token from the emailed link; see takeTokenFromUrl. */
export const takeConfirmationTokenFromUrl = takeTokenFromUrl;

export function isInvalidConfirmationError(error) {
  return error?.code === "VERIFICATION_TOKEN_INVALID";
}

export function isUnverifiedSignInError(error) {
  return error?.code === "EMAIL_NOT_VERIFIED";
}
