# CI: tests and builds

The GitHub Actions workflow is `.github/workflows/ci.yml`. It runs on pull
requests, pushes to `main`, and manual dispatch. It does not publish images,
deploy services, or require deployment credentials.

## Jobs

- **Quality checks:** ESLint, Prettier, secret scan, dependency audit, and Compose
  configuration validation. The dependency audit is advisory; the other checks
  must pass.
- **Core tests:** separate jobs for Shared, Gateway, and repository scripts.
- **Service tests:** separate jobs for Auth, Product, Order, Chat, and Support.
  Matrix jobs keep running when another service fails.
- **Frontend:** Jest with coverage and the Next.js production build.
- **Docker builds:** build all five services, Gateway, and the production
  Frontend image. These run independently so a failing test does not hide a
  build failure. Images stay on the temporary runner.
- **CI result:** fails if any required job fails, is cancelled, or is skipped.
  This is the check to select when configuring GitHub branch protection.

Node tests use Node 24 from `.nvmrc`, matching the root package engine.
Docker builds exercise the existing Dockerfiles and their Node 22 runtime.
Backend jobs upload JUnit XML and LCOV reports; Frontend uploads Jest coverage.
Reports are retained for 14 days, including reports produced by failing suites.

## Integration databases

Every service job has its own PostgreSQL 16 and Redis 7 containers. PostgreSQL
databases are separated by service and use the `public` schema:
`reloop_ci_auth`, `reloop_ci_product`, `reloop_ci_order`, and `reloop_ci_support`.
Preparation applies the checked-in migrations, including views and triggers;
it does not substitute `prisma db push` for SQL migrations.
Product reference/catalog data is seeded; other suites create their fixtures.

Chat gets a MongoDB 7 single-node replica set and its own database. MongoDB uses
Prisma `db push` because that connector does not support Prisma migrations.

Service jobs set `REQUIRE_INTEGRATION=1`, so suites that honor that flag fail when
their dependencies are missing instead of silently skipping. Tests requiring
an explicitly enabled live stack, a migration preservation rehearsal, or a
special database/port remain opt-in. Shared's database integration suites are
also opt-in; its default core job runs the available unit/route tests.
This pipeline does not claim full cross-service end-to-end coverage.

## Running locally

```powershell
npm ci
npm run test:service -- auth-service
npm run test:service -- product-service
npm run test:service -- order-service
npm run test:service -- chat-service
npm run test:service -- support-service
npm run test:service -- shared
npm run test:service -- gateway
npm run test:service -- scripts
npm --workspace frontend run test -- --runInBand
npm --workspace frontend run build
```

Use `--unit` to exclude files named `*.integration.test.js` and `*.live.test.js`,
or `--list` to inspect which files will run. File naming determines this filter;
it does not guarantee that a test has no external dependencies.

For service integration tests, first point `DATABASE_URL_AUTH`,
`DATABASE_URL_PRODUCT`, `DATABASE_URL_ORDER`, and `DATABASE_URL_SUPPORT` at
**disposable localhost `reloop_ci_*` databases**, set `DATABASE_URL` to the Auth
URL, and supply test-only JWT/internal tokens and Redis/MongoDB URLs. Then run:

```powershell
npm run prisma:generate
npm run ci:prepare
```

Preparation validates all PostgreSQL targets before connecting, creates missing
databases, migrates them, and seeds Product. It requires a PostgreSQL user with
database creation privileges. It neither resets nor drops databases. Chat's
schema must be pushed separately with `DATABASE_URL` set to its disposable
MongoDB database, as shown in the workflow.

Do not point test commands at application or demo databases. Service tests use
the corresponding `DATABASE_URL_<SERVICE>` as their primary datasource.

## Existing quality debt

Enabling the workflow does not make existing failures disappear. Local checking
on 2026-10-14 found 21 remaining ESLint errors after fixing CommonJS script globals, plus
repository-wide Prettier failures. These checks remain enforced. Resolve the
reported files before expecting the aggregate `CI result` to turn green.

## Local validation on 2026-10-14

| Test group | Passed | Skipped | Failed |
| ---------- | -----: | ------: | -----: |
| Auth       |     98 |       1 |      0 |
| Product    |    333 |       2 |      0 |
| Order      |    148 |       3 |      0 |
| Chat       |    172 |       1 |      0 |
| Support    |     85 |       3 |      0 |
| Shared     |     42 |       2 |      0 |
| Gateway    |      8 |       0 |      0 |
| Scripts    |     13 |       1 |      0 |
| Frontend   |    543 |       0 |      0 |

The PostgreSQL migrations and Product seed were exercised on isolated
`reloop_ci_20261014_*` databases. Product's BullMQ suite was verified with a
separate Redis container so application workers could not consume test jobs.
Local Chat testing used the existing MongoDB 4.4 replica set with a separate
test database; the hosted workflow provisions MongoDB 7. Hosted Actions have
not yet been run for these changes. Workflow validation with actionlint and
the local Frontend production build passed. Docker builds passed for all seven
images (five services, Gateway, and production Frontend). No images were pushed
and no services were deployed.
