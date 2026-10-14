// Keep auth feedback in English even when a shared API returns Thai copy.
export function authError(error) {
  if (
    error.code === "ACCOUNT_SUSPENDED" ||
    /ถูกระงับ/.test(error.message || "")
  ) {
    return "This account has been suspended. Please contact support.";
  }
  if (error.status === 429) return "Too many attempts. Please try again later.";
  if (error.status >= 500)
    return "The service is temporarily unavailable. Please try again.";
  if (/อีเมลหรือรหัสผ่านไม่ถูกต้อง/.test(error.message || "")) {
    return "Incorrect email or password.";
  }
  if (error.message && !/[\u0E00-\u0E7F]/.test(error.message))
    return error.message;
  return "Unable to continue. Please check your details and try again.";
}
