# Pickup / transit flow verification

## Implemented scope

Approved seller-controlled compact flow:

`ready_to_ship -> pickup_in_progress -> in_transit -> delivered -> completed`

- Seller presses **เรียกขนส่ง**. Order and Shipping enter `pickup_in_progress`; no carrier/tracking required and no handoff timestamp is set. UI label: **ขนส่งกำลังเข้ารับสินค้า**.
- Seller presses **ส่งมอบให้ขนส่งแล้ว** with nonblank company and tracking number. Order and Shipping enter `in_transit` together, and `shippedAt` records that handoff. UI label: **อยู่ระหว่างการขนส่ง**.
- Only `in_transit` qualifies for simulated delivery after the existing delay. Pickup does not start the delivery timer.
- Buyer cannot perform either seller transition; skipped pickup, stale writes, and active hold/dispute cases are rejected.
- Relevant buyer/seller/support status displays, filters, counters, timelines, notifications, metrics, recommendations and seed callers were updated.
- No real carrier integration or `out_for_delivery` was added. Payment/refund/cancellation rules are unchanged.
- Legacy `shipped` requests are not accepted as a bypass around pickup.

Contract and deployment details: `docs/order-pickup-transit.md`.

## Migration

`backend/services/order-service/prisma/migrations/20261025000000_compact_pickup_transit/migration.sql`

Maps only current Order `status`, Order `pre_dispute_status`, and Shipping `status` values of `shipped` to `in_transit`. It retains shipped timestamps, carrier/tracking/address facts and historical audit text. Affected Order versions increment once, even if both mapped fields change. Existing migration history was not rewritten.

Actual PostgreSQL rehearsal executed the real migration against session-local temporary tables: legacy mapping, pre-dispute mapping, preservation of unaffected states and shipment facts, unchanged audit text, one version increment and replay idempotency all passed. Migration deployment also succeeded in fresh isolated runtime and integration databases.

## Actual Docker results

Fresh project: `reloop-pickup-transit-qa`; separate volumes and databases. Existing application/older QA projects were not migrated or reset. The project `.env` was not changed.

- Final Order/frontend images built successfully. Dependency service images also built successfully.
- Backend source tests + affected PostgreSQL integration/migration suites: **292 passed, 0 failed, 1 skipped** out of 293 tests, exit 0. `REQUIRE_INTEGRATION=1` and explicit cart database configured. The skip was the separate populated ER upgrade rehearsal requiring `ER_REHEARSAL_CONTAINER`, not a failure silently ignored.
- Final frontend tests: **125 passed across 12 suites**, exit 0, after correcting pickup wording. Includes shipping modal, timeline, buyer details, seller tracker/product list, profile shortcuts, product page, order view, payment, NavBar and OrderLine. React act warnings remain in test output; suites passed.
- Real HTTP smoke through gateway + real auth: **3 functional scenarios and 3 cleanup checks passed**, exit 0. Run ID: `pickupqa-1792773690144-bb6e843c`.
- `/orders` returned HTTP 307 to `/profile?tab=orders`; destination returned HTTP 200. This is HTTP/render verification, not a claim of browser visual QA.
- Final `git diff --check`: passed (Git also reports line-ending conversion warnings).

### HTTP smoke assertions

1. Actual order/checkout/simulated payment/seller confirmation reaches ready-to-ship. Cannot skip pickup; buyer cannot perform pickup or transit. Pickup persists both statuses, preserves a null handoff timestamp, and remains pickup during the real delivery sweep even with a deliberately old fixture timestamp. Address changes are rejected. Missing/blank company/tracking is rejected without state mutation. Valid handoff trims and persists carrier/tracking and current shippedAt. A scoped real lifecycle sweep delivers an eligible transit order, then buyer completion succeeds while seller completion is forbidden.
2. Manual unpaid cancellation remains cancelled, creates no refund, and releases its product.
3. Own expired unpaid basket becomes payment_expired through the real buyer order-list consumer, with no refund and inventory release.

For deterministic backdating tests, only the QA lifecycle polling interval was temporarily set to 600000 ms. The delivery delay remained the default 10000 ms. The actual lifecycle sweep function was invoked explicitly with an own-fixture scope. The polling override was removed after smoke and QA Order service restarted with normal defaults. This does not claim a real carrier event or wall-clock production delivery measurement.

## Cleanup and limits

The smoke finally block removed only its owned Orders/children, baskets/checkouts, products and registered buyer/auth children. Independent post-smoke queries confirmed **0 products** with this run prefix and **0 users** with its generated email. Existing demo accounts/catalog rows were retained. Shared seller login audit and generated chat/notification history were not broadly deleted; do not describe this as erasing every cross-service event.

No production/normal application deployment, commit, reset or volume deletion was performed. Apply the forward migration to the normal environment together with the API/frontend update; avoid mixed legacy/new shipping writers.

This was the affected-scope test selection, not every repository/microservice test. The separate ER populated-upgrade rehearsal and visual browser QA were not performed.

## Evidence and reproduction

Scratch directory:
`C:/Users/nes/AppData/Local/Temp/reloop-pickup-transit-qa-sfMYa7/`

- `compose.json`: isolated runtime configuration, loopback frontend 13002 and gateway 18082.
- `run-docker-tests.cjs`: cross-service-capable Docker test image and dedicated `reloop_ci_*` test databases.
- `smoke-pickup-transit.cjs`: real gateway smoke and guarded owned-fixture cleanup.
- `README.md`: smoke prerequisites, timing-race precautions and cleanup contract.
- `rehearse-pg-migration.cjs`: actual PostgreSQL temporary-table migration rehearsal.
- `smoke-pickupqa-1792773690144-bb6e843c.json`: scenario and cleanup results, no bearer tokens/passwords.

Background logs: `C:/Users/nes/AppData/Local/Temp/pi-background-terminals/session-urnmkC/`:
- `bt-8`: backend Docker tests.
- `bt-9`: runtime migration and HTTP smoke/cleanup.
- `bt-10`: final frontend Docker tests.
- `bt-11`: final frontend wording image build.
- `bt-12`: restoring default QA lifecycle polling after deterministic smoke.

Subagent local results (not substituted for Docker evidence above): backend 263 passed / 2 environment skips; frontend 125 passed; 29 syntax checks passed. Existing unused shippingAddress parameter was not removed as unrelated cleanup.
