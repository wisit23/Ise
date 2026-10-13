# Auth legacy archive implementation — worker evidence

## Scope / approval

The user approved strict Auth ER backend alignment and explicitly approved moving
the Auth `legacy_*` tables with all data from `public` into `legacy_archive`.
Writes were limited to Auth `prisma/` (new migration, `ER_MIGRATION.md`),
`test/approved-er.integration.test.js`, the Auth ER amendment and this file. No
commit, `.env`, production, root work map or reference schema was touched.

Guidance read first: nes-mode `SKILL.md`, `ref/harness.md`,
`ref/senior-mentor.md`, `ref/wayfinder-unified.md` and `playbooks/refactoring.md`.

## Inventory and consumers

Only `20261007125900_preserve_legacy_auth_data` creates legacy tables:

| Table                              | Created by                                                         | Notes                         |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| `legacy_admin_operations_20261010` | `RENAME` of `admin_operations` (legacy databases only)             | keeps its PK/indexes/sequence |
| `legacy_bulk_action_runs_20261010` | `CREATE TABLE AS` of `bulk_action_runs` (all; empty on fresh)      | no constraints                |
| `legacy_report_versions_20261010`  | `CREATE TABLE AS` (databases that have the old `reports.version`)  | no constraints                |

A repository search for `legacy_` (excluding `node_modules` and `.git`) found no Auth
runtime code, Prisma model, seed or script reading these tables. The hits were Auth
docs, logs and test, plus unrelated `legacy_` names in order-service, support-service
and `database/README.md` (not Auth tables; not changed). `prisma/migrate.js` baselines
five migrations and then runs `migrate deploy`, so it runs the new migration without
an edit.

## Delivered

- `prisma/migrations/20261014010000_archive_legacy_auth_tables/migration.sql`:
  `BEGIN; CREATE SCHEMA IF NOT EXISTS legacy_archive;` then, for each table found in
  `public`: raise (rolling back everything) if the archive already has it, otherwise
  `ALTER TABLE ... SET SCHEMA legacy_archive`; `COMMIT`. No drop, copy or rewrite.
- `test/approved-er.integration.test.js`: allowlist extended to `auth_worker_er` or
  `auth_archive_er` (same host/port/role rules); `reset` also drops `legacy_archive`;
  inventory requires zero non-ER tables and no `legacy_*` in `public`, and 9 applied
  migrations; the legacy scenario reads the archive schema; two new archive scenarios.
- `ER_MIGRATION.md` and `ER_AMENDMENT.md` updated.

## Actual checks

Container `ise-er-rehearsal-20261014`, localhost:55439. Created database
`auth_archive_er`. `auth_worker_er` and the other databases were not reset or used.

| Check                                                                                                                              | Result                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_ER_REHEARSAL=1 DATABASE_URL_AUTH=.../auth_archive_er node --test backend/services/auth-service/test/approved-er.integration.test.js` | Run 1: 1 fail (my test compared state while the conflict fixture table still existed). Run 2: 1 fail (sequence owner text now includes the schema name). Run 3: **7/7 pass, 0 skipped** (110.9 s). Both failures were test-side; OIDs, rows, constraints and indexes matched. |
| Same file without `AUTH_ER_REHEARSAL`                                                                                              | skipped (guard intact)                                                                                                                                  |
| Fresh 9-migration deploy, then `prisma migrate diff --from-url auth_archive_er --to-schema-datamodel schema.prisma --script`       | "This is an empty migration."; 17 tables in `public`; `legacy_archive.legacy_bulk_action_runs_20261010` has 0 rows                                     |
| Prettier on the test file                                                                                                          | pass after `--write`                                                                                                                                    |

Scenarios proven (PostgreSQL, synthetic data): fresh install and HTTP consumer; 7-to-8
rollback; legacy no-history helper (now reading `legacy_archive.*`: `Do not lose`, `7`,
`hash:DONE:historical error`) and a repeat helper run with no pending migrations;
populated archive move with identical row JSON, relation OID, PK/CHECK/index
definitions and serial-sequence ownership, next insert id 3; a forced conflict on the
last table rolls back the earlier moves; re-running the SQL is a no-op; a same-name
`public` table is refused without altering the archive; repeat `migrate deploy` reports
no pending migrations; the shop-change HTTP consumer works after the move.

## Gaps

- Synthetic data only; no real-data upgrade, production, or other-service run.
- Prisma does not model `legacy_archive`. A Prisma diff on the populated legacy fixture
  database after migration 9 was not run; the fresh-install diff is the clean evidence.
- Retention/export of `legacy_archive` is undecided. The baseline helper still accepts
  any nonempty no-history database.
- `SET SCHEMA` takes a brief ACCESS EXCLUSIVE lock per table.
- `auth_archive_er` now holds a fresh 9-migration install (the diff check).

Skills used: nes-mode | Refs: harness, senior-mentor, wayfinder-unified (existing approval) | Playbook: refactoring
