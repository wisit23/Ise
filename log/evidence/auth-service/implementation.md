# Auth ER implementation — worker evidence

## Scope / approval

The user approved full-scope implementation. This worker was explicitly delegated
Auth only: `backend/services/auth-service`, Auth ER amendment documentation, and
this file. No new interview/checkpoint was opened. Order/Product/Support, shared
scripts, root logs, real data, `.env`, and commits are excluded.

Read `decisions.md`, `../README.md`, repository `README.md`, the complete archived
`../sources/er-audit-report-original.md`, and the actual Auth ข้อ 1 draw.io page
`QHJz9qzJK7pLv-PV6rBe`. Ignored ER paths were found with `git ls-files`, not inferred
from an empty `fd` result. The runtime schema, all eight migrations, existing
baseline helper, callers/serializers and relevant consumer tests were inspected.

## Delivered / retained

**Parent-supplied implementation reviewed, not re-created:**

- `prisma/schema.prisma`: AutoMessage relation to `SellerProfile.userId`; required
  `message_id`, `user_id`, `message_text`, `is_active`, inactive default; item
  PK(requestId, fieldName) and retained unique/generated `id`.
- `prisma/migrations/20261014000000_approved_er_keys_and_auto_messages/migration.sql`:
  explicit transaction, no data rewrite/delete, same required fields/default and
  actual FK with cascade actions. Existing field-pair uniqueness permits safe PK
  replacement. Historical migration and helper files are unchanged.

**Worker-created files:**

- `backend/services/auth-service/test/approved-er.integration.test.js` — opt-in,
  strictly guarded serial fresh/populated/legacy rehearsal against PostgreSQL.
- `backend/services/auth-service/prisma/ER_MIGRATION.md` — deploy/rehearsal contract,
  migration and consumer coverage, archive/constraint limits.
- `database/erdesign/Auth Service/ข้อ 1/ER_AMENDMENT.md` — explicit key annotation
  amendment, seller/message cardinality, implementation choices and strict-table
  issue. The historical drawing/PDF are retained, not silently rewritten.
- This evidence record.

No production JS caller change was necessary: item IDs are still unique and the
service creates nested items without relying on id being the primary key.
`shopChangeRequestService` includes items and serializes them back to the old
`shopName/address/bankAccount` response. Controller/routes preserve paths,
request ID decisions, HTTP codes and role checks. Inspected frontend consumers:
`SellerShopSettings`, `EditShopModal`, store page, and
`SellerChangeRequestsSection`; these read the existing flattened fields/request
IDs. No other production consumer of AutoMessage was found. No automatic-send
API, trigger/job, extra columns or one-active-message constraint was invented.

## Actual checks

Environment: existing disposable container `ise-er-rehearsal-20261014`,
localhost:55439. Worker created **`auth_worker_er`** independently; all SQL/Prisma
mutations were limited to it. The parent's `auth_er` database was not used. Test
runner retained synthetic legacy fixtures at completion. No container was stopped
or removed. Installed tools: Node v24.20.0, Prisma 5.22.0. Node v24.20.0 satisfies
current root `package.json#engines.node` (`>=24.0.0 <25.0.0`); the previous claim
that it was outside the current package engine was incorrect. Pin sources remain
contradictory: `.nvmrc` specifies `22`, `.github/workflows/ci.yml` reads that file
via `node-version-file`, Auth's Dockerfile uses `node:22-alpine`, and root
`README.md` still describes the old 22.x engine. `.npmrc` enables
`engine-strict=true`, which applies the current package engine. These checks
prove behavior on Node v24.20.0, not on the differing CI/container pins. No pin,
production file or root documentation was changed by this correction.
The parent-generated default client was already Auth; this worker did not run
client generation for Auth or any other service.

Commands were spawned with explicit disposable environment overrides (Prisma
reported `auth_worker_er` even when its CLI announced automatic `.env` loading).
No `.env` was read manually or changed.

| Check | Observed result |
| --- | --- |
| Direct Auth `prisma migrate deploy` on empty worker DB | All 8 migrations applied successfully |
| `AUTH_ER_REHEARSAL=1 DATABASE_URL_AUTH=.../auth_worker_er node --test backend/services/auth-service/test/approved-er.integration.test.js` | 5/5 test nodes pass, 0 failed/cancelled/skipped; four substantive scenarios plus their parent |
| Same rehearsal with URL `/auth_er` | Expected assertion failure before Prisma/app import or SQL execution; destructive database guard proven |
| Auth `prisma validate --schema backend/services/auth-service/prisma/schema.prisma` | Pass |
| Selected existing shop-change + address unit tests and register/login integration | 15/15 pass, 0 skipped; real register/login/refresh and wrong-password HTTP assertions run |
| Existing `multi-role.integration.test.js` with `REQUIRE_INTEGRATION=1` | 1/1 pass, 0 skipped |
| ESLint on new rehearsal file | Pass |
| Prettier on new rehearsal and Auth amendment/migration docs | Pass/applied locally; no unrelated files formatted |
| `git diff --check -- backend/services/auth-service` | Pass |
| Prisma worker DB-to-runtime-schema diff after legacy upgrade | Only DROP TABLE statements for the three historical `legacy_*` archives; no runtime-model diff. SQL was **not applied** |

Rehearsal evidence includes actual PostgreSQL constraints/column sets for all
17 ER entities, Prisma and raw-SQL inactive defaults, UUID/legacy-ID behavior,
duplicate pair/ID rejection, orphan FK and buyer-only owner rejection, required
message-text rejection, CRUD, seller/request cascade delete, transaction rollback
following an earlier profile write, and atomic migration rollback following a
forced CREATE TABLE conflict **after** the PK-switch statements.

The HTTP shop consumer is executed on migration 7, fresh migration 8, and upgraded
migration 8: submit, seller history, admin queue, approve, reject, forbidden seller
admin access, duplicate pending/decision conflicts and stale old-value conflict.
Approval applies all three fields; rejected/stale requests do not overwrite the
profile. Legacy item IDs persist in both database lookups and response items.
Populated 7-to-8 snapshots compare every existing row in all 16 previous runtime
tables as PostgreSQL row JSON, including null historical snapshots.

The no-history legacy path uses the existing helper and five recognized legacy
migrations, preserving direct pending/decided shop values, stable generated
migration IDs, original timestamps, KYC keys, role grants, password hash and
admin/bulk/report archives. Migrated pending items are approved through the
existing service consumer. Reconnect and repeat deploy/helper calls succeed with
no pending migrations. Early rehearsal iterations found only test-fixture
issues (classification rectangles included as ER entities; duplicate fixture
user ID); both were corrected, then the full rehearsal passed.

## Remaining limits / decision for the parent

1. **Strict whole-schema table alignment is not complete.** The older
   preservation migration creates `legacy_bulk_action_runs_20261010` even on a
   fresh chain. The legacy fixture also retains
   `legacy_admin_operations_20261010` and `legacy_report_versions_20261010`.
   These are outside the ER and in `public`. All 17 runtime ER tables/column sets
   match, but the whole schema has extras. Do not drop preserved data to hide the
   mismatch. Archive relocation/export/retention needs an explicit decision.
2. Existing `admin_audits`, `bulk_action_runs`, `executive_audit_logs` actor FKs
   remain `NOT VALID`; new rows are constrained, historical integrity is not
   certified. New AutoMessage and existing item ownership FKs are validated.
   No historical actors/data were fabricated or removed.
3. ER does not prescribe every type/default/nullability/referential action.
   Existing contracts and parent-supplied new-table choices are documented as
   implementation choices, not claimed to originate in the drawing.
4. Existing baseline helper accepts a nonempty no-history database; only the
   recognized synthetic legacy fixture was proven safe. No unknown-schema guard
   change or baseline bypass was added.
5. No real-data migration/deployment, browser flow, PDF revision equivalence,
   stale `database/auth-service.prisma` refresh, broad npm test, other-service
   tests/generation or cross-service behavior was attempted.

Status: approved new keys/table and Auth consumer compatibility are implemented
and verified on disposable PostgreSQL. Unqualified exact-public-schema completion
is blocked by the pre-existing archival-policy conflict above.

Skills used: nes-mode, context-mode | References: Harness, Senior Mentor,
Wayfinder (reuse approval/scope/continuation) | Playbook: Refactoring.
