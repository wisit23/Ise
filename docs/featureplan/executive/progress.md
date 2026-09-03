# Executive Feature Progress

> Owner: อัสนัย เมืองรอด · Reviewer: ศิวกร วรวัฒน์อมรชัย · Updated: 2026-08-26

**Status:** `CEO-001`, `CEO-002`, `CEO-003` implemented and verified against PostgreSQL;
`CEO-004`/`CEO-005` partially delivered (see Scope notes) — awaiting Reviewer sign-off

**Plan coverage:** Explicit trace rows cover `UR-27`–`UR-31` through FR, active/deferred NFR,
`WF-12` and `CEO-001`–`CEO-005`

## Delivered

- **`CEO-001` — provider endpoints.** `GET /api/*/executive/metrics?from&to&timezone` on
  auth (`activeUsers`, `newUsers`), order (`gmv`, `platformRevenue`, `completedOrders`) and
  product (`newListings`, `soldListings`, `activeListings`). Shared
  `resolveMetricRange`/`metricMeta` in `backend/shared` keeps the query shape and
  `meta.{definitionVersion,timezone,from,to}` identical across all three owners.
- **`CEO-002` — dashboard.** `/executive` composes the three providers with
  `Promise.allSettled`; a provider that fails renders "ไม่พร้อมใช้งาน", never a zero.
  Executives are redirected to `/executive` on login (`UR-27`).
- **`CEO-003` — rankings.** `GET /api/products/executive/top-catalog` returns categories and
  products ranked by gmv with a `gmv → count → label` tie-break so ordering is deterministic.
- **`/executive/reports` breakdown (`UR-28`, `FR-6.1.2`).** Reworked from a single
  MoM/YoY comparison row to a full per-period breakdown table, per Owner request: one row per
  day for a monthly report, one row per month for a yearly report. New owner-local endpoints
  `GET /api/orders/executive/metrics-series` and `GET /api/auth/executive/metrics-series`
  (`from&to&granularity&timezone`) do the day/month bucketing and gap-fill in SQL — a day with
  no orders returns `0`, not a missing row. `PLATFORM_FEE_RATE` and the day/month label
  formatters live in `frontend/lib/executive.js`. As with the dashboard, a provider that fails
  marks only its own columns "ไม่พร้อมใช้งาน"; the page falls back to a page-level message only
  if both providers fail.
- **CSV export (part of `UR-31`).** `/executive/reports` downloads the same per-day/per-month
  breakdown as UTF-8-with-BOM CSV — one row per period, one column per metric, each column a
  single unit (บาท / รายการ / คน) so a spreadsheet SUM never mixes currency with a headcount.
- **Complaint feed (partial `CEO-004`).** `GET /api/auth/executive/reports` serves the
  `reports` table auth-service already owns, plus a repeat-offender grouping;
  `/executive/complaints` renders it as a numbered list. The `reports` table has no seed data
  (removed by Owner — showing demo complaints looked like real activity), so this page's list
  is empty until real user-submitted complaints exist; the page states this to the reader.

## Scope notes / deviations

- **`CEO-004` is NOT complete.** No anomaly-detection rule, no `alertWorker`, no alert
  fingerprint/status persistence, no review-service schema change. The complaints page reads
  user-submitted reports only — the page states this to the reader.
- **`CEO-005` is NOT complete.** CSV is generated client-side from figures already fetched;
  there is no persisted export job, status or expiry as the task requires. PDF is not built.
- `auth-service/prisma/seed.js` no longer seeds demo `Report` rows (removed by Owner). It still
  seeds 4 demo seller accounts + 1 demo executive account (`ceo@example.com`).

## Acceptance evidence

- `npm test` with `REQUIRE_INTEGRATION=1` against PostgreSQL: **51 passed, 0 failed, 0 skipped**
  (auth `user-metrics` + `user-metrics-series` + `executive-reports`, order `platform-metrics` +
  `platform-metrics-series`, product `catalog-metrics` + `top-catalog`, plus the rest of the
  repo's existing backend suites — re-run 2026-08-26 after the metrics-series addition)
- `npm --workspace frontend run test`: **28 passed** across 7 suites (adds `lib/executive.test.js`
  covering the day/month label formatters and `growthPct`)
- `npx eslint .`: clean
- Manual verification through the gateway with the demo executive account (`ceo@example.com`):
  all endpoints 200, non-Executive 403, unauthenticated 401
- Accessibility/layout: trend charts carry `role="img"` + a spelled-out series summary
  (the tooltip is pointer-only); no horizontal page overflow at 375px

## Known issues not caused by this work

- `npm run format:check` fails on ~176 pre-existing files repo-wide; only files touched here
  were formatted, to avoid unrelated churn. CI enforces this step, so it needs a separate
  repo-wide Prettier pass.

**Deferred:** Production Executive authorization and alert/audit security hardening
(`NFR-SP-*`, `NFR-CP-*`) remain Security Phase and must not be reported as Done

**Next action:** Reviewer to check `CEO-001`–`CEO-003` acceptance evidence, then decide
whether `CEO-004`/`CEO-005` are finished properly (persisted alerts, persisted export jobs)
or formally rescoped to what is built

**2026-08-26 update:** Consolidated the three `/executive/*` routes into one sidebar panel
(same format as CS/Admin's `/workspace`) and reconnected the Complaints tab to real data —
see `changelog.md` "Consolidate into a Panel" for the full rationale, the `{data,meta}`
response-shape bug found and fixed, and updated test evidence. Does not change `CEO-001`–
`CEO-005` status above; this was a UI-consistency and bug-fix pass, not new feature scope.
