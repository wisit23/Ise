# Buyer Feature Progress

> Owner: วิศิษฏ์ เจียมสันต์ · Reviewer: เอกตระการ บุญญกาศ · Updated: 2026-09-05

**Status:** `BUY-001` and `BUY-002` verified locally with PostgreSQL; overall Buyer acceptance remains open

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

**BUY-001 database acceptance:** Verified with an isolated disposable `postgres:16-alpine`
container on `localhost:55432`. After mounting `infra/postgres/init-databases.sql`, applying the
Product schema with `npx prisma db push --schema backend/services/product-service/prisma/schema.prisma`
and seeding with `node backend/services/product-service/prisma/seed.js`,
`REQUIRE_INTEGRATION=1 node --test backend/services/product-service/test/catalog.integration.test.js`
passed 1/1. The container was removed automatically after the run.

**Deferred:** Security hardening in `NFR-SP-*`/`NFR-CP-*`; functional ownership checks remain

**BUY-001 evidence:** Catalog search now applies AND filters for category, style (persisted tags), brand, size, condition and price range through one PostgreSQL query builder. Catalog contract tests 3/3, forced PostgreSQL integration 1/1, frontend BUY-001 Jest tests 2/2 and lint pass. This verifies BUY-001 locally only; it does not claim broader Buyer completion.

**Blocker:** Overall Phase 0 and Buyer acceptance remain open: `BUY-003`–`BUY-005`,
Swipe-to-Choose semantics, Mock Payment/fulfillment states and their database gates are not complete

**Next action:** Reviewer checks the local `BUY-001` and `BUY-002` evidence and schema contracts. No
broader Buyer completion is claimed.
