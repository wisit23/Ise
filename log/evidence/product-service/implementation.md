# Product Service ER implementation evidence

## Delivered

- `database/erdesign/Product Service/ข้อ1/ER_AMENDMENT.md`: records the approved Product amendments and corrected source facts (`Products.id`, `Marketing Audit Logs.id`, and campaign attributes are present in the draw.io); states that unspecified SQL/deployment details are not inferred.
- `backend/services/product-service/prisma/schema.prisma` plus `prisma/migrations/20261014000000_approved_er_review_media` through `20261014040000_approved_er_count_views`: normalized review media, product/category membership, one Condition FK, audit-backed moderation/auction metadata, attribution-derived campaign spend, legacy category-write compatibility, and normalized Count Views composite key.
- Product consumers and tests in `src/features`, `src/controllers`, `src/models`, and `test/`: API category compatibility, ordered public review media, audit metadata projections, budget SUM/deduplication/transaction handling, migration rehearsal, Count Views uniqueness.
- `test/er-api-output.tmp`, `er-check-output.tmp`, `er-deploy-output.tmp`, `er-unit-output.tmp`, and `er-upgrade-output.tmp` were removed after the new evidence below was recorded. No other service's temporary files were touched.

## Data preservation and deployment limits

The migration sequence preserves review URLs, review IDs via type-prefixed media IDs, order, and timestamps; retains legacy auction and moderation metadata as explicitly attributed audit state (not invented original authorship); and stops if the old campaign balance differs from immutable attribution totals or if Condition setup data is missing. `spent_budget` is derived from attribution SUM after cutover. The migration helper's guard remains in place; no `db push`, baseline resolution, or guard bypass was used.

The ER does not prescribe SQL types, nullability, defaults, index strategy, deletion/update policies, all event flows, or installation procedure. `viewer_id` in Count Views is a logical cross-service reference; Product holds the product FK. This work does not invent a Count Views HTTP/counter event path, since none was approved or present as a caller. No real DB or other service was accessed.

## Executed checks

On disposable container `ise-er-rehearsal-20261014` (`127.0.0.1:55439`), isolated database `product_luna_er`:

- `DATABASE_URL=postgresql://er_test:er_test@127.0.0.1:55439/product_luna_er npx prisma generate --schema prisma/schema.prisma` — passed.
- `ER_REHEARSAL_CONTAINER=ise-er-rehearsal-20261014 ER_REHEARSAL_DATABASE=product_luna_er node test/er-migration.rehearsal.js` — passed: unreviewed DB guard; unmatched-condition and mismatched-budget migration blockers; seeded populated legacy upgrade; preservation checks; second deploy; schema diff empty.
- `DATABASE_URL_PRODUCT=postgresql://er_test:er_test@127.0.0.1:55439/product_luna_er DATABASE_URL=postgresql://er_test:er_test@127.0.0.1:55439/product_luna_er node --test test/er-alignment.integration.test.js test/campaign-budget.integration.test.js test/moderation.integration.test.js` — 13 passed, 0 failed, 0 skipped. Exercises public HTTP category create/filter/edit and legacy primary category, duplicate membership, Condition FK, Count Views duplicate prevention, moderation idempotency/conflict/isolation/rollback, attribution duplicate/concurrency/rollback and exact SUM, auction audit-state preservation, and review media order through API.
- `DATABASE_URL=postgresql://er_test:er_test@127.0.0.1:55439/product_luna_er npx prisma validate --schema prisma/schema.prisma` — passed.

## Initial regression failure (repaired by parent)

`node --test src/features/reviews/reviewMedia.test.js src/features/catalog/catalog.contract.test.js src/features/auctions/auctionService.test.js src/features/campaigns/campaignMetrics.test.js` — 90 passed, 23 failed, 0 skipped (113 total). Failures cluster in the existing auction service unit suite: its transaction/client mocks do not implement the new `marketingAuditLog.findFirst`/`auctionItem.findFirst` projection behavior used by `auctionAuditState.js`, causing TypeErrors. This is a measured Product regression-test failure, not a pass; fix the affected mock setup and rerun before treating the entire Product regression suite as green. Other independent checks in that command (review media, catalog contracts, campaign metrics) passed.

## Parent continuation verification

Luna follow-up r4 updated two shared fixtures but returned before completing all test-specific mocks. Parent reproduced 12 remaining failures (94 pass), added a stateful in-memory audit projection helper to the existing transaction fixtures, and retained all lifecycle/permission/idempotency assertions. Cancellation now explicitly asserts one command audit plus all three required state snapshots and their actor/reason/time values; snapshots were not silently discarded to force the old audit count.

The four-file regression command above then passed **113/113, 0 failed, 0 skipped**, measured in `auction-regression-parent-phase3.txt`. Only test fixtures/assertions were changed for this repair; no production fallback or behavior relaxation was added. A full Product src/test regression is now running on independent cloned `reloop_ui_product_er`; results will be recorded separately.

The integration run emitted expected injected audit-trigger error logs for rollback cases and unavailable `auth-service` activity-client DNS warnings; assertions passed and those external effects were not part of this isolated Product check.
