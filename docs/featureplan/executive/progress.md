# Executive Feature Progress

## 2026-10-10 — Pre-Git recheck

แก้ last-page recovery และ safe target/actor lookup พร้อม regression checks.
Frontend 41/41, isolated backend 3/3, scoped lint/format/static types/Compose config
และ secret scan ผ่าน. จุดส่งมอบล่าสุดอยู่ใน handoff.md; whole-role/browser acceptance
ยังคงแยกจากชุดตรวจนี้

## 2026-10-10 — Complaint quality review

Refactor hook/row + runtime and static types for API boundary + timeout/retry + consistent query/count snapshot complete. Frontend 40/40, isolated backend checks 3/3, scoped lint, strict API-module type check, production build และ Compose config ผ่าน. ข้อมูลจริงอ่าน Database/API; config รองรับ Environment Variables พร้อมค่า default. ไม่เปลี่ยน whole-role acceptance หรือ Trust & Safety workflow

## 2026-10-09 — All status filter

ตัวกรองทั้งหมด implemented หลังยกคำร้อง; คงตัวกรองที่ยังเปิดอยู่เดิมแยกกัน. Focused frontend 18/18 และ PostgreSQL isolated schema 1/1 ผ่าน

## 2026-10-09 — Realtime search input

Search as you type พร้อม debounce/IME handling และ input focus preservation implemented; ใช้ API Search เดิม. Focused tests 17/17 ผ่าน

## 2026-10-09 — Search target/shop

ช่อง Search ด้านขวาของรายการ + backend search/status filtering + pagination implemented. ค้นหาข้อมูล Database จริงก่อน limit; การเปลี่ยนคำค้น/สถานะ/เป้าหมายคืนหน้า 1. Isolated PostgreSQL checks 3/3 และ focused frontend 26/26 ผ่าน. ไม่แก้ schema หรือ Trust & Safety workflow

## 2026-10-09 — Complaint overlay layout fix

Modal portal ครอบทั้งหน้าและล็อก body/panel scroll จนกว่าจะปิด โดยคืนค่า overflow เดิม. Focused regression tests 18/18 ผ่าน; browser visual QA ยังไม่ได้ตรวจ

## 2026-10-09 — Complaint quality checks

Runtime API validation + JSDoc สำหรับข้อมูลคำร้อง/Action, retry และ stale-response guard implemented. Modal แยกเป็น component; runtime data ไม่มี mock fallback. Configuration รองรับ environment และมี validation. Focused frontend 30/30, backend query/config 2/2 และ scoped ESLint ผ่าน; ยังไม่ใช่ whole-system หรือ browser acceptance

## 2026-10-09 — Complaint decision details

Implemented: ชื่อ Trust & Safety ผู้ดำเนินการ, Action และเหตุผลจาก Report/Audit/User ใน Modal เดิม. PostgreSQL isolated-schema test 1/1 และ focused frontend tests 15/15 ผ่าน. ไม่มี schema change; whole-role acceptance เดิมไม่เปลี่ยน

## 2026-10-09 — Complaint details popup

Implemented: แต่ละคำร้องมีปุ่มรายละเอียดและ Modal แสดงเหตุผล ผู้ส่ง วันเวลาที่แจ้ง (Asia/Bangkok) เป้าหมาย และสถานะ โดยใช้ข้อมูลจาก API เดิม. Existing complaint/Modal regression tests: 8/8 passed; browser interaction ยังไม่ได้ตรวจ. ไม่เปลี่ยนสถานะการรับรอง `CEO-004`/`CEO-005`

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
