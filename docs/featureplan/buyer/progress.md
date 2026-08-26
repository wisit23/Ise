# Buyer Feature Progress

> Owner: วิศิษฏ์ เจียมสันต์ · Reviewer: เอกตระการ บุญญกาศ · Updated: 2026-08-10

**Status:** `BUY-002` reservation core verified; remaining Buyer plan acceptance incomplete

**Plan coverage:** Explicit trace rows cover `UR-01`–`UR-07` through FR, active/deferred NFR,
`WF-02`–`WF-07` and `BUY-001`–`BUY-005`

**Confirmed evidence:** `/products`, `/products/[id]`, `/cart`, `/orders`, Product/Order/Review
APIs and pagination exist. Product now owns an atomic 10-minute reservation with persisted
`reservedBy`, `reservationId`, `reservationExpiresAt`, token-guarded release/confirm, lazy expiry
and a cleanup worker. Order persists the reservation identity and compensates by releasing the
exact token when Order creation fails. Mock Payment attempts and the new tracking contract have
not passed this plan

**Current implementation evidence:** `/swipe` consumes public `GET /api/products/videos/feed`,
renders empty/error states, links to Product detail and is split into viewer/card components. Five
frontend tests pass and only the active video plays; persisted choose behavior remains absent

**Database acceptance:** Product reservation concurrency test passed against PostgreSQL with
`REQUIRE_INTEGRATION=1`: two simultaneous buyers produced exactly one `201` and one `409`;
expiry takeover, stale-token rejection and cleanup also passed. Checkout unit tests verify Order
reservation persistence and compensation. Cross-service restart acceptance remains pending

**Deferred:** Security hardening in `NFR-SP-*`/`NFR-CP-*`; functional ownership checks remain

**Blocker:** Phase 0 Product/Order state mapping, Swipe-to-Choose semantics and real-database test gate are not frozen

**Next action:** Add a process-restart/cross-service checkout integration test, then continue
`BUY-003` Mock Payment and explicit fulfillment states
