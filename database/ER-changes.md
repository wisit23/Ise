# RE-LOOP — Database change log (vs. `docs/erdatabase.png`)

This file tracks every deviation from the original ER diagram, with the reason for each change.
Rule (per project decision): **no ER table is ever dropped** — tables not yet used by a shipped
feature are still created, just left with no routes/UI until that phase lands.

Updated incrementally as each service's schema is built. Current status: only `auth-service`
(`reloop_auth` database) exists so far — see [`auth-service.prisma`](./auth-service.prisma).

## auth-service (`reloop_auth`)

| ER entity | Prisma model / table | Change + reason |
|---|---|---|
| User | `User` / `users` | Added `password_hash` (login requires it; ER has no auth field), `phone`. `f_name`/`l_name` kept as DB column names via `@map` to match the ER's `FName`/`LName`. |
| Role | `User.role` enum (`BUYER`/`SELLER`/`ADMIN`) | Collapsed the separate `Role` table into an enum column. A user has exactly one role in this system (upgrades BUYER→SELLER in place); a join table added no value for that shape. Revisit if multi-role-per-user is ever needed. |
| Buyer | `BuyerProfile` / `buyer_profiles` | Same fields as ER (style/size/brand preference). Not populated yet — filled by the Phase 2 style quiz. |
| Seller | `SellerProfile` / `seller_profiles` | Same fields as ER (shop_name, id_card_number, bank_account) **plus** `kyc_status`, `kyc_document_url`, `verified_at` — required by workflow WF-01 (KYC state machine) which the ER doesn't encode. Table exists; KYC upload/approve endpoints are not built yet (out of scope for this pass). |
| Login_Log | `LoginLog` / `login_logs` | As ER. Written on every successful login. |
| Reports | `Report` / `reports` | As ER, kept per the no-cut-tables rule. `reporterId` has a real FK to `User`; `targetId`/`productId` are plain string columns (no FK — the reported entity may be a product living in another service's database, so no cross-database foreign key is possible). No report-submission endpoint yet — table only. |
| *(not in ER)* | `RefreshToken` / `refresh_tokens` | New table. JWT refresh-token rotation/revocation needs somewhere to record issued tokens and their revoked/expiry state; the ER has no concept of sessions/tokens. |

### Cross-service rule
No foreign keys reach across service databases. Where a table needs to reference an entity owned by
another service (e.g. `reports.product_id`), it's stored as a plain string ID with no DB-level constraint;
integrity there is enforced by API calls, not by Postgres.

### Still to schema (per the master plan, not built yet)
product-service (Product, Photo, Video, Swipe, Book_Mark, Auction, Campaign, Product_Campaign,
Campaign_KPIs, Evaluation_Criteria + new: tags/user_tag_scores/product_views), order-service
(basket, Order, Order_Items, Payments, Shippings, Dispute), chat-service (message, Auto_messages +
new: chat_rooms), review-service (new: reviews, seller_stats, notifications).
