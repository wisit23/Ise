# Marketing Feature Progress

> Owner: ศิวกร วรวัฒน์อมรชัย · Reviewer: อัสนัย เมืองรอด · Updated: 2026-08-26

**Status:** `MKT-005` (Auction) Core lifecycle + `UR-11` choose action implemented and verified
against real PostgreSQL; `MKT-001`–`MKT-004` (Campaign/Attribution/Segmentation/Content) still
not started

**Plan coverage:** Explicit trace rows cover `UR-08`–`UR-16` through FR, active/deferred NFR,
`WF-03`, `WF-11`, documented Workflow gaps and `MKT-001`–`MKT-005`

**Confirmed evidence (MKT-005 / UR-11):**

- `AuctionItem`/`Bid` persist in `reloop_product`; full lifecycle
  (`pending_approval → approved → scheduled → open → closed`) implemented in
  `backend/services/product-service/src/features/auctions/`
- Seller sets `startingPrice`/`bidIncrement` at submission (not Marketing); Marketing owns
  `scheduledStartAt`/`scheduledEndAt` and cancel; Admin owns approve/reject
  (Admin UI itself lives on a teammate's unmerged branch — approve/reject exercised via API only)
  in this round
- Bids are serialized per-auction with a Postgres advisory lock (`pg_advisory_xact_lock`) so
  concurrent bids can't both win a tie; idempotency key prevents duplicate bids on retry
- Auctions close at their exact `scheduledEndAt` via a BullMQ delayed job (Redis), not only when
  someone happens to visit the page afterward — verified an unscheduled/unvisited auction closed
  itself within ~100ms of its close time, checked directly in Postgres to rule out the read-time
  fallback
- Auction close automatically creates the winner's Order via an internal
  `order-service` call (`POST /internal/from-auction`) — see `MKT-DEC-007`
- `SwipeChoice` persists a buyer's swipe "choose" (bookmark), separate from bidding — see
  `MKT-DEC-006`; verified end-to-end through the actual `/swipe` UI, not just the API
- End-to-end flow (submit → approve → schedule → open → bid → close → order created) verified
  three ways: `node --test` unit suite (17 tests, mocked), live `curl` against the running
  Docker stack, and manually through the real browser UI (login → seller submits → admin
  approves via API → marketing schedules in `/marketing/auctions` → buyer bids in
  `/auctions/:id` → auction auto-closes → order confirmed in `reloop_order`)
- Frontend: `/marketing/auctions` (schedule/cancel, with checkbox multi-select + a shared
  schedule bar to apply one open/close window to several approved auctions at once),
  `/seller/auctions` (same product-creation form as `/sell` — photos/title/description/
  category/condition/size/location/tags — plus `startingPrice`/`bidIncrement`; submitting
  creates the Product and its auction in one action, not a picker over existing listings),
  `/auctions` + `/auctions/:id` (browse/bid), choose button added to `SwipeVideoCard`
- Fixed: `auctionRepository` was not including `product.photos`, so every auction card/detail
  page rendered with no image regardless of the product having photos — now included on
  create/findById/list/updateStatus

**Not yet done:** `MKT-001`–`MKT-004` (Campaign, Attribution dashboard, Segmentation, Content) —
no schema, routes, or UI exist for these; `/marketing` currently has only one working tab
(Auctions)

**Database acceptance:** `REQUIRE_INTEGRATION=1`-style verification for `MKT-005` ran manually
against the real `docker compose` Postgres instance (not mocked) for this round; no dedicated
`*.integration.test.js` file was added yet — the mocked `auctionService.test.js` covers
lifecycle/validation logic, live verification covered the database-backed path

**Deferred:** Production campaign authorization, privacy and push-notification security hardening
(unrelated to `MKT-005`, unchanged from prior round)

**Blocker:** `MKT-001`–`MKT-004` still need Phase 0 contract freeze before starting

**Next action:** Add a `REQUIRE_INTEGRATION=1` auction test file, then start `MKT-001` (Campaign
lifecycle) following the same test-first pattern used for `MKT-005`

**2026-08-26 update:** Consolidated `/marketing/layout.js` + `/marketing/auctions` into one
`/marketing/page.js` sidebar panel (same format as CS/Admin) and added a Dashboard overview
section — see `changelog.md`. Also confirmed end-to-end with the real Docker stack that the
Admin auction-approval fix (see `admin/changelog.md`) flows through correctly: an auction
approved by Admin shows up here as "approved, ready to schedule" immediately.
