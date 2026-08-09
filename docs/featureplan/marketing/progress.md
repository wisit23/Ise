# Marketing Feature Progress

> Owner: ศิวกร วรวัฒน์อมรชัย · Reviewer: อัสนัย เมืองรอด · Updated: 2026-08-10

**Status:** Swipe baseline refactored and locally tested; Marketing plan acceptance incomplete

**Plan coverage:** Explicit trace rows cover `UR-08`–`UR-16` through FR, active/deferred NFR,
`WF-03`, `WF-11`, documented Workflow gaps and `MKT-001`–`MKT-005`

**Confirmed evidence:** Current source has no persisted Campaign, Promotion, Segment,
Attribution or Auction feature. Product-owned video feed now uses available-only filtering/trusted
seller identity and `/swipe` has focused tests, but no persisted choose action; this is still not
`UR-11` Marketing acceptance evidence

**Database acceptance:** Product/Order/Auth PostgreSQL tests are required; no new
`REQUIRE_INTEGRATION=1` Marketing test has run in this planning round

**Deferred:** Production campaign authorization, privacy and push-notification security hardening

**Blocker:** Phase 0 Campaign state/API ownership, Order attribution and Swipe-to-Choose semantics are not frozen

**Next action:** Review `MKT-001` and write the failing Campaign lifecycle persistence test
