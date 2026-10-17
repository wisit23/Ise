# Operational storage separated from audit logs — work map

## Agreement

User approved the complete proposed ER/storage refactor in this thread: “ok เเก้ให้เป็นเอาตามที่นายเสนอมาเลย”. Shipping uses a separate `shipping_address_snapshots` table with shipping_id as PK/FK, as explicitly confirmed.

Scope: Order/Product/Support only. Seven physical tables (including conversion of attribution view), six existing tables gaining 35 columns. Preserve API behavior, audit history, IDs, amounts, timestamps, queue/SLA policy, retries, privacy and cross-service ownership. No deployment, commit or application-database migration. No subagents. Unrelated existing changes in Chat attachments and Recommendation integration tests are preserved.

## Approved target

- Order: dispute_case gains all 17 workflow fields; orders gains product_title/campaign_code/pre_dispute_status; checkout_address_snapshots and shipping_address_snapshots each contain owner PK/FK plus seven address fields; order_attribution_jobs becomes a table preserving its 12 fields; order_product_sync_jobs stores event/order/product/action/reservation/target/actor/creation/completion.
- Product: auction_rounds gains title/categories/cancellation_reason/cancelled_at/cancelled_by; auction_items gains three cancellation fields; product_moderation_commands holds idempotency_key/action/product_id/payload_hash/result/created_at. Existing products moderation columns remain.
- Support: support_tickets gains priority_score/risk_report_count/chat_responder_id/classification_reason_codes/classification_policy_version/risk_lookup_available; ticket_sla_rounds holds ticket/cycle/start/history/policy and explicit policy snapshot/provenance; targets gain round FK with same-ticket/policy enforcement; ticket_chat_message_receipts holds message/ticket/conversation/author/role/visibility/message-time/known-receipt-time.
- Runtime reads operational tables. Old audit entries stay; logs continue to record actions. Remove log-backed workflow view, convert attribution view, and update ER ข้อ 1, amendments, schema documentation and new PDF exports.

## State and evidence

- Inspection: baseline working tree had only unrelated Chat attachment files and Product recommendation.integration.test.js modified. No AGENTS.md found by repository file search.
- No inherited earlier tests certify this refactor. New migration and consumer checks are required.
- Initial route: capture baseline, prepare isolated test database, implement Order, Product, Support in sequence; update ER/export and execute preservation/consumer tests.

## Delivered and verified

- Implemented all seven physical tables and all 35 additions across six existing tables. Independent comparison against the approved in-thread blueprint checked all 97 column definitions on 13 actual PostgreSQL tables, including names, types, precision and nullability. Existing tables contain exactly their old physical columns plus the approved additions; new tables contain no undeclared columns. Evidence: `operational-blueprint-check.txt`.
- New migrations are `20261016000000_operational_storage` in Order/Product/Support. Old migration files and audit rows are retained. Runtime current-state readers use physical columns/tables, not audit JSON. Assignment audit envelopes and the internal Chat API's original audit-event response remain compatible; Chat receipt deduplication is decided by the receipt table before fetching an audit for that response.
- Both address snapshot tables use owner ID as PK/FK with seven typed address fields. Their existing `addressSnapshot` API object remains compatible. Checkout totals are still computed from linked order amounts.
- Added current amendment pages to the three editable ER item 1 files; validated that original diagram pages' cells, attributes, text and geometry remain unchanged, and that new page IDs/edge references are valid. Original PDF archives were not changed.
- Created and visually inspected three new PDFs: [Order](../../output/pdf/order-operational-storage-er.pdf), [Product](../../output/pdf/product-operational-storage-er.pdf), [Support](../../output/pdf/support-operational-storage-er.pdf). The generator also verifies every exported table/field is present in PDF text. Current storage dictionary: [database/operational-storage.md](../../database/operational-storage.md).

### Measured checks

| Check | Result | Evidence |
| --- | --- | --- |
| Selected pre-change baseline | 136 passed, 0 failed | `operational-storage-baseline.txt` |
| Order full unit suite | 105 passed, 0 failed, 0 skipped | `operational-order-unit.txt` |
| Product full unit suite | 260 passed, 0 failed, 0 skipped | `operational-product-unit.txt` |
| Support full unit suite | 59 passed, 0 failed, 0 skipped | `operational-support-unit.txt` |
| Order HTTP/API consumers and >50-case queue | 5 passed, 0 failed, 0 skipped | `operational-order-consumers.txt` |
| Product moderation / auction / BullMQ consumers | 23 passed, 0 failed, 0 skipped | `operational-product-consumers.txt` |
| Support queue / SLA / reopen / Chat metadata privacy | 8 passed, 0 failed, 0 skipped | `operational-support-consumers.txt` |
| Real Order -> Product HTTP attribution, retries/deduplication | 10 passed, 0 failed, 0 skipped | `operational-cross-service.txt` |
| Populated upgrades + blocked-cutover rollback | 4 passed, 0 failed, 0 skipped | `operational-storage-upgrade.txt` |
| Fresh migration deployment | All three passed; final Product default verified on a fresh database | `operational-product-fresh.txt` plus recorded CLI execution |
| Prisma schema diff | Empty for all three | `operational-{order,product,support}-schema-diff.txt` |
| ESLint on changed JS and new integration test | Passed | `operational-lint.txt` |
| git diff --check | Passed, only Git line-ending notices | `operational-diff-check.txt` |

Final scoped suites total **474 passed, 0 failed, 0 skipped** (424 unit + 46 consumer integration + 4 upgrade/guard). This is not a claim that the whole monorepo/E2E suite ran. The intermediate `operational-storage-focused.txt` failures were fixture mismatches and are superseded by the passing full unit suites above.

### Environment and limits

All PostgreSQL migrations and consumer checks targeted task-owned databases in `ise-operational-rehearsal-20261014` at localhost:55441. Final BullMQ verification used task-owned `ise-operational-redis-20261014` at localhost:55442. Source fixtures with missing workflow or incompatible address/round data block cutover instead of inventing values; the blocked workflow rehearsal verifies both the failed migration and unchanged application rows/DDL. Prisma 5 may wrap the guard message in a transaction-aborted error, so the test checks preservation rather than relying on that wrapper's text.

The initial auction verification used that existing test's default local Redis endpoint and the delayed-worker step timed out; it was corrected to the owned Redis and rerun (23/23 passed). No pre-run application Redis baseline was captured, so this work does not certify the earlier application's Redis queue history; a subsequent read-only inspection found no failed BullMQ queue keys. Existing application PostgreSQL databases were not migrated or reset. No application service was rebuilt/restarted, no deployment/commit was performed, and unrelated Chat attachment/Recommendation edits were preserved.

Deploying this refactor requires stopping old writers before the migration and starting only the new runtime afterward, including regenerating each service's Prisma client. New migrations lock source tables during backfill and compare/copy recorded state; retaining an old writer after cutover is unsupported. Deployment to the application's configured database remains outside this authorization.

Task-owned PostgreSQL and Redis containers have been stopped, retaining their disposable databases for inspection/rehearsal; see `operational-rehearsal-stopped.txt`. Original application containers were not stopped. Intermediate PDF preview images are cleaned after visual QA; final PDFs and their reproducible generator remain.

Next: no implementation or verification remains in the approved source/artifact scope. Hand back the changes and evidence for review; application deployment is separate.

## Application migration authorization — 2026-10-14

User explicitly requested “migration และ test ให้ด้วย”. This extends the existing approval to migration of the configured local application databases and rebuilding/restarting Order/Product/Support. The earlier deployment exclusion is superseded for these local services only.

Private backups and deployment tooling are retained under ignored `.deploy-state/operational-20261014/`; they contain real database data and are not committed. Current targets are `reloop_order`, `reloop_product`, and `reloop_support` in the existing local PostgreSQL container. Full custom-format backups were restored into three separate `operational_live_rehearsal_*_20261014` databases. All three rehearsals applied the new migration and compared counts and sorted full-row fingerprints using every original column of every original application table: unchanged. This includes audit history. Migration guards additionally compare operational backfill sources against the new representations.

Next: wait for rebuilt images, stop old writers, take final backups, deploy migrations, recreate only the three services, and verify the new runtime and schema.

### Application migration completed

- Built all three Docker images and independently checked that their generated Prisma clients contain the new models before stopping writers. The PowerShell build wrapper returned exit 1 despite Docker reporting all three builds complete; verified the resulting images directly instead of treating the wrapper as proof of success. No application cutover occurred until all image checks passed.
- Stopped only Order/Product/Support, captured final custom-format backups, and applied `20261016000000_operational_storage` to each configured application database. All three applied successfully. Every original column of every original application row matched its pre-migration count and fingerprint: Order 14 tables / 16 rows, Product 20 / 271, Support 13 / 37, totaling 47 original tables / 324 rows. Audit history remains intact. Backups and original image IDs remain in the ignored deployment directory.
- Recreated only these three services with `docker compose up -d --no-deps --no-build`; all are healthy. Auth/Chat/Gateway/Frontend were not rebuilt. New service Prisma clients were generated during image builds.
- Runtime checks inside the deployed containers passed 28/28: health, successful migration ledger, native operational table queries, all existing Order API-shape and internal HTTP reads, dispute/ticket metrics/queues/agent dashboards, Product feed and auction round HTTP consumers. Five additional Gateway HTTP checks passed, covering health, feed, auction browsing/current round, and Support help categories. Runtime verification is read-only. The initial smoke script used two incorrect delegate names; corrected the verification script to the schema's `attributionJob` / `productSyncJob` delegates and reran all runtime checks successfully. No application code fix was needed.
- Prisma migration diff against each live database is empty. Evidence: `operational-deploy-{order,product,support}-schema-diff.txt`. All three live migration ledgers confirm the new migration is successfully finished.
- Reran the entire previously scoped verification set against owned PostgreSQL on port 55441 and Redis on 55442: 424 unit + 46 consumer integration + 4 populated-upgrade/rollback tests = **474 passed, 0 failed, 0 skipped**. Evidence: `operational-deploy-*-unit.txt`, `operational-deploy-*-consumers.txt`, `operational-deploy-upgrade.txt`. No destructive test fixtures ran against application databases.
- Post-deployment API checks add 33 passing checks to those 474 automated tests. These are scoped backend checks, not a full browser/monorepo E2E claim. The current application has no Support tickets, auction rows, or address snapshots; populated fixture rehearsals and consumer tests supply coverage for those behaviors.
- `git diff --check` passed. Task-owned PostgreSQL/Redis test containers are stopped again with data retained; deployed application services stay running. Backups reside at `.deploy-state/operational-20261014/cutover-{order,product,support}.dump`; these contain real application data and remain private/ignored.

Next: requested local migration and testing are complete. No production rollout or commit was requested.
