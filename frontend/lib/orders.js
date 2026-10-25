// Display persisted reference codes; keep full legacy IDs until backfill completes.
// Same rule as order-service's shippingService (TRACKING_NUMBER_PATTERN).
const TRACKING_NUMBER_PATTERN = /^(?=.*[0-9])[A-Za-z0-9]{8,20}$/;
export const TRACKING_NUMBER_MESSAGE =
  "เลขพัสดุต้องยาว 8–20 ตัว มีตัวเลขอย่างน้อย 1 ตัว และใช้ได้เฉพาะตัวอักษรภาษาอังกฤษหรือตัวเลข";

export function isValidTrackingNumber(value) {
  return TRACKING_NUMBER_PATTERN.test(String(value ?? "").trim());
}

export { formatReferenceCode as formatOrderId } from "./referenceCodes";
