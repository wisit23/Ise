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

| ER entity     | Prisma model / table                        | Change + reason                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User          | `User` / `users`                            | Added `password_hash` (login requires it; ER has no auth field), `phone`. `f_name`/`l_name` kept as DB column names via `@map` to match the ER's `FName`/`LName`.                                                                                                                                                |
| Role          | `User.role` enum (`BUYER`/`SELLER`/`ADMIN`) | Collapsed the separate `Role` table into an enum column. A user has exactly one role in this system (upgrades BUYER→SELLER in place); a join table added no value for that shape. Revisit if multi-role-per-user is ever needed.                                                                                 |
| Buyer         | `BuyerProfile` / `buyer_profiles`           | Same fields as ER (style/size/brand preference). Not populated yet — filled by the Phase 2 style quiz.                                                                                                                                                                                                           |
| Seller        | `SellerProfile` / `seller_profiles`         | Same fields as ER (shop_name, id_card_number, bank_account) **plus** `kyc_status`, `kyc_document_url`, `verified_at` — required by workflow WF-01 (KYC state machine) which the ER doesn't encode. Table exists; KYC upload/approve endpoints are not built yet (out of scope for this pass).                    |
| Login_Log     | `LoginLog` / `login_logs`                   | As ER. Written on every successful login.                                                                                                                                                                                                                                                                        |
| Reports       | `Report` / `reports`                        | As ER, kept per the no-cut-tables rule. `reporterId` has a real FK to `User`; `targetId`/`productId` are plain string columns (no FK — the reported entity may be a product living in another service's database, so no cross-database foreign key is possible). No report-submission endpoint yet — table only. |
| _(not in ER)_ | `RefreshToken` / `refresh_tokens`           | New table. JWT refresh-token rotation/revocation needs somewhere to record issued tokens and their revoked/expiry state; the ER has no concept of sessions/tokens.                                                                                                                                               |

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

| ER entity     | Prisma model / table | Change + reason                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(not in ER)_ | `Review` / `reviews` | New table — the ER has no review/rating concept. Rates the **seller**, not the individual product: listings are one-off (a product sells exactly once and is gone), so the seller is the party the buyer keeps dealing with across purchases. `order_id` is unique — one review per completed order, and only after the order's status is `completed` (checked via a call to `order-service`). |

Explicitly **not** built yet: `seller_stats` (aggregates are computed on read via
`reviewModel.summaryBySeller`/`listBySeller` instead of a materialized table), `notifications`,
review moderation/reports, seller replies.

## Still to schema (per the master plan, not built yet)

chat-service (message, Auto_messages + new: chat_rooms).
