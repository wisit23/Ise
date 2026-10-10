# Order-service ER implementation

## Scope and state

Only files under `backend/services/order-service` changed. The approved target
is now the active `prisma/schema.prisma` (13 tables); the service's generated
Prisma client was regenerated. No original database was changed.

The user requested a trial against the existing database on 2026-10-07.
Migration is pending decisions about missing legacy values. Do not reset an existing database, guess
address IDs or payment timestamps, or run `db push --accept-data-loss`.
The service Dockerfile no longer accepts data loss automatically. Existing
databases with incompatible data must be migrated before the updated service
can start. There is no deployment or production data migration in this change.

## Implemented decisions

- Basket rows represent individual products; buyer_id identifies the owner.
  unlock_at is the reservation expiry. Product-service reservation IDs are
  stored as basket row IDs so existing reservation APIs remain usable.
- Auction orders have no basket and start in pending_payment. A deterministic
  order ID makes repeated auction callbacks idempotent without an auction_id
  column.
- One checkout groups orders from different sellers. Each order keeps its own
  campaign_id. Checkout amounts sum the order amounts using Decimal arithmetic.
- All stored monetary amounts are baht, Decimal(18,2). original_amount is before
  the voucher; orders_amount is after it. Use decimal strings for exact API
  input, especially for large values. Legacy numeric response aliases remain.
- Checkout.cancel_at is the required payment expiry, not cancellation history.
  paid_at remains null until paid. A payment retry resumes downstream delivery
  without creating another payment or changing the recorded payment time.
- One order supports multiple payment attempts, at most one shipping row and
  dispute case, and multiple order logs.
- Shipping is created with the checkout address snapshot. Before confirmation,
  the buyer can change addresses together; after confirmation and before
  shipment, the buyer can change one order's address. Both paths audit changes.
  Company and tracking number may be null before shipment and are required when
  marking the order shipped.
- Cases retain claim/reassign/escalate assignment fields and
  dispute_case_version. Each assignment and decision uses optimistic
  concurrency and writes a dispute_case_log in the same transaction.
- Case status is derived from decision and evidence status. Evidence owns its
  status/version/deadline. Buyers can upload immediately before staff claim.
  evidence_deadline is null until an assigned staff member specifies a real
  date; no automatic deadline or sentinel date is used.
- dispute_audit_log has one primary key and references individual evidence.
  One evidence has at most one safety review; safety_log records review events.
  Review actor/time are null until review.
- Log detail is required. Holds use hold_at/hold_by and keep release metadata
  null before release.
- One payment is frozen once for multiple overlapping reasons. Each hold
  records the same payment amount as a snapshot; DO NOT SUM hold amounts as
  additional frozen money. Releasing a reason matches source + reference_id.
  A dispute decision cannot release a T&S hold. An approved refund waits until
  every active reason has been released.
- Product-sync requests/completions use immutable order_log entries instead of
  the removed outbox table. Failed requests remain available to the worker.
- The hold backfill now uses actual cases and paid payments; it cannot infer
  deleted legacy flags or invent historical payment records.

## API changes inside order-service

Existing /checkout-sessions routes remain; /checkouts is also supported.

- Create checkout: POST /checkouts, with orderIds, addressId, shippingAddress.
  Checkout-level couponCode is rejected; vouchers are per order.
- Change all pending addresses: PATCH /checkouts/:id/address, with addressId
  and shippingAddress.
- Change one confirmed order address: PATCH /:id/shipping-address, with
  addressId, shippingAddress and optional order version.
- Mark shipped: PATCH /:id/status, with status=shipped, company and
  trackingNumber.
- Open dispute: POST /:id/disputes, with reason and disputeType.
- Set deadline: PATCH /disputes/:id/evidence/:evidenceId/deadline, with deadline
  and evidence version. Only the assigned authorized staff member may write.
- Verify evidence: PATCH /admin/:id/evidence/:evidenceId/verify, with status,
  detail and evidence version, under the existing administrative permission.
- Legacy single-order pay requires a checkout with an address. For a checkout
  containing several orders, confirm the checkout rather than one order.

Frontend, gateway and other service code were not edited. Existing callers
must supply the new required request fields. Removed snapshot fields such as
productTitle/campaignCode are no longer persisted on orders; create-order
responses can still include the live reservation quote. Historical snapshots
cannot be reconstructed from the approved columns.

## Verification (2026-10-07)

- Prisma schema validation and this service's client generation passed.
- ESLint and formatting passed; git diff whitespace check passed.
- 56 function/HTTP tests passed.
- 21 integration tests passed against temporary PostgreSQL 16 databases,
  including multi-seller checkout and exact totals, payment retries, shipping
  uniqueness/address guards, immediate evidence upload, manual deadlines,
  per-evidence audits, unique safety reviews, auction idempotency, case/hold
  concurrency and reservation takeover/expiry.
- Both demo seed scripts ran twice successfully on the temporary database.
- Auth-service activity calls in existing tests timed out as expected and did
  not fail purchases; this does not verify live auth-service integration.
- Tests used node --test --test-isolation=none, one test file per process,
  because the restricted Windows runner could not spawn its default workers.
- Temporary test databases used separate container storage; they were not
  copies of original or customer data.

## Pending database migration

### Existing database trial (2026-10-07)

- Started the existing `ise-postgres-1` container; did not start/rebuild the
  order-service container or other application services.
- Connected the updated local order-service Prisma client to the existing
  `reloop_order` database via localhost. Connection succeeded. The read-only
  `order.findFirst()` trial failed with P2022: `orders.order_id` does not exist;
  the existing primary key column is `orders.id`.
- Read-only inspection found 9 legacy tables, 11 orders, 8 checkout sessions,
  and 2 dispute cases. Evidence, audits, holds and sync-event tables were empty.
- All 8 checkout address snapshots lack an address ID. Seven paid checkouts
  have a recorded paid_at. Three orders without a checkout (one completed,
  one disputed, one refunded) have no payment record or recorded paid_at.
  Both dispute cases lack dispute_type in the legacy schema.
- No original rows or schema were changed. Awaiting the user's choice between
  preserving legacy data separately and activating the approved schema in the
  same database, or migrating every record after resolving missing values.

The old schema used different table/column names and lacked required values.
A safe preserving migration must explicitly rename/map fields, reconstruct
basket/checkouts where valid, and obtain missing address/payment/evidence
references from real records. Existing case-level audit entries cannot be
assigned arbitrarily to evidence. Admin evidence without an evidence FK
requires a user-approved mapping. Keep those choices pending rather than
dropping records or synthesizing history.
