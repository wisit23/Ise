# Compact pickup and transit flow

Current flow: `paid -> confirmed -> ready_to_ship -> pickup_in_progress -> in_transit -> delivered -> completed`.

- Seller presses **เรียกขนส่ง** while `ready_to_ship`. PATCH `/api/orders/:id/status` with `{ "status": "pickup_in_progress", "version": <current version> }`. No carrier or tracking number is required yet.
- Seller presses **ส่งมอบให้ขนส่งแล้ว** while `pickup_in_progress`. PATCH the same endpoint with `status: "in_transit"`, nonblank `company`, nonblank `trackingNumber`, and the current `version`.
- Both shipping transitions update Order, Shipping, the Order version and the new audit entry in one transaction. The service rechecks seller identity, current state, version, open disputes and active payment holds inside that transaction. Address snapshots and other shipping facts are retained.
- `shippedAt` remains the carrier-handoff timestamp. Only `in_transit` enters the existing simulated delivery sweep after `ORDER_DELIVERY_DELAY_MS` (default 10 seconds). Pickup never starts that timer. Delivery and receipt/auto-completion rules are unchanged.
- Buyers cannot request either shipping transition. Existing cancellation, expiry, auction and dispute/hold rules remain unchanged. There is no carrier integration or `out_for_delivery` state.

## Forward migration

Stop legacy Order writers, apply Order migration `20261025000000_compact_pickup_transit`, then start the updated services and status consumers. Do not run mixed legacy/new shipping writers. It maps only `shipped` values in `orders.status`, `orders.pre_dispute_status`, and `shipping.status` to `in_transit`. Affected Orders receive one new version. It retains handoff timestamps, carrier/tracking/address facts, active holds and all historical audit text. The guarded SQL is transactional and replay-safe; it does not invent historical pickup events.

The API does **not** accept legacy `shipped` requests. All current repository clients use the two-step flow, so a compatibility alias would allow callers to bypass the required pickup step. Historical migrations/logs and legacy migration-input fixtures keep their original spelling.

## Local checks

- Order service source tests exercise transition authorization, skipped pickup, holds/disputes, CAS conflicts, carrier validation, both atomic shipping writes, timestamps and delivery sweep selection.
- `test/order-pickup-transit-migration.test.js` executes the actual portable SQL on an in-memory SQLite fixture, checks all three mappings, retained facts/history and replay idempotency. PostgreSQL deployment is a separate environment check.
- Frontend tests exercise the seller's two buttons, handoff validation, buyer read-only controls, blocked actions, timelines, filters and profile shortcuts.
- Parent owns Docker deployment and live cross-service/browser smoke testing.
