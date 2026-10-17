# Order history / checkout / attribution implementation

## Scope and decisions

Implemented the approved order-history continuation in `orderHistoryClient.js`, checkout/session handling, shipping address resolution, attribution outbox, the log-backed history migration, and scoped tests. Existing changes in order-service dispute workflow, evidence, holds, other services, and other files were preserved and not edited. Do not commit as part of this task.

- Selected address is resolved by `addressId` from Auth's authenticated `/me/addresses` response and ownership is checked against the buyer. Client-supplied address content and default-address substitution are not used.
- Checkout totals are recomputed from linked orders as exact decimals. Checkout/shipping snapshots and order title/code/pre-dispute state are reconstructed from immutable `order_log.detail` history.
- No historical pre-dispute status is invented when absent.
- Attribution request, retry and ACK state use `order_log`; the immutable request's event ID is reused on retry and Product idempotency is exercised.
- The migration imports old state as `legacy_import`, asserts representability and field equality before destructive DDL, preserves outbox retry/error/processed metadata, and blocks unrepresentable checkouts.
- `orderHistoryClient.wrapClient()` now also hydrates historical order fields on related orders from `disputeCase.findUnique({ include: { order: true } })`, while leaving dispute writes to the parent wrapper.

## Parent composition contract

The production `prismaClient.js` must compose both wrappers, with order-history outside the dispute-workflow facade:

```js
module.exports = require("./orderHistoryClient").wrapClient(
  require("./disputeWorkflowClient").wrapClient(prisma),
);
```

The order-history facade must wrap the same raw Prisma instance used by application repositories. This worker intentionally did not edit `prismaClient.js` per the ownership instruction. The integration suite composes both wrappers directly and injects that client; production application reads are not fully connected until the parent applies the composition contract. Parent full regression remains pending.

## Verification performed

- `node --test` targeted checkout-session, shipping, attribution outbox, and order-model tests: **28 passed, 0 failed, 0 skipped** (3.04 s).
- `test/order-history.integration.test.js` against the isolated `ise-er-rehearsal-20261014` container at `localhost:55439`, database `order_history_luna_er`: **8 top-level tests passed, 0 failed** (64.72 s). It covered fresh migration, selected-address ownership/snapshots, exact totals, checkout/payment retry and process restart, nested Prisma selects and rollbacks, pre-dispute restoration, attribution atomicity/retry/crash-before-ACK/Product deduplication, populated upgrade preservation, and blocked invalid upgrades.
- The test asserts database host/port/name to keep it isolated from the parent's `reloop_ui_order_er` database. Credentials were obtained inside the shell invocation from the rehearsal container and were not printed or written to disk.
- Two checkout/chat notification attempts in integration emitted expected `fetch failed` warnings because no chat service was started; checkout/payment assertions passed. The tests use mocked product reservations and an isolated Product schema/actual Product event processor endpoint.
- An initial integration run exposed stale DB-name assertion and Prisma's transaction-aborted wrapper hiding the underlying guard message. The test now targets the mandated isolated database and asserts migration failure plus preserved legacy row rather than depending on the nested SQL exception text.

## Remaining integration work

- Parent must compose the two client wrappers in `prismaClient.js` and run full order-service regression after the composition.
- No real Auth, chat, payment gateway, or production database was used. This verifies the local Auth address API contract with a local HTTP fixture, not the external deployed service.
