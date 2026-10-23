# Product Service ER alignment — read-only code review (Sonnet 5.5)

Scope: `backend/services/product-service` modified and new source, migration and test files, `database/product-service.prisma`, and the Product ER amendment. No source was edited. No tests, migrations or database commands were run; every finding below comes from reading the code, the logs and the migration SQL.

## Guides actually read

- `C:\Users\nes\.pi\agent\skills\nes-mode\SKILL.md`
- `C:\Users\nes\.pi\agent\skills\nes-mode\ref\harness.md`
- `C:\Users\nes\.pi\agent\skills\nes-mode\ref\senior-mentor.md`

Not read (not needed for a read-only review): `ref/software-playbooks.md` (Review section), `playbooks/*`, `wayfinder-unified.md`. The parent code-review guidance was not available to me beyond the task text, so I applied Senior Mentor's "verify through actual consumers" rule and Harness's candid-judgment rule.

Also read: `log/loger/README.md`, `product-service/decisions.md`, `implementation.md`, `implementation-luna6.md`, `database/erdesign/Product Service/ข้อ1/ER_AMENDMENT.md`, the Product draw.io text, and the original audit excerpts for Reviews and Campaign Attributions.

## Findings (most severe first)

### 1. Missed caller: `migrateReviewsFromReviewDb.js` is broken by the review-media change (confirmed by reading)

`backend/services/product-service/migrateReviewsFromReviewDb.js:27,33,38-39,56-70` uses `include: { photos: true, videos: true }` on both the source and target Prisma clients, reads `review.photos`/`review.videos`, and creates reviews with `photos: { create }` and `videos: { create }`. The `Review` model now has only `mediaEntries`. `review_photos` and `review_videos` are dropped.

Result: the script throws a Prisma validation error on its first `findMany`, before it migrates anything. The `grep` for `reviewPhoto|review_photos` did not catch it because the script uses the relation names `photos`/`videos`. The implementation log does not mention this script.

- Impact: low to medium. It is a documented one-off script, but it is the only path described in `REVIEW_MIGRATION.md` for moving reviews from the old Review DB.
- Action needed: either update it to write `mediaEntries` (type-prefixed IDs, `IMAGE`/`VIDEO`), or record that the script is retired. It is out of ER scope to change it silently.

### 2. A legacy single-`category` edit silently deletes the other category memberships (confirmed by reading)

`src/models/productModel.js:categoryData` builds links only from `fields.category` plus `categories`. `update()` and `updateBySeller()` first run `productCategory.deleteMany({ productId })` whenever `categoryData` returns links.

Reproduction by reasoning:
1. Create a product with `categories: ["A","B"]`, `category: "A"`.
2. Seller edits the listing with `PATCH { category: "A" }`. A full-form edit that re-sends `category` does the same.
3. `categoryData` returns links for `["A"]` only. All memberships are deleted and re-created as `A`. Membership `B` is lost and `categories` in the response becomes `["A"]`.

This is a functional regression for the approved M:N relation, not only for the legacy caller. The frontend currently sends only `category`, so it would wipe memberships created through the API on every edit. `er-alignment.integration.test.js` covers category create/filter/edit and a legacy primary category. From the test file and log I could not tell whether it covers "edit `category` only after multi-category create". I did not run it.

Smaller related points:
- `productModel.update()` (used outside `updateBySeller`) does not lock the product row before `deleteMany` plus nested create. Two concurrent updates can both delete, then both insert the same `(product_id, category_id)` pair and get a primary-key violation (500). `updateBySeller` is safe because its first `updateMany` locks the row.
- `productController.create` still requires `category` (`validateCreateRequest`) before `categoryPatch` can default it from `categories[0]`, so a `categories`-only request is rejected with 400. This is acceptable as a compatibility rule, but it is not documented.

### 3. Marketing audit feed output changes, and one audit state loses a field (confirmed by reading)

Round title, round categories, and the cancellation fields now live only in `marketing_audit_logs`, as `ER_STATE_IMPORT` and `ER_STATE_SNAPSHOT` rows (`auctionAuditState.js`, migration `20261014020000`). These rows share the table that `marketingAuditRepository.list()` serves. Only `PRODUCT_MODERATION` is excluded.

- Existing databases get 2 new audit rows per existing auction round and per existing auction item at migration time (`LEGACY_IMPORT`). Every later round create or cancel adds another snapshot row.
- Totals and pagination of the existing `GET` marketing audit API therefore change, and Marketing users see `PRODUCT_SERVICE` and `LEGACY_IMPORT` entries. The task said to preserve existing API behavior. The integration suite passed, but the log does not show an assertion on list totals.
- `campaignMetrics.js` records `CAMPAIGN_END` with `newState: endedCampaign`, the raw `tx.campaign.update` row. That row no longer has `spentBudget`, so the audit state loses a field that the old code recorded. `previousState` (`updated`) does include it. Small, but it is an audit-history change.
- Retention risk: auction round titles and categories are now only recoverable from audit rows. No code deletes audit rows today, but any future retention job on `marketing_audit_logs` would destroy live round data. The amendment does not record this dependency.
- Moderation replay now outlives the product: the old command row cascade-deleted with the product, the new audit row does not. Replaying an old key after the product is deleted returns the old result instead of 404. Minor.

### 4. N+1 query pattern on public read paths (confirmed by reading; not measured)

- Every auction item or round read runs one extra `marketingAuditLog.findFirst` (`hydrateItem`, `hydrateRound`). `list()`, `listRounds()`, `findActiveAuctionRounds()` and `findUpcomingRounds()` call it once per row. Rounds with nested auctions run it once per round plus once per auction.
- `findActive*`/`findUpcomingRounds` also dropped the DB-level `cancelledAt: null` filter and filter in JS, so cancelled rounds are loaded and hydrated before being discarded.
- `withSpentBudget` runs one `aggregate` per campaign in `listAvailableCampaigns`, `listCampaigns`, and per voucher in `listUserVouchers`. `listAvailableCampaigns` is a public buyer path.
- Correctness is fine. Cost grows linearly with page size. No performance measurement exists for this change.

### 5. ER items not addressed or documented (gap, needs a decision rather than a fix)

From the Product draw.io text compared with `schema.prisma`:
- `Reviews.product_id(FK)` is marked FK in the ER. The schema and migrations have no relation or FK for `reviews.product_id` (nullable `String?`). `ER_AMENDMENT.md` and the implementation log do not mention it. An FK would need a delete policy, because `removeBySeller` deletes products.
- `Reviews` in the ER has `date`; the schema keeps `created_at`. I could not confirm whether the earlier M14 rename approval covers this name.
- `Campaign Attributions.campaign_id` has no FK relation. The ER text I extracted does not show an FK marker for it, so this is not a confirmed gap.

I did not read the draw.io edges (only node text), so these are flagged for the parent to check against the approved decisions.

### 6. Behavior widenings to confirm as intended (not defects)

- Voucher `applicableCategory` now matches any membership category (`campaignService.js` ~856), not only the primary. Auction round category filtering also uses "any match" (`isCategoryAllowedInRound`). Both can make more products eligible than before. Budget exposure follows eligibility.
- `categoryData` upserts every name in `categories` with no array-length or name-length limit, so one request can create many `categories` rows. The old single `ensureCategory` call had the same unbounded-name issue, but the array multiplies it.
- `submit()` in `auctionService.js` now builds `productData` before checking that the category exists, so a request with several invalid fields can return a different error first.

## Migrations: what I checked and found sound

- `20261014000000_approved_er_review_media`: IDs prefixed with `image:`/`video:`, so a photo/video UUID collision is preserved. The in-migration check compares count and row values before dropping the old tables. No defect found.
- `20261014010000_approved_er_product_relations`: creates missing category rows from `products.category`, blocks on unmatched `condition` values (does not invent conditions), adds the FK `ON UPDATE CASCADE ON DELETE RESTRICT`, and back-fills `product_categories`. All three write paths validate condition first (`productController.create/update`, `auctionService.submit`), so users should get 400 and not an FK 500. Seed upserts conditions before products.
- `20261014020000_approved_er_audit_and_budget`: blocks if `spent_budget` differs from the attribution SUM or if a moderation key collides with an existing audit key. It carries `payloadHash`, `result`, key, action and the original timestamp across, so replay and conflict behavior is preserved (`moderationService.js` reads `metadata.payloadHash`/`metadata.result`). It does not invent authorship (`LEGACY_IMPORT`, `originalActorKnown: false`). If it blocks, Prisma marks the migration failed and an operator must clear it with `migrate resolve` before retrying. That is standard, but there is no runbook entry for it.
- `20261014030000_approved_er_category_compatibility`: the deferred AFTER INSERT trigger keeps direct writers (seed) consistent. It does not cover `UPDATE products SET category` made outside `productModel`; I found no such writer in the repo, only the seed's `RELOOP_RESEED_DEMO` update path, which would not resync memberships.
- `20261014040000_approved_er_count_views`: composite PK `(viewer_id, product_id)`, FK to products with cascade. No `count >= 1` CHECK. No caller or event path exists, which the log states openly.
- `database/product-service.prisma` is identical to `backend/services/product-service/prisma/schema.prisma` after whitespace normalization (checked with `diff`).
- Docker uses PostgreSQL 16, so `gen_random_uuid()` and `CREATE OR REPLACE TRIGGER` are available.

## Campaign budget concurrency

Reading `campaignMetrics.js` and `campaignRepository.js`: attribution recording and voucher claim both take `SELECT ... FOR UPDATE` on the campaign row (`lockCampaign`) before inserting or summing. Lock order is consistent (campaign row first). Duplicate event handling still uses the pre-check, the in-transaction re-check and the `P2002` fallback. `spentBudget` as a Prisma `Decimal` compares correctly against the integer `budget` (`>=` uses the string value, which JS converts to a number); the old code also compared a `Decimal`. I found no defect. The log reports a concurrency test and the isolation of the row lock, but I did not run them.

## Test evidence assessment

- `luna6-full-product-34files-final.txt` shows `tests 316, pass 316, fail 0, skipped 0, cancelled 0`, 111.8 s. The repo has 34 `*.test.js` files under `test/` and `src/`, matching the "34 files" claim. The log header does not record the command; the command comes from `implementation-luna6.md`. The result is credible as recorded, and I did not reproduce it.
- It ran with `--test-concurrency=1 --test-force-exit`. `--test-force-exit` ends the process even if Prisma, Redis or timer handles are still open, so this run cannot show that tests shut down cleanly. I did not check for leaks. A run without the flag would be needed to claim clean exit.
- The log says a parallel all-file run had one catalog-metric failure (315/316). The retained file `luna6-full-product-34files.txt` (22 s) shows 316/316 pass, so the failing run is not preserved and the narrative and the files do not agree. The acceptance result therefore depends on serial execution against a shared database. The package has no `test` script, so the project has no recorded default command.
- `er-alignment.integration.test.js` self-skips unless the URL is `localhost`/`127.0.0.1:55439` with database `product_luna_er` or `product_full_luna_er`. A normal developer or CI run against another database reports it as skipped, not failed.
- `er-migration.rehearsal.js` is not a `*.test.js` file, so the 316 count does not include it. Its pass is claimed only in `implementation.md`; no output file for it is in the log directory.
- Unit-test edits in `auctionService.test.js`: the diff shows one assertion group rewritten (`auditLogs.length` 1 → 4 with split command/snapshot assertions) and new assertions added. I did not find silently removed lifecycle assertions in the lines I diffed (`assert` lines only, five files).

## Coverage and limits

Covered: all modified Product source files in `git status`, all five new migrations, `auctionAuditState.js`, `campaignBudget.js`, the two new test files, and `database/product-service.prisma`. I read the full diff for `productModel`, `productPayload`, `catalogQuery`, `reviewModel`, `moderationService`, `auction*`, `campaign*` and the audit repository. I searched the whole repo for stale references to removed tables and columns (`review_photos`, `review_videos`, `product_moderation_commands`, `spent_budget`, auction cancellation fields). Outside Product source and tests, I found none in code. I did not read test bodies line by line.

Not covered: nothing was executed, so there is no check of migration behavior on a populated production-like database beyond the rehearsal script as written. I did not read the draw.io edges, only node text. I did not check the frontend for use of the dropped fields beyond the `spentBudget` grep (frontend only reads the API field, whose shape is preserved).
