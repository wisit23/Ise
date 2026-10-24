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

> Owner: อัสนัย เมืองรอด · Reviewer: ศิวกร วรวัฒน์อมรชัย · Updated: 2026-10-24

**Status:** `CEO-001`, `CEO-002`, `CEO-003` implemented and verified against PostgreSQL;
`CEO-004` not delivered by the deadline (CEO-DEC-011); `CEO-005` delivered as rescoped (CSV + audit log, CEO-DEC-016) —
awaiting Reviewer sign-off

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
  Executives are redirected to `/executive` on login (`UR-27`). Period buttons: 7 วันล่าสุด
  (default), เดือนนี้, ปีนี้ and กำหนดเอง, a date picker (วว/ดด/ปปปป, พ.ศ.) always shown on
  the right; a chosen day is drawn by hour, 00:00–23:00 Bangkok time (order-service `hour`
  series, CEO-DEC-013). Sales split into buy-now and auction; platform revenue uses
  `PLATFORM_FEE_RATE` from order-service (`meta.platformFeeRate`), not a frontend constant.
  Order-status and popular-category donuts; the trend chart has a rounded left axis.
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
- **Complaints page (CEO-DEC-014, CEO-DEC-015).** `/executive` → ข้อร้องเรียน lists three
  kinds of case, each read from its owner through a read-only, EXECUTIVE-only endpoint:
  complaints (`GET /api/auth/executive/reports`), tickets (`GET /api/support/executive/tickets`)
  and disputes (`GET /api/orders/executive/disputes`). Filters: kind (ทั้งหมด or one kind) and
  period (วันนี้ default, 7, 15, 30 วัน, or กำหนดเอง from–to); one kind adds its own status,
  category/type and priority filters. A service that is down is named and its count reads
  "ไม่พร้อมใช้งาน". Every row has "รายละเอียด": complaints as before; tickets show who opened
  it and when, the product (only when linked to an order), status, who took the case, who
  handled it with their team in brackets, the action and reason; disputes show buyer, shop,
  product, order, type, priority, status, assignee and the decision or the SLA due time
  (`GET /api/support/executive/tickets/:id`, `GET /api/orders/executive/disputes/:id`). Names and
  staff roles come from auth-service `POST /internal/users/display-names`; evidence, chat and
  notes are never returned. The repeat-complaint warning stays (partial `UR-30`, `CEO-004`).

## Scope notes / deviations

- **`CEO-004` is NOT delivered** (CEO-DEC-011, 2026-10-16): it stays in scope, but there is no
  anomaly-detection rule, no alert worker and no persisted alert state, and it will not be built
  before the deadline. The repeat-complaint warning on the complaints page is what ships; it is
  computed on request and stores nothing.
- **`CEO-005` rescoped (CEO-DEC-016, 2026-10-24).** Delivered as: CSV of the report on
  screen, built in the browser from the figures the owners' series APIs returned, and an
  Executive audit entry (`REPORT_EXPORT_CSV`) for every download. Persisted export jobs,
  expiry and PDF are out of scope by Owner decision.
- `auth-service/prisma/seed.js` no longer seeds demo `Report` rows (removed by Owner). It still
  seeds 4 demo seller accounts + 1 demo executive account (`ceo@example.com`).

## Acceptance evidence

**2026-10-24** (branch `ceo`, after merging `main` at 59360ca, plus the uncommitted
ticket/role and docs changes):

- Frontend executive suites (`components/executive`, `app/executive`, `lib/executive*`):
  **201 passed**; scoped ESLint and Prettier clean
- PostgreSQL integration with `REQUIRE_INTEGRATION=1` on disposable databases: auth
  `internal.test.js` 10/10 (display names + `staffRoles`), support
  `executive-ticket-detail` and `executive-tickets`, order `executive-dispute-detail` — all pass.
  The other executive suites passed on the merged code before this change; all migrations
  (main + executive indexes) apply cleanly with no drift
- Live check through the gateway as `ceo@example.com`: ticket and dispute dialogs show names
  with team in brackets; services rebuilt with `docker compose up -d --build`

**2026-08-26** (kept for history):

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

**Next action:** Reviewer to check `CEO-001`–`CEO-003` and `CEO-005` (as rescoped,
CEO-DEC-016) acceptance evidence; `CEO-004` is recorded as not delivered (CEO-DEC-011)

**2026-08-26 update:** Consolidated the three `/executive/*` routes into one sidebar panel
(same format as CS/Admin's `/workspace`) and reconnected the Complaints tab to real data —
see `changelog.md` "Consolidate into a Panel" for the full rationale, the `{data,meta}`
response-shape bug found and fixed, and updated test evidence. Does not change `CEO-001`–
`CEO-005` status above; this was a UI-consistency and bug-fix pass, not new feature scope.

**2026-10-17 update:** The overview and complaints tabs were rebuilt (see `changelog.md`
"Overview redesign, complaints inbox, hardening" and `decision.md` CEO-DEC-005 to CEO-DEC-014).
Status of the task list is unchanged: `CEO-001`–`CEO-003` delivered, `CEO-004` not delivered
(CEO-DEC-011), `CEO-005` partial at the time (rescoped on 2026-10-24, see below).

**2026-10-24 update:** `CEO-005` rescoped to CSV export + audit log (CEO-DEC-016) and counted
as delivered. Since 2026-10-17: time indexes added for the metric and list queries
(auth `20261024100000_executive_time_indexes`, order
`20261024100000_executive_order_time_index`, support
`20261024100000_executive_ticket_time_index`); the complaints page has ticket and dispute
details dialogs (CEO-DEC-015). The "add indexes before real data volumes" item from 2026-10-17 is done. Still open: the gateway does not refuse `/internal/` paths (they are
guarded by the internal token), and the three tabs have not been checked at phone width. See
`changelog.md` 2026-10-24.
