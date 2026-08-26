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
  Executives are redirected to `/executive` on login (`UR-27`). Monthly and yearly
  reporting with MoM/YoY growth lives at `/executive/reports` (`UR-28`, `FR-6.1.2`).
- **`CEO-003` — rankings.** `GET /api/products/executive/top-catalog` returns categories and
  products ranked by gmv with a `gmv → count → label` tie-break so ordering is deterministic.
- **CSV export (part of `UR-31`).** `/executive/reports` downloads the displayed figures as
  UTF-8-with-BOM CSV.
- **Complaint feed (partial `CEO-004`).** `GET /api/auth/executive/reports` serves the
  `reports` table auth-service already owns, plus a repeat-offender grouping;
  `/executive/complaints` renders it as a numbered list.

## Scope notes / deviations

- **`CEO-004` is NOT complete.** No anomaly-detection rule, no `alertWorker`, no alert
  fingerprint/status persistence, no review-service schema change. The complaints page reads
  user-submitted reports only — the page states this to the reader.
- **`CEO-005` is NOT complete.** CSV is generated client-side from figures already fetched;
  there is no persisted export job, status or expiry as the task requires. PDF is not built.
- `Report` rows are demo data seeded by `auth-service/prisma/seed.js` (the table was empty).

## Acceptance evidence

- `npm test` with `REQUIRE_INTEGRATION=1` against PostgreSQL: **49 passed, 0 failed, 0 skipped**
  (auth `user-metrics` + `executive-reports`, order `platform-metrics`, product
  `catalog-metrics` + `top-catalog`)
- `npm --workspace frontend run test`: **24 passed** across 6 suites
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
