# Auction round time editing — 2026-10-14

## Scope and rules

- Marketing-only `PATCH /auctions/rounds/:roundId` accepts the four round timestamps,
  `expectedUpdatedAt`, and a UUID `idempotencyKey` for one logical edit.
- Before submission starts, its start may move to a future instant. Once any milestone
  has passed it cannot change. Submission end may shorten or extend while still open;
  it may equal, but not exceed, auction start. Closed submission cannot reopen.
- Before auction starts its start/end can change. Once started only its future end
  can change. Ended/cancelled rounds and closed/cancelled/rejected items never reopen.
- Always enforce submission start < submission end <= auction start < auction end.
- Round locks reuse the existing round/item advisory-lock order used by cancellation
  and submission. Item times and the `AUCTION_ROUND_UPDATE` audit commit together.
- Optimistic `updatedAt` checking prevents overwriting another edit. A matching retry
  reuses the saved audit operation, does not revert a newer round, and does not re-audit.

## Approved schema change

`auction_items.soft_close_ends_at` (nullable timestamp) stores the absolute end granted
by the last anti-sniping bid. `scheduled_end_at` remains the effective close instant.
The item effective end is max(new round end, saved soft-close end). Existing rows remain
NULL: the migration does not invent historical soft-close timestamps. A legacy item
ending beyond its old round with no floor blocks an ambiguous shortening rather than
silently discarding that time; inspect such records before proceeding.

## Side effects

After commit, reschedule open/scheduled item jobs from the latest database values under
their item locks, not from stale retry data. The close path rechecks the deadline after
acquiring its lock. An already active old job gets a separate future close job.

Existing Chat AUCTION notification infrastructure is reused. Sellers with items in the
round are notified; bidders are notified for changed item schedules. Messages contain
old/new round dates and per-item effective closes (Asia/Bangkok). Deduplication keys use
the edit operation plus recipient. Chat writes go only through its internal API.

Failed side effects return warnings. The modal can resend the same operation without
duplicate audit/messages. This is explicit retry using the existing infrastructure,
not a new transactional delivery outbox or a guarantee of automatic recovery after
process termination between commit and side-effect delivery.

## Verification

Policy tests: `src/features/auctions/roundSchedulePolicy.test.js`.
PostgreSQL + Redis integration: `test/round-schedule.integration.test.js` (no skips;
requires both services). Chat HTTP calls in this test are mocked and are not a live
Chat end-to-end acceptance. Modal component tests: `RoundEditModal.test.js`.
Browser final acceptance and full-project final regression are tracked separately.

No max-items-per-round feature, category changes, overlap restrictions, commit or push.

### Verified in this implementation run

- Host Node 22.16.0; Product/Frontend Docker Node 22.23.3 (node:22-alpine).
- Auction service + policy + PostgreSQL/Redis round-editing tests: 121 passed, 0 failed,
  0 skipped. HTTP authorization includes guest, Buyer, Admin and Marketing.
- Existing Marketing pagination and audit PostgreSQL integration: 16 passed, 0 skipped.
  `supertest@7.2.2` (existing root test dependency) installed only in container `/tmp`
  to run these suites; no repository dependency/lockfile changes.
- Latest Frontend Marketing, RadioSelect, Marketing page and Product detail/edit
  regression: 10 suites, 160 tests passed. RoundEditModal contributes 4 component
  tests. Existing error-path/React act warnings remain in the suite output.
- Targeted lint and git diff --check passed.
- Browser: opened/closed edit modal on one isolated upcoming-round fixture; inputs and
  save button fit 1024x768, 1366x768, 1440x900, 1920x1080 with no modal horizontal overflow.
  No real business round was saved through Browser. Temporary UI fixture removed by
  its exact ID after checking it had no associated items.
- Browser save acceptance: on an isolated two-item round, real bidding granted one
  item a soft-close floor. Extended the round from 10:57 to 11:17, then shortened
  to 11:00. Database and Redis deadlines showed the ordinary item closing at 11:00
  and the soft-close item at 11:02. An invalid earlier end was rejected without
  another audit mutation. Form submission reads named form controls and preserves
  unchanged seconds; the latest Frontend image was rebuilt and restarted.
- Live Chat delivery: verified through Chat service's own database that both
  isolated recipient rooms contained two SYSTEM notifications with the correct
  round and per-item deadlines. Retrying the second operation did not add another
  audit or message. This checks real delivery/persistence, not a buyer/seller Chat
  UI session (fixture users are not real Auth accounts).
- Removed only this fixture's round, two products/items, bids, audit entries, Redis
  jobs, four messages and two Chat rooms; verified Product fixture counts were zero.
  No existing business records were edited or removed.
- Latest Backend rerun: 121 passed, 0 failed, 0 skipped. Latest targeted Frontend
  lint exited 0 using the repository config in container /tmp; git diff check passed.
- Pending: full-project final regression/production build and updated ER diagram.
