import {
  formatReferenceCode,
  matchesReference,
  normalizeReferenceCode,
  rememberReferenceCodes,
  formatReferenceText,
  REFERENCE_UNAVAILABLE,
} from "./referenceCodes";
import { formatOrderId } from "./orders";

const referenceCode = "ORD-7K3M-9X2R-4T6W";
test("show persisted codes, keep full legacy IDs, and never invent an order number", () => {
  expect(formatOrderId({ id: "legacy-uuid", referenceCode })).toBe(
    referenceCode,
  );
  expect(formatOrderId("auction-old-order-identifier")).toBe(
    "auction-old-order-identifier",
  );
  expect(formatReferenceCode({ id: "full-old-id" })).toBe("full-old-id");
  expect(formatReferenceCode(null)).toBe("");
});

test("cross-service companion codes and historical text use persisted references without modifying action IDs", () => {
  const id = "80b9f696-6fef-49d7-8047-4f7647d45dde";
  const reviewId = "90b9f696-6fef-49d7-8047-4f7647d45dde";
  const payload = { requesterId: id, requesterReferenceCode: "USR-7K3M-9X2R-4T6W", reason: `[รายงานรีวิว #${reviewId}]`, displayReferences: { [reviewId]: "REV-7K3M-9X2R-4T6W" } };
  expect(rememberReferenceCodes(payload)).toBe(payload);
  expect(formatReferenceCode(id)).toBe(payload.requesterReferenceCode);
  expect(formatReferenceText(payload.reason)).toBe("[รายงานรีวิว #REV-7K3M-9X2R-4T6W]");
  expect(payload.requesterId).toBe(id);
  expect(payload.reason).toContain(reviewId);
  expect(formatReferenceCode("11b9f696-6fef-49d7-8047-4f7647d45dde")).toBe(REFERENCE_UNAVAILABLE);
});
test("search accepts lower case and omitted separators while preserving internal IDs", () => {
  expect(normalizeReferenceCode(" ord7k3m9x2r4t6w ")).toBe(referenceCode);
  expect(
    matchesReference({ id: "legacy-uuid", referenceCode }, "ord7k3m9x2r4t6w"),
  ).toBe(true);
  expect(
    matchesReference({ id: "legacy-uuid", referenceCode }, "legacy-uuid"),
  ).toBe(true);
  expect(normalizeReferenceCode("ORD-0000-OOOO-1111")).toBeNull();
  expect(normalizeReferenceCode("XYZ-7K3M-9X2R-4T6W")).toBeNull();
});
