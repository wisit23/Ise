export const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PREFIXES = new Set([
  "USR",
  "KYC",
  "RPT",
  "SCR",
  "BLK",
  "PRD",
  "CLP",
  "AUC",
  "RND",
  "BID",
  "CMP",
  "VCH",
  "ART",
  "REV",
  "BSK",
  "CHK",
  "ORD",
  "PAY",
  "SHP",
  "HLD",
  "DSP",
  "TKT",
  "HLP",
  "SLA",
  "CHT",
]);

export function normalizeReferenceCode(value) {
  if (typeof value !== "string") return null;
  const compact = value.trim().toUpperCase().replace(/-/g, "");
  if (
    !/^[A-Z]{3}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(compact) ||
    !PREFIXES.has(compact.slice(0, 3))
  )
    return null;
  return `${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7, 11)}-${compact.slice(11)}`;
}

// Response-scoped codes come only from the services that own these records.
// Keep a bounded memory cache; never persist identities in browser storage.
const references = new Map();
export const REFERENCE_UNAVAILABLE = "รหัสอ้างอิงไม่พร้อมใช้งาน";
const INTERNAL_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24})$/i;
export function rememberReferenceCodes(value) {
  if (!value || typeof value !== "object") return value;
  const remember = (id, code) => {
    if (!id || !normalizeReferenceCode(code)) return;
    if (references.size >= 10000) references.delete(references.keys().next().value);
    references.set(id, code);
  };
  if (value.id) remember(value.id, value.referenceCode);
  for (const [key, child] of Object.entries(value)) {
    if (key === "displayReferences" && child && typeof child === "object") {
      for (const [id, code] of Object.entries(child)) remember(id, code);
    } else if (key.endsWith("ReferenceCode")) {
      const base = key.slice(0, -13);
      remember(value[`${base}Id`] || value[base], child);
    } else if (typeof child === "object") rememberReferenceCodes(child);
  }
  return value;
}

export function formatReferenceCode(value) {
  if (!value) return "";
  if (typeof value === "string") return references.get(value) || (INTERNAL_ID.test(value) ? REFERENCE_UNAVAILABLE : value);
  return value.referenceCode || references.get(value.id) || value.ticketNumber || formatReferenceCode(value.id) || "";
}

export function formatReferenceText(value) {
  return String(value ?? "").replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    (id) => references.get(id) || REFERENCE_UNAVAILABLE);
}

export function matchesReference(value, query) {
  const needle = String(query || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "");
  return [
    typeof value === "object" ? value?.id : value,
    formatReferenceCode(value),
  ].some((candidate) =>
    String(candidate || "")
      .toUpperCase()
      .replace(/-/g, "")
      .includes(needle),
  );
}
