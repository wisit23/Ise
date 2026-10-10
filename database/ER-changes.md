> **Document status (2026-10-07): Updated for the latest Auth ER.** The auth-service section below is aligned with `ER_auth.drawio` page `QHJz9qzJK7pLv-PV6rBe`. Older feature notes elsewhere in this file remain historical evidence.

# RE-LOOP — Database change log (vs. `docs/erdatabase.png`)

This file tracks every deviation from the original ER diagram, with the reason for each change.
Rule (per project decision): **no ER table is ever dropped** — tables not yet used by a shipped
feature are still created, just left with no routes/UI until that phase lands.

Updated incrementally as each service's schema is built. Current status: `auth-service`
(`reloop_auth`), `product-service` (`reloop_product`), `order-service` (`reloop_order`), and
`review-service` (`reloop_review`) exist — see the `.prisma` files in each service's own
`prisma/` folder (this folder only holds `auth-service.prisma`/`product-service.prisma`/
`order-service.prisma` copies from when the project had a single shared schema location;
`review-service.prisma` lives only under `backend/services/review-service/prisma/`).
`chat-service` (`reloop_chat`) is the only remaining database with no schema.

## auth-service (`reloop_auth`)

| ER group    | Prisma model / table                                  | Alignment decision                                                                                                                                                |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Master      | `User` / `users`                                      | Exact table/column set from the latest ER. `role` remains for backward-compatible primary-role claims.                                                            |
| Master      | `BuyerProfile` / `buyer_profiles`                     | Added the ER fields `favorite_category` and `updated_at`.                                                                                                         |
| Master      | `SellerProfile` / `seller_profiles`                   | Uses the ER names, including `kyc_storage_key`; the old `kyc_document_url` migration column is renamed.                                                           |
| Master      | `UserAddress` / `user_addresses`                      | Added to migrations with the ER columns and a real FK to `users`.                                                                                                 |
| Setup       | `RoleDefinition` / `role`                             | Restored as a real setup table exactly as designed (`role_id`, `role_code`). Persisted codes are text so the table, not a duplicated Prisma enum, is the catalog. |
| Setup       | `UserRole` / `user_roles`                             | Database column renamed from `role` to ER field `role_code`; it references `role.role_code`.                                                                      |
| Transaction | `KycApplication` / `kyc_applications`                 | Uses `storage_key` and `file_type` from the ER; old `document_url` is migrated without discarding rows.                                                           |
| Transaction | `ShopChangeRequest` / `shop_change_requests`          | Parent now contains only request-level fields from the ER. Prisma `id` maps to physical `requests_id`.                                                            |
| Transaction | `ShopChangeRequestItem` / `shop_change_request_items` | Added exactly as designed. Existing direct shop/address/bank fields are migrated into item rows, then removed from the parent table.                              |
| Transaction | `Report` / `reports`                                  | Removed the non-ER `version` column. State transitions now claim rows using `status`.                                                                             |
| Transaction | `BulkActionRun` / `bulk_action_runs`                  | Removed non-ER `payload_hash`, `status`, `error`, and `updated_at`. Processing state uses the existing `results` JSON value.                                      |
| Transaction | `RefreshToken` / `refresh_tokens`                     | Retained because it is present in the latest ER and supports refresh/revocation.                                                                                  |
| Transaction | `LoginLog` / `login_logs`                             | Matches the latest ER including `session_id`, `logout_at`, and `user_agent`.                                                                                      |
| Transaction | `BuyerActivityLog` / `buyer_activity_logs`            | Matches the latest ER and remains append-only through the service API.                                                                                            |
| Transaction | `AdminAudit` / `admin_audits`                         | Matches the latest ER; `actor_id` references `users`.                                                                                                             |
| Transaction | `ExecutiveAuditLog` / `executive_audit_logs`          | Added to migrations with all fields and the user relationship shown in the ER.                                                                                    |

`admin_operations` is not part of the approved ER and is therefore not created. The alignment
migration drops it if it came from a previous local db-push. Cross-service product command
idempotency remains in the product owner service, while Auth keeps only the designed audit rows.

### Practical notes while keeping the ER unchanged

- `bulk_action_runs` has no separate processing-status column in the design, so the service writes
  `{ "state": "PROCESSING" }` into `results` while a batch is running and replaces it with the final
  summary afterward.
- `role` is seeded with the seven role codes used by the application. Adding a new row alone does not
  create permissions; `backend/shared/src/permissions.js` must also define the new role's behavior.
- When migrating old `shop_change_requests`, pending rows can snapshot `old_value` from the current
  seller profile. Already-decided legacy rows may have `old_value = null` because the former table did
  not preserve the pre-change value.
- Product remove/restore retries use the idempotency implementation in `product-service`, because the
  approved Auth ER has no table for durable cross-service operation state.
- Auth container startup runs `prisma/migrate.js`: an existing database created by the old `db push`
  flow is baselined against the five known legacy migrations, then `prisma migrate deploy` applies the
  ER-alignment migration. This transforms legacy shop-change rows before the old columns are removed.
- Verified on 2026-10-07 with two disposable PostgreSQL databases: the full six-migration chain and
  the legacy db-push baseline path both completed; database-to-schema diff reported no difference and
  the resulting database contained exactly the 16 approved tables.

### Cross-service rule

No foreign keys reach across service databases. Where a table needs to reference an entity owned by
another service (e.g. `reports.product_id`), it's stored as a plain string ID with no DB-level constraint;
integrity there is enforced by API calls, not by Postgres.

## product-service (`reloop_product`)

| ER entity     | Prisma model / table       | Change + reason                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product       | `Product` / `products`     | ER attributes are `Price, Seller_ID, Name, Brand, Type, Product_ID`. Kept `Price`/`Seller_ID`/`Product_ID` as-is (`Name`→`title`). Dropped `Brand` (unused, no field asked for it) and `Type` (superseded by the new `category` + `categories` table below). Added `description`, `condition`, `tags`, `location`, `size`, `status` — none are in the ER; required by the Release A listing/lifecycle requirements the ER doesn't encode. |
| Photo         | `Photo` / `photos`         | As ER (`Photo_ID`, `URL`, `Product_ID`). Added `position` (not in ER) so the seller's chosen image order / cover photo survives being split across `photos` and `videos` as two separate tables.                                                                                                                                                                                                                                          |
| Video         | `Video` / `videos`         | As ER (`Video_ID`, `Caption`, `CreatedAt`, `URL`, `Product_ID`). Added `position` for the same reason as `Photo`.                                                                                                                                                                                                                                                                                                                         |
| _(not in ER)_ | `Category` / `categories`  | New table. The ER's Product only has a free `Type` attribute, no dedicated entity. Added so the category list is real, queryable data instead of a hardcoded frontend array — `category` on `products` stays a plain string (not a hard FK) so sellers can still type a new one freely; unseen names are inserted here automatically.                                                                                                     |
| _(not in ER)_ | `Condition` / `conditions` | New table. The ER has no condition/quality concept at all. Values (`New`/`Like New`/`Good`/`Fair`) were a hardcoded array in both the controller and the frontend before this table existed; now validated against real rows.                                                                                                                                                                                                             |

Explicitly **not** built (out of Release A scope per the master plan, no shipped feature needs
them yet): `Swipe`, `Book_Mark`, `Auction`, `Campaign`, `Product_Campaign`, `Campaign_KPIs`,
`Evaluation_Criteria`.

## order-service (`reloop_order`)

| ER entity | Prisma model / table | Change + reason                                                                                                                                                                                                                                                                                                        |
| --------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order     | `Order` / `orders`   | ER's `Order`/`basket`/`Order_Items` are collapsed into a single `orders` row per product (this system sells one-off items, not multi-line carts) — `product_title`/`price` are snapshotted at purchase time rather than joined live, so a later price edit on the listing can't silently change a past order's amount. |

Explicitly **not** built yet: `basket` (as its own table — cart state is currently just
`orders` rows with `status='pending'`), `Payments`, `Shippings`, `Dispute`.

## review-service (`reloop_review`)

| ER entity     | Prisma model / table            | Change + reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(not in ER)_ | `Review` / `reviews`            | New table — the ER has no review/rating concept. Rates the **seller**, not the individual product: listings are one-off (a product sells exactly once and is gone), so the seller is the party the buyer keeps dealing with across purchases. `order_id` is unique — one review per completed order, and only after the order's status is `completed` (checked via a call to `order-service`). Added optional `product_id` for traceability back to the reviewed order's listing. |
| _(not in ER)_ | `ReviewPhoto` / `review_photos` | New table — allows buyers to attach photos to their review. Matches `product-service`'s `Photo` pattern with `url` and `position`. Cascade-deleted with the parent review.                                                                                                                                                                                                                                                                                                        |
| _(not in ER)_ | `ReviewVideo` / `review_videos` | New table — allows buyers to attach videos to their review. Matches `product-service`'s `Video` pattern with `url` and `position`. Cascade-deleted with the parent review.                                                                                                                                                                                                                                                                                                        |

Explicitly **not** built yet: `seller_stats` (aggregates are computed on read via
`reviewModel.summaryBySeller`/`listBySeller` instead of a materialized table), `notifications`,
review moderation/reports, seller replies.

## Still to schema (per the master plan, not built yet)

chat-service (message, Auto_messages + new: chat_rooms).
