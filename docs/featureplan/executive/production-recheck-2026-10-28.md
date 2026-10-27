# Executive and related changes: production recheck, 2026-10-28

## Scope and data sources

- Overview and performance reports read the owning services' metrics APIs. Revenue and fees come from order-service; web usage from auth-service; category rankings from product-service.
- Complaints read `reports` and matching `admin_audits`; tickets and disputes remain in their owning databases. Product names are resolved through the internal product API.
- Shipping milestone times are projected from `order_log` and persisted order timestamps. Missing legacy timestamps are explicitly unavailable; they are not inferred from `updatedAt`.
- KYC approval grants `SELLER` in the same transaction as `VERIFIED`. The repair migration preserves previously approved sellers.
- Runtime business data has no mock fallback. Fixtures and mocked service failures are confined to tests. UI translations, enum codes and documented configuration defaults remain legitimate constants.

## Fixes made during this recheck

- Production frontend now accepts `NEXT_PUBLIC_API_URL` at build time and uses `npm ci` with its lockfile.
- Standalone frontend applies the same Next/PostCSS override as the workspace root. Its lockfile was regenerated because the previous lock retained vulnerable nested PostCSS despite the new override. `npm audit --omit=dev` then reported zero vulnerabilities.
- Executive timeout, search debounce and timezone share validated environment configuration. Invalid ranges or timezone fail explicitly.
- Ticket/dispute detail payloads are checked before rendering: IDs, dates, people, amounts, status and handling data. Invalid payloads follow the existing error/retry flow.
- Overview validates metrics, category rankings and order-status totals. Invalid or missing provider data is unavailable rather than zero.
- New/updated boundary modules use JSDoc types and `@ts-check`; a separate strict TypeScript check covers `executiveComplaints`, `executiveCaseDetail`, `executiveConfig` and `executiveMetricsPayload`.
- KYC malformed field types return 400 before document persistence or role changes.
- The product-name integration test creates its own condition fixture, so it works on a clean migrated database.

## Verification

- Frontend: 30 suites, 379 tests passed across Executive and the related product/reporting, CSAT, dispute, shipping and authentication changes.
- Backend selected unit tests: 83 passed.
- PostgreSQL integration: 21 tests/subtests passed across separate Auth, Order, Product and Support databases, including permissions, invalid inputs, pagination/search, decisions, KYC rollback and legacy-role repair. External services are stubbed where individual suites explicitly isolate those dependencies.
- Strict type check of the four boundary modules: passed. This is not a full-repository TypeScript conversion.
- Production Docker build and HTTP smoke checks for `/executive`, `/products` and `/seller/onboarding`: passed. A sentinel API URL supplied by build argument was verified inside the browser bundle.
- Production Compose configuration, scoped ESLint and whitespace checks passed. Tracked and newly added files were scanned for secrets.

## Deployment requirements and limits

- The running local order-service was rebuilt earlier and its real example order was checked for all five shipping timestamps.
- The existing local Auth database has the seller-role repair migration applied. New hardening changes in this recheck still require deployment/rebuild of the affected artifacts.
- The running local order-service has no explicit `PLATFORM_FEE_RATE`; its documented development fallback is 3%. Before production, configure the actual approved fee rate in the environment. This recheck does not choose a financial policy or change the live environment.
- These checks are not a production load test, a full security audit or a visual browser walkthrough of every flow. HTTP smoke checks verify serving pages, not an authenticated end-to-end browser session.
- The repository declares Node 24 in root engines while current Dockerfiles use Node 22. The tested production image builds on Node 22; aligning the project-wide runtime policy remains a separate deployment concern.
- No commit, push or deployment to a production server was performed for this recheck.
