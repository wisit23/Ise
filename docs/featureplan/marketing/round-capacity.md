# Auction round capacity — 2026-10-14

## Approved behavior

- Marketing supplies a positive integer `maxItems` when creating a new round.
- Successful submission reserves a slot immediately, including `pending_approval`.
- Rejected/cancelled items release their slot. Approval does not reserve a second
  slot. Closed items retain their slot; closing is not another submission window.
- Existing rounds retain NULL/unlimited capacity. No historical quota is invented.
- This change does not add editing of existing capacities, seller-specific quotas,
  pagination changes, or different bidding/schedule rules.

## Database and API

Migration `20261014010000_auction_round_capacity` adds nullable
`auction_rounds.max_items` with a positive-value CHECK constraint. No new table,
stored usage counter, data deletion or backfill. Applied locally after verifying
the preceding baseline and soft-close migration.

`POST /auctions/rounds` requires JSON numeric `maxItems` (1..2147483647).
The value is stored with the round and existing atomic creation audit snapshot.
Invalid/missing capacities return 400. Full-round submissions return 409 before
product creation/status changes or item insertion, inside the round transaction.

Both existing/new-product submission flows reuse the same round advisory lock.
Occupancy is counted from `auction_items` by `round_id`, excluding rejected and
cancelled statuses. State transitions for approve/reject compare their expected
status atomically so stale approval cannot revive a previously released slot.

Marketing current/history APIs include `maxItems` and, for limited rounds,
`submittedItemCount`. Counts are grouped/batched, not queried per row. Existing
`_count.auctions` retains its original total-history meaning. The Marketing create
form and current/history display show capacity and full/unlimited states; seller
submission is enforced authoritatively by Backend even if their page is stale.

## Verification and remaining acceptance

- Host Node v22.16.0; Product/Frontend Docker Node v22.23.3.
- Auction service, capacity/policy, and real PostgreSQL/Redis capacity/schedule
  integration: 131 passed, 0 failed/skipped. Tests cover both submission flows and
  mixed concurrent submissions for one remaining slot, rejection/cancellation,
  pending occupancy, no orphan products, legacy NULL and retained limits on edits.
- Marketing/RadioSelect/Marketing page/Product detail/edit: 10 suites, 163 tests
  passed. Create form posts numeric capacity and rejects invalid capacity; full
  display and old unlimited rounds covered.
- Existing Audit/Pagination integration: 16 passed, no skips. Run sequentially
  because their total-record baseline assertions otherwise overlap fixture writes.
- Existing auction integration: 22 passed, no skips, with Redis DB 15 isolated
  from the live worker. Original test rewrites Docker hostnames to localhost;
  runtime test-only URL aliases were supplied, without changing app configuration.
- Targeted lint exited 0 using project config and tools installed only under
  container `/tmp/reloop-capacity-tools`. No dependency/config changes.
- Final Product/Frontend images rebuilt and restarted; core 131 Backend and 163
  Frontend tests rechecked against those images. `git diff --check` passed.
- Product database counts after fixture cleanup match the pre-migration baseline:
  1 round, 0 auction items, 16 products; the existing round remains unlimited.
- Browser visual/save acceptance: verified after the user opened a fresh localhost
  tab. Created one exact disposable E2E round with capacity 1 through the real form;
  capacity 0 was rejected by native validation. Real submission of a pending item
  produced 1/1 + full labels in current and history displays. Browser rejection
  returned both displays to 0/1 without navigation after fixing a stale count.
- That fix refreshes round data on successful item rejection/cancellation while
  retaining round pagination state. Added a parent-component regression for
  immediate capacity refresh. No Backend or schema changes in this acceptance run.
- Checked form and table width at CSS viewports 1024x768, 1366x768, 1440x900 and
  1920x1080: form/main/table scroll widths matched client widths. Temporary viewport
  override was reset. Date controls were entered with keyboard events, not DOM-only
  value assignment. Screenshots show full and released capacity states.
- Deleted only this Browser fixture's round, product, two item attempts and audits.
  Test helper: `test/round-capacity.browser-fixture.js`. No existing records removed.
- Full-project final regression and ER diagram update remain separate pending work.

No commit/push. Existing Working Tree edits preserved.
