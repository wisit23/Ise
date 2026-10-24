/**
 * Formats order ID for concise, clean display across the UI.
 * Prevents excessively long order numbers (e.g., 36-char UUIDs, sha256 hashes) from cluttering screens.
 */
// Same rule as order-service's shippingService (TRACKING_NUMBER_PATTERN).
const TRACKING_NUMBER_PATTERN = /^(?=.*[0-9])[A-Za-z0-9]{8,20}$/;
export const TRACKING_NUMBER_MESSAGE =
  "เลขพัสดุต้องยาว 8–20 ตัว มีตัวเลขอย่างน้อย 1 ตัว และใช้ได้เฉพาะตัวอักษรภาษาอังกฤษหรือตัวเลข";

export function isValidTrackingNumber(value) {
  return TRACKING_NUMBER_PATTERN.test(String(value ?? "").trim());
}

export function formatOrderId(id) {
  if (!id || typeof id !== "string") return "";
  if (id.startsWith("ORD-") || id.startsWith("AUC-")) {
    return id;
  }
  if (id.startsWith("auction-")) {
    return `AUC-${id.replace("auction-", "").slice(0, 8).toUpperCase()}`;
  }
  if (id.length > 14) {
    const clean = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return `ORD-${clean.slice(0, 8)}`;
  }
  return id;
}
