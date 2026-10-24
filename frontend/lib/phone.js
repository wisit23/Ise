// Mirrors auth-service's normalizePhone: 10 digits starting with 0, blank
// allowed. The forms strip anything but digits as the user types, so the
// pattern below only has to catch "too short" and "doesn't start with 0".
export const PHONE_MAX_LENGTH = 10;
export const PHONE_PATTERN = "0[0-9]{9}";
export const PHONE_HINT = "ตัวเลข 10 หลัก ขึ้นต้นด้วย 0";

export function phoneDigits(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, PHONE_MAX_LENGTH);
}
