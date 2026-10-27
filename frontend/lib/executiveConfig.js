// @ts-check

/** @param {string|undefined} raw @param {string} name @param {number} fallback @param {number} min @param {number} max */
function integerSetting(raw, name, fallback, min, max) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export const EXECUTIVE_SEARCH_DELAY_MS = integerSetting(
  process.env.NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS,
  "NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS",
  300,
  0,
  2000,
);
export const EXECUTIVE_REQUEST_TIMEOUT_MS = integerSetting(
  process.env.NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS,
  "NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS",
  15000,
  1000,
  60000,
);
export const EXECUTIVE_TIMEZONE =
  process.env.NEXT_PUBLIC_REPORT_TIMEZONE || "Asia/Bangkok";
try {
  new Intl.DateTimeFormat("en", { timeZone: EXECUTIVE_TIMEZONE });
} catch {
  throw new Error("NEXT_PUBLIC_REPORT_TIMEZONE must be a valid IANA time zone");
}
