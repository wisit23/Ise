# Product Service review fixes (Sonnet 5.5 implementation)

Guides read: nes-mode SKILL.md, ref/harness.md, ref/senior-mentor.md, ref/wayfinder-unified.md, playbooks/bug-fix.md; log/loger/product-service/sonnet-review.md. No subagents, commits, .env or production change. Rehearsal DB `product_luna_er` on localhost:55439 only.

## Changes (product-service only)
1. `migrateReviewsFromReviewDb.js` — reads the legacy tables (`reviews`, `review_photos`, `review_videos`) with raw SQL; writes `review_media` with `image:`/`video:` ids (same as migration 20261014000000). Idempotent; conflict check compares review id and media id set. Exports `migrateReviews` and runs `main` only when executed directly. `REVIEW_MIGRATION.md` gets a paragraph on this.
2. `src/models/productModel.js` — category-only edit (`category` without `categories`) swaps the old primary for the new one and keeps other memberships; explicit `categories` replace the full set. `update()` and `updateBySeller()` take `SELECT ... FOR UPDATE` on the product row before reading or rewriting memberships (reading happens before `updateMany` overwrites the primary column).
3. `src/features/audit/marketingAuditRepository.js` — `listAuditLogs` and `findById` exclude `ER_STATE_IMPORT` / `ER_STATE_SNAPSHOT`, so totals/pagination of the Marketing audit API no longer include internal projection rows. `auctionAuditState.js` reads the table directly and is unaffected.
4. `src/features/campaigns/campaignMetrics.js` — `CAMPAIGN_END` `newState` now carries `spentBudget` (value from the SUM-derived `updated` row).

Not done (per instruction): FK/date changes for `reviews.product_id` / `date`; N+1 optimization.

## Tests added/changed
- `test/er-alignment.integration.test.js`: the old assertion that a `category`-only edit leaves `['ER Legacy']` encoded the bug; now expects `['ER Legacy','ER Secondary']`. Added explicit-replacement, concurrent `productModel.update` rewrite, primary-swap-keeps-others, `CAMPAIGN_END` `newState.spentBudget == 10.25`, and audit isolation (internal rows exist in DB, absent from list/total/findById; `action=ER_STATE_SNAPSHOT` → 400 at API, 0 at repository).
- `test/review-migration.integration.test.js` (new): builds a legacy-shaped scratch database on the rehearsal server (drops it afterwards), including a photo and a video with the same id; migrates, checks ids/types/urls/positions, rerun is a no-op (0 migrated, 2 existing), changed source aborts with `Conflicting review`. Guarded to localhost:55439 `product_luna_er`/`product_full_luna_er`.

## Evidence (all executed)
- Focused: `review-fixes-focused.txt` — 7 tests, 7 pass, 0 fail, 0 skip.
- Before-fix proof (fixes temporarily reverted, then restored): audit filter removed + `newState` reverted + category preservation removed → 3 tests failed (category, attribution, auction/audit). Lock removed alone → `Unique constraint failed on (product_id, category_id)` in 3/3 runs.
- Full: `review-fixes-full.txt` — `node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit --test-reporter=spec 'test/**/*.test.js' 'src/**/*.test.js'` with `REDIS_URL=redis://127.0.0.1:55440/1`, `REQUIRE_INTEGRATION=1`: **317 tests, 317 pass, 0 fail, 0 skipped** (316 + 1 new migration test).
- ESLint on changed JS files: exit 0.

## Environment note
First full run used Redis DB 0 and failed `Step 8: Real BullMQ delayed worker` (315/317). Cause shown by the job state: `failed — ไม่พบข้อมูลรายการประมูลที่ระบุ`. A product-service server (PID 15924, `node backend/services/product-service/src/server.js`, started 18:34) shares Redis 55440 and its BullMQ worker consumed the test's `auction-close` job against its own database. That process is not mine and was left running. Isolating the suite on Redis DB index 1 gave the green run. If the parent runs the suite on DB 0 while that server is up, Step 8 will fail again.
