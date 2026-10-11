# Integration validation — 2026-10-11

## Scope

Merge buyer 942d7d0, customer-service cb62a9a, chat a74320f, trust-safety 43bccda, marketing 25aeb5f, seller cc08206 and ceo 5767886 into local main after validation. Remote tips were fetched again and unchanged. No push, deployment or original database cutover is included.

## Approved integration contracts

- Buyer Order/Checkout/Payment/Shipping/Hold schema is canonical; preserve CS, Marketing, Seller and T&S functions against it.
- Preserve every legacy record. Order cutover remains blocked until address IDs, payment history and dispute types are fully mapped. Never invent historical values.
- Case SLA is automatic; evidence deadlines are set manually per evidence.
- CS reads own/unassigned cases, gathers evidence and escalates. Admin claims escalations and issues verdicts. T&S handles safety/holds separately.
- Reports require REVIEWED before an action and prevent duplicate actions.
- T&S may take over escalated ticket metadata; customer chat stays read-only for T&S/Admin and the original CS remains the responder.
- Swipe allows BUYER and SELLER with purchase rights; staff and purchase-restricted accounts are blocked.

## Validation results

- Backend and scripts: 834 passed, 0 failed, 2 live-only tests skipped in the broad runner.
- Both skipped live flows ran separately against Auth/Product/Order/Chat/Support: 2 passed, 0 skipped. Includes CS first-response/audit idempotency and Seller checkout, repeated payment confirmation, shipping, Buyer receipt, dispute, T&S PRODUCT transcript and legacy ORDER fallback.
- Frontend: 88 suites, 489 tests passed. Production Next.js build, lint and type checks passed.
- Fresh Order/Product migrations: deploy, redeploy and exact schema comparison passed.
- Fresh Support/Auth migrations: deploy/redeploy passed; comparison verified only the explicit preserved legacy columns/table and Auth bulk-action archive. These are preserved data, not a reason to run db push.
- Existing unbaselined Order/Product databases are rejected by migration gates before writes. Unit tests verify rejection with a legacy migration ledger too.
- Manual CS/Admin demo was adapted to payment-linked holds and normalized case logs, then seed/reset/verification ran twice in fresh test databases: 7 users, 4 tickets, 4 orders, 4 disputes, 3 reports, 12 chats. No original databases were used.
- Changed migration/demo unit checks: 12 passed.

## Deployment gates (separate from Git merge)

Backend Docker startup now starts the service only; schema changes and seeds must be executed explicitly. Product startup no longer accepts data loss. This is intentional: restarting a container must not perform an unreviewed database cutover or seed demo accounts.

1. Back up every original database and rehearse a data-preserving migration in a copy.
2. Resolve the missing legacy Order mappings and preserve Product auction/review/moderation/attribution history. The new Order/Product migrate wrappers reject existing unbaselined databases. Their canonical baseline is for a fresh database; do not mark an incompatible existing schema as applied.
3. Deploy Auth/Support versioned migrations explicitly; preserve legacy/archive data. Applied legacy Order migration SQL is retained under prisma/legacy-migrations and must not be rerun as a fresh baseline.
4. Run Chat prisma/idempotencyPreflight.js in dry-run mode. Duplicate keys block rollout; --apply only fills missing technical keys from the existing message ID. Review duplicates before creating the unique index.
5. Seed only required reference data explicitly. Demo seeds are opt-in; removed automatic demo scripts remain removed.
6. Verify cross-service endpoints, internal token and runtime role capabilities before starting the new stack.

The successful Git merge does not authorize or complete these database/deployment gates.
