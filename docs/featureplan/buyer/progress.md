# Buyer Feature Progress

> Owner: วิศิษฏ์ เจียมสันต์ · Reviewer: เอกตระการ บุญญกาศ · Updated: 2026-08-10

**Status:** `BUY-002` verified locally with PostgreSQL; Buyer plan acceptance incomplete

**Plan coverage:** Explicit trace rows cover `UR-01`–`UR-07` through FR, active/deferred NFR,
`WF-02`–`WF-07` and `BUY-001`–`BUY-005`

**Confirmed evidence:** `BUY-002` now uses Product-side compare-and-set reservation with persisted
`reservationId`, `reservedBy` and 10-minute `reservationExpiresAt`. Order persists the matching
reservation, compensates a failed Order write and reuses the same Order on retry. Cart renders a
live countdown and prevents checkout after local expiry. Persisted Mock Payment attempts and the
new fulfillment tracking contract remain outside this completed slice

**Current implementation evidence:** `/swipe` consumes public `GET /api/products/videos/feed`,
renders empty/error states, links to Product detail and is split into viewer/card components. Five
frontend tests pass and only the active video plays; persisted choose behavior remains absent

**Database acceptance:** `REQUIRE_INTEGRATION=1` ran against isolated PostgreSQL 16 schemas for
Product and Order. The test proved one winner from two concurrent Buyers (`201/409`), retry without
duplicate Order, expired takeover, stale-release protection and startup expiry recovery. Backend
47/47, frontend 7/7, lint, secret scan and frontend production build passed

**Deferred:** Security hardening in `NFR-SP-*`/`NFR-CP-*`; functional ownership checks remain

**Blocker:** Overall Phase 0 and Buyer acceptance remain open: `BUY-001`, `BUY-003`–`BUY-005`,
Swipe-to-Choose semantics, Mock Payment/fulfillment states and their database gates are not complete

**Next action:** Reviewer checks `BUY-002` evidence and schema contract. Do not start another Buyer
task until that review; the planned implementation order resumes at `BUY-001`
