# Marketing Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ Marketing สร้าง อนุมัติ เผยแพร่ และวัดผล Campaign ได้โดยไม่ข้าม Order/Product ownership

**Architecture:** Campaign module อยู่แยกภายใน Product service; Order เก็บ attribution ตอน checkout และส่ง completed event Marketing dashboard อ่าน aggregate ไม่อ่าน Order database โดยตรง

**Tech Stack:** Express, Prisma/PostgreSQL, Redis events, Next.js, Node/Jest tests

## Global Constraints

- Owner: ศิวกร; Reviewer: อัสนัย
- Trace: `UR-08`–`UR-16`, `UC-12`
- Campaign approval เป็น functional workflow; production authorization hardening ทำภายหลัง
- Campaign, attribution snapshot, metrics, segment/content และ auction data ต้อง persist
  ใน PostgreSQL จริง ห้ามใช้ mock/in-memory database เป็น acceptance evidence
- `NFR-SP-*` และ `NFR-CP-*` เป็น Deferred Security Phase
- Conversion = completed attributed orders ไม่ใช่ clicks

---

## Requirement Traceability

| UR      | Functional Requirement                         | Active/Deferred NFR                       | Workflow                               | Task / Phase                           |
| ------- | ---------------------------------------------- | ----------------------------------------- | -------------------------------------- | -------------------------------------- |
| `UR-08` | `FR-5.1.1`                                     | `NFR-U-01`                                | `WF-11`                                | `MKT-003` / Core                       |
| `UR-09` | `FR-5.1.2`                                     | `NFR-U-01`                                | `WF-11`                                | `MKT-003` / Core                       |
| `UR-10` | `FR-1.1.4`, `FR-1.3.5`, `FR-4.2.6`, `FR-5.2.5` | `NFR-M-03`                                | ไม่มี Workflow ประมูลเฉพาะใน Req Doc   | `MKT-005` / Extended                   |
| `UR-11` | ไม่มี FR เฉพาะสำหรับ Swipe ใน Req Doc          | `NFR-M-03`                                | `WF-03`                                | `MKT-005` + Buyer `BUY-005` / Extended |
| `UR-12` | `FR-5.1.2`, `FR-5.1.3`                         | `NFR-U-01`                                | `WF-11`                                | `MKT-003` / Core                       |
| `UR-13` | `FR-5.1.4`                                     | `NFR-SC-03`; `NFR-SP-02` (Security Phase) | `WF-11`                                | `MKT-004` / Extended                   |
| `UR-14` | `FR-5.2.3`                                     | `NFR-U-02`                                | ไม่มี Workflow community-content เฉพาะ | `MKT-004` / Extended                   |
| `UR-15` | `FR-5.2.1`                                     | `NFR-SP-01` (Security Phase)              | `WF-11`                                | `MKT-001`, `MKT-002` / Core            |
| `UR-16` | `FR-5.2.2`                                     | `NFR-SP-01`, `NFR-SP-03` (Security Phase) | `WF-11`                                | `MKT-002` / Core                       |

### PostgreSQL acceptance for Marketing

- `MKT-001`: Campaign lifecycle/date/discount/version persists in `reloop_product`
- `MKT-002`: approval/publish result is read from persisted Campaign state
- `MKT-003`: Order attribution snapshot persists in `reloop_order`; metrics rebuild from persisted facts
- `MKT-004`: segment rule/content revision/status persists in the owner database
- `MKT-005`: auction event, approved listing and bids persist in `reloop_product`
- `UR-08`: User analytics (active users, new users, hourly usage, peak hour) aggregate in `reloop_auth` (Auth Service); active users from `LoginLog` + `BuyerActivityLog`, new users from `User`, gap-filled hourly buckets, deterministic peak hour, no PII.
- `Marketing Audit Trail`: Append-only audit logs persist in `reloop_product` (`MarketingAuditLog`); atomic transactions with business mutations in Campaign, Auction, and Article; deterministic `idempotencyKey` for SYSTEM retryable actions; zero client write API.
- Database tests run with `REQUIRE_INTEGRATION=1`; an unavailable database must fail, not skip

### Task MKT-001: Campaign Domain and Lifecycle

**Files:**

- Create: `backend/services/product-service/src/features/campaigns/campaignRoutes.js`
- Create: `backend/services/product-service/src/features/campaigns/campaignService.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Test: `backend/services/product-service/test/campaign.integration.test.js`

**Interfaces:**

- Produces: `CampaignSummary` จาก `../integration.md`
- Produces: `POST /api/products/campaigns`, `PATCH /:id`, `POST /:id/submit`

- [x] **Step 1: Write failing lifecycle/date/discount tests**

```js
assert.equal(canTransition("draft", "pending_approval"), true);
assert.equal(canTransition("published", "draft"), false);
```

- [x] **Step 2: Run Campaign integration test; confirm schema/routes missing**
- [x] **Step 3: Implement draft and validated transition service**

```js
const CAMPAIGN_TRANSITIONS = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: ["published"],
  published: ["ended"],
};
```

- [x] **Step 4: Verify invalid date, negative discount, ownership, claim unique constraint and smart filter**
- [x] **Step 5: Update docs and commit `feat(marketing): add campaign lifecycle & voucher wallet`**

### Task MKT-002: Review, Preview and Publish Workspace

**Files:**

- Create: `frontend/app/marketing/campaigns/page.js`
- Create: `frontend/app/marketing/campaigns/[id]/page.js`
- Modify: `backend/services/product-service/src/features/campaigns/campaignRoutes.js`
- Test: `frontend/app/marketing/campaigns/campaigns.test.js`

**Interfaces:**

- Produces: approval commands requiring `campaign:approve`
- Consumes: published Campaign in Buyer catalog

- [x] **Step 1: Write failing permission/preview/publish tests**
- [x] **Step 2: Run backend/Jest tests and confirm missing workspace**
- [x] **Step 3: Implement server-derived preview and separate approve/publish actions**

```js
router.post(
  "/:id/approve",
  requirePermission("campaign:approve"),
  approveCampaign,
);
router.post(
  "/:id/publish",
  requirePermission("campaign:publish"),
  publishCampaign,
);
```

- [x] **Step 4: Verify self-approval policy, expired campaign and unauthorized direct URL**
- [x] **Step 5: Update docs and commit `feat(marketing): add campaign workspace`**

### Task MKT-003: Attribution and Conversion Dashboard

**Status note:** Source implementation exists in `backend/services/product-service/src/features/campaigns/campaignMetrics.js`, `frontend/components/marketing/sections/DashboardSection.js`, and `test/campaignMetrics.test.js` (Campaign Metrics 13 test cases โดยไม่รวม parent suite ของ node:test; historical baseline: 7/7, then 10/10). Order completed dispatch is wired in `orderController.js`. Real cross-service Prisma-backed database persistence in `reloop_order` / `reloop_product` verified across PostgreSQL integration suites.

**Files:**

- Modify: `backend/services/order-service/prisma/schema.prisma`
- Create: `backend/services/order-service/src/features/attribution/attributionService.js`
- Create: `backend/services/product-service/src/features/campaigns/campaignMetrics.js`
- Modify: `backend/services/auth-service/src/app.js`
- Create: `backend/services/auth-service/src/features/metrics/activityMetrics.js`
- Create: `backend/services/auth-service/src/features/metrics/marketingMetricsController.js`
- Create: `backend/services/auth-service/src/features/metrics/marketingMetricsRoutes.js`
- Modify: `frontend/lib/api.js`
- Modify: `frontend/components/marketing/sections/DashboardSection.js`
- Create: `frontend/app/marketing/dashboard/page.js`
- Test: `backend/services/order-service/test/campaign-attribution.integration.test.js`
- Test: `backend/services/product-service/test/campaignMetrics.test.js`
- Test: `backend/services/auth-service/src/features/metrics/activityMetrics.test.js`
- Test: `backend/services/auth-service/test/user-analytics.integration.test.js`
- Test: `backend/gateway/src/marketing-analytics.cross-service.test.js`
- Test: `frontend/components/marketing/sections/DashboardSection.test.js`
- Test: `frontend/lib/api.test.js`

**Interfaces:**

- Consumes: campaign validation endpoint at checkout
- Produces: immutable Order fields `campaignId`, `discountAmount`, `finalPrice`
- Consumes: `order.completed.v1` with attribution snapshot
- Produces: `GET /api/auth/marketing/analytics/user-usage` (UR-08 Marketing User Usage Analytics)

- [x] **Step 1: Write completed-vs-click conversion and metrics unit tests** (`test/campaignMetrics.test.js`, Campaign Metrics 13 test cases โดยไม่รวม parent suite ของ node:test; historical baseline: 10/10)
- [x] **Step 2: Verify source implementation exists** (`campaignMetrics.js`, `DashboardSection.js`, `productClient.js`)
- [x] **Step 3: Snapshot validated discount and consume idempotent completion event** (`POST /internal/campaigns/events/order-completed`)
- [x] **Step 4: Verify cross-service PostgreSQL persistence in `reloop_order` / `reloop_product`** (Verified with `REQUIRE_INTEGRATION=1` in `product-service/test/campaign-attribution.integration.test.js` [10/10 tests passing] and `order-service/test/campaign-attribution.integration.test.js` [6/6 tests passing])
- [x] **Step 5: Implement and verify UR-08 Marketing User Analytics in Auth Service and Marketing Dashboard** (Verified via `activityMetrics.test.js` [7/7 passing], `marketing-analytics.cross-service.test.js` [2/2 passing 100% on live PostgreSQL; historical initial: 1/1], `user-analytics.integration.test.js` [1/1 passing without skips with `REQUIRE_INTEGRATION=1`], and frontend Jest tests [30/30 passing across `DashboardSection.test.js` and `api.test.js`; historical initial: 17/17])
- [ ] **Step 6: Update docs and commit `feat(marketing): measure campaign conversion & user analytics`** (Implementation, integration verification, and documentation complete; commit pending explicit user instruction)

### Task MKT-004: Extended Segmentation and Content

**Part A: Knowledge Base & Educational Articles System (UR-14 / FR-5.2.3 / ST-MKT-05) [COMPLETED]**

- Model: `Article` in `reloop_product` with `ArticleStatus` (`draft`, `published`, `archived`)
- Search: PostgreSQL `pg_trgm` GIN Trigram index + `GREATEST(word_similarity(q, search_text), similarity(q, search_text))` + `ILIKE` fallback (baseline search algorithm matching `MOCK-TRADE-011`)
- APIs: Public `GET /api/products/articles`, `GET /:id` / Marketing `GET /marketing/all`, `POST /`, `PUT /:id`, `DELETE /:id`
- UI: Public `/articles`, `/articles/[id]`, Navbar discovery link, Marketing dashboard tab `ArticlesSection` in `/marketing`
- Status: Completed, verified with Jest tests (41/41 passing) and Next.js static build (24/24 pages)

**Part B: Buyer Segmentation Rules (UR-13 / FR-5.1.4)**
**Status note:** Source implementation exists in `backend/services/product-service/src/features/segments/segmentRule.js`, unit tested via `segmentRule.test.js` (7/7 passing), and integrated into public campaign listings (`listAvailablePublicCampaigns`, `getApplicableVouchers`). End-to-end buyer profile persistence hardening is scheduled for Part 4.

**Files:**

- Create: `backend/services/product-service/src/features/segments/segmentRule.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Test: `backend/services/product-service/src/features/segments/segmentRule.test.js`

**Interfaces:** Produces deterministic `matchesSegment(profile, rule)`

- [x] **Step 1: Write segment rule unit tests** (`segmentRule.test.js`, 7/7 passing)
- [x] **Step 2: Verify source implementation exists** (`segmentRule.js` matching whitelist fields and operators)
- [x] **Step 3: Implement deterministic fields and evaluation** (`favoriteCategory`, `preferredSize`, `styleTag`, `brandPreference`)
- [ ] **Step 4: Verify end-to-end Buyer profile persistence hardening** (Pending Part 4)
- [ ] **Step 5: Update docs and commit `feat(marketing): add segmentation`** (Pending Part 4)

### Task MKT-005: Extended Auction and Swipe Contracts

**Refactored source baseline & UR-11 Hardening (Automated Acceptance Verified):** ProductVideo provider แยก
route/controller/service/repository, feed แสดง Product `available` เท่านั้น, seller identity
มาจาก signed JWT และ Swipe UI มี component/tests/per-active-video playback ครบถ้วนแล้ว
สำหรับการเลือกการ์ดสินค้า (`UR-11` Swipe-to-Choose) ได้รับการ Hardening และผ่านการทดสอบอัตโนมัติครบทุกระดับ:
Buyer-only authorization (403 Forbidden สำหรับ Role อื่น, 401 Unauthorized สำหรับผู้ไม่ล็อกอิน),
Server-side persistence พร้อม Batch Query relation บน `reloop_product` (ไม่มีปัญหา N+1 query),
User isolation (แยกสถานะ chosen รายบุคคล, Guest คืน chosen: false),
Anti-spoofing บน API Gateway และ Public route (ห้ามเชื่อถือ client x-user-* header เมื่อไม่มี Bearer token),
Idempotent choose, ป้องกัน 500 error ใน safe unchoose, และ Frontend optimistic rollback
ผ่านการทดสอบ Backend/Gateway (29/29 tests), Frontend Swipe (3/3 suites, 42/42 tests), และ PostgreSQL Integration (`REQUIRE_INTEGRATION=1`, 1/1 suite);
ทั้งนี้ Browser E2E / Responsive UI verification บนเบราว์เซอร์จริงยังไม่ได้ดำเนินการและคงสถานะเป็น Final Acceptance ที่รอดำเนินการ

**Files:**

- Create: `backend/services/product-service/src/features/auctions/auctionService.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Create: `backend/services/product-service/src/features/product-videos/`
- Modify: `backend/services/product-service/src/routes/productRoutes.js`
- Modify: `backend/gateway/src/app.js`
- Create: `frontend/app/auctions/page.js`
- Modify: `frontend/app/swipe/page.js`
- Create: `frontend/components/swipe/SwipeFeedViewer.js`
- Create: `frontend/components/swipe/SwipeVideoCard.js`
- Test: `backend/services/product-service/test/auction.integration.test.js`
- Test: `backend/services/product-service/test/product-crud.integration.test.js`
- Test: `frontend/app/swipe/page.test.js`

**Interfaces:** Seller/Product provides video upload/feed; Buyer consumes public Swipe UI; Marketing owns
`UR-11` acceptance and auction scheduling; Admin approves auction items

- [x] **Step 1: Freeze “Swipe-to-Choose” semantics, then write failing schedule/approval/late-bid and swipe contract tests**
- [x] **Step 2: Run tests; confirm auction module missing and pulled Swipe baseline lacks persisted choose behavior**
- [x] **Step 3: Implement server-time state machine and idempotent bid command**

```js
async function placeBid({ eventId, bidderId, amount, idempotencyKey, now }) {
  return createBidExactlyOnce({
    eventId,
    bidderId,
    amount,
    idempotencyKey,
    now,
  });
}
```

- [x] **Step 4: Verify unapproved item denial, tie rule, close race, allowed feed Product states, identity source and swipe fallback**
  - **Auction Unit Tests:** `node -r ./scripts/test-shim.js --test backend/services/product-service/src/features/auctions/auctionService.test.js` (48/48 tests passing, including 7 idempotency scoping tests and 9 round overlap/phase/selection tests; 0 live DB/Redis dependency via `dummyPrisma`)
  - **Auction Frontend Tests:** `npm --prefix frontend test -- components/marketing/sections/AuctionScheduleSection.test.js` (7/7 tests passing, covering focused `RoundManagementSection` tests: current/upcoming round display, all-round history table, phase badges, empty state, 409 Conflict error banner, refresh on creation, and parent `AuctionScheduleSection` with explicitly mocked API calls)
  - **Auction Integration Tests:** `$env:REQUIRE_INTEGRATION="1"; $env:REDIS_URL="redis://localhost:6379"; node -r ./scripts/test-shim.js --test backend/services/product-service/test/auction.integration.test.js` (11/11 tests across 10 steps passing against live PostgreSQL & Redis, verifying lifecycle, concurrency, soft close, BullMQ worker, safe idempotency scoping, and Step 10: round overlap protection with `pg_advisory_xact_lock(1001, 1)`, back-to-back success, deterministic selection with `fakeNow`, and concurrent conflict 409)
  - **UR-11 Swipe Hardening Tests:**
    - **Backend & Gateway Targeted Tests:** 29/29 tests passing 100%
      - Gateway App Tests (`backend/gateway/src/app.test.js`): 5/5 tests (covering Gateway auth routing and public routes; gateway header stripping verified via implementation review and lint, dedicated automated test pending)
      - Product Service App Tests (`backend/services/product-service/src/app.test.js`): 10/10 tests
      - Product Video Repository Tests (`backend/services/product-service/src/features/product-videos/productVideoRepository.test.js`): 2/2 tests (Guest chosen: false, User-specific chosen, no choices relation leak)
      - Product Video Service Tests (`backend/services/product-service/src/features/product-videos/productVideoService.test.js`): 12/12 tests (403 for SELLER/MARKETING/ADMIN, Multi-role BUYER, pagination forwarding)
      - Total Backend & Gateway Targeted Tests: 5 + 10 + 2 + 12 = 29 tests
    - **Frontend Swipe Component Tests:** 3/3 suites, 42/42 tests passing 100% (`SwipeVideoCard.test.js` 28/28, `SwipeFeedViewer.test.js` 8/8, `page.test.js` 6/6)
    - **PostgreSQL Integration Test:** `swipe-choose.integration.test.js` 1/1 suite (10 verification assertions) passing 100% with `REQUIRE_INTEGRATION=1` without skips against live `reloop_product`
    - **Quality Checks:** `npm run lint` passing (0 errors, 0 warnings), `npm run format:check` passing, `git diff --check` passing
    - **Acceptance Note:** Browser E2E / Responsive UI verification on real browsers is pending final acceptance
- [ ] **Step 5: Update docs and commit `feat(marketing): add auction and swipe experience`** (Docs updated in `plan.md`, `progress.md`, `handoff.md`, `changelog.md`, and `teachme.md`; commit pending explicit user instruction)

### Task MKT-006: Server-Side Voucher Quote-and-Hold, Concurrency Guard & Admin Decoupling

**Files:**

- Modify: `backend/services/product-service/src/features/campaigns/internalCampaignRoutes.js`
- Modify: `backend/services/product-service/src/features/campaigns/campaignController.js`
- Modify: `backend/services/product-service/src/features/campaigns/campaignService.js`
- Modify: `backend/services/order-service/src/features/checkout/checkoutService.js`
- Modify: `backend/services/order-service/src/services/productClient.js`
- Modify: `backend/services/product-service/src/routes/uploadRoutes.js`
- Test: `backend/services/product-service/test/campaign.integration.test.js`
- Test: `backend/services/order-service/src/features/checkout/checkoutService.test.js`

**Interfaces:**

- Produces: Internal `POST /internal/campaigns/:id/quote-and-hold` with `x-internal-token` guard
- Produces: Atomic voucher hold via `prisma.userVoucher.updateMany` with 409 Conflict guard
- Consumes: Pre-generated `orderId` with two-way compensation (`releaseVoucher` + `releaseProductReservation`)
- Enforces: Admin role decoupling (403 Forbidden on marketing routes and uploads per `MKT-DEC-014` / `ADM-DEC-017`)

- [x] **Step 1: Write failing quote-and-hold, price-tampering, and compensation tests**
- [x] **Step 2: Implement server-side 10-rule verification in `campaignService.js`**
- [x] **Step 3: Implement atomic hold in `campaignRepository.js` and compensation in `checkoutService.js`**
- [x] **Step 4: Verify price-tampering rejection, concurrency 409, public hold/release/complete closure, and Admin 403**
- [ ] **Step 5: Update docs and commit `feat(marketing): server-side quote-and-hold & admin decoupling`** (Implementation and docs complete; commit pending explicit user instruction)

### Task MKT-007: Campaign Attribution Engine, Metrics Dashboard & Count Semantics

**Files:**

- Create: `backend/services/product-service/src/features/campaigns/campaignMetrics.js`
- Modify: `backend/services/order-service/src/services/productClient.js`
- Modify: `backend/services/order-service/src/controllers/orderController.js`
- Modify: `frontend/components/marketing/sections/DashboardSection.js`
- Test: `backend/services/product-service/test/campaignMetrics.test.js`

**Interfaces:**

- Produces: Distinct `claimedCount` (voucher wallet collection) vs `redeemedCount` (completed orders)
- Consumes: `order.completed.v1` via internal `POST /internal/campaigns/events/order-completed`
- Produces: Idempotent attribution ingestion with `campaign_attributions` fact model (in-memory fallback for unit tests)
- Produces: Marketing Metrics APIs (`/metrics/overview`, `/metrics/trends`, `/metrics/compare`, `/:id/metrics`) with date range validation
- Produces: Marketing Dashboard UI with 6 KPI cards, trend bar chart, and campaign comparison table

- [x] **Step 1: Write unit tests for attribution ingestion, count semantics, date range validation, and conversion calculations** (`campaignMetrics.test.js`, Campaign Metrics 13 test cases โดยไม่รวม parent suite ของ node:test; historical baseline: 10/10)
- [x] **Step 2: Implement `campaignMetrics.js` backend engine and REST endpoints in `campaignController.js`**
- [x] **Step 3: Implement `DashboardSection.js` UI with real-time KPI metrics, date range filters, and comparison table**
- [x] **Step 4: Verify real PostgreSQL cross-service persistence in `reloop_order` / `reloop_product`** (Verified with `REQUIRE_INTEGRATION=1` across three suites: Product Service isolated suite [12 subtests], Order Service Outbox isolated suite [6 subtests], and Genuine Cross-Service suite [9 subtests querying both `reloop_order` and `reloop_product` over live HTTP, covering full order completion, deduplication, identity & attribute conflicts, failure backoff, worker sweep, and no-campaign bypass])
- [x] **Step 5: Update docs and finalize Task 1 completion** (Implementation, cross-service integration verification across both PostgreSQL databases in reproducible repository test environment, and documentation complete; commit pending explicit user instruction)

### Task UR-08: User/Peak-Usage Analytics for Marketing

**Files:**

- Create: `backend/services/auth-service/src/features/metrics/activityMetrics.js`
- Modify: `backend/services/auth-service/src/routes/marketingMetricsRoutes.js`
- Modify: `backend/gateway/src/app.js`
- Modify: `frontend/lib/api.js`
- Modify: `frontend/components/marketing/sections/DashboardSection.js`
- Test: `backend/services/auth-service/src/features/metrics/activityMetrics.test.js`
- Test: `backend/services/auth-service/test/user-analytics.integration.test.js`
- Test: `backend/gateway/src/marketing-analytics.cross-service.test.js`
- Test: `frontend/components/marketing/sections/DashboardSection.test.js`
- Test: `frontend/lib/api.test.js`

**Interfaces:**

- Produces: `GET /api/auth/marketing/analytics/user-usage` with `from`, `to`, `timezone` query parameters
- Timezone contract: `Asia/Bangkok` (+07:00) strictly enforced; rejects unsupported timezones with HTTP 400 Bad Request
- Boundary semantics: Half-open interval `[from, to)` (UI converts inclusive date to exclusive next-day Bangkok midnight)
- Service boundary: `Auth Service` owns User & activity data (`LoginLog`, `BuyerActivityLog`, `User`); no direct cross-database queries
- Produces: Whitelisted aggregate projection (activeUsers, newUsers, peakHour, hourlyUsage) with zero PII
- Produces: Marketing Dashboard section with 3 KPI cards, peak hour, hourly chart, honest error state (displays `—` and `ไม่พร้อมใช้งาน`, not 0), and retry capability

- [x] **Step 1: Write unit tests for activityMetrics engine, Asia/Bangkok date parsing, gap filling, deterministic peak hour, and PII prevention** (`activityMetrics.test.js`, 7/7 passing 100%)
- [x] **Step 2: Implement activityMetrics engine with PostgreSQL timezone conversion `(activity_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'`**
- [x] **Step 3: Implement Gateway proxy with untrusted header stripping and JWT verification; implement frontend DashboardSection with honest error state, Thai date boundary conversion, and retry**
- [x] **Step 4: Verify against live PostgreSQL with `REQUIRE_INTEGRATION=1` without skips** (`user-analytics.integration.test.js` 1/1 passing 100%; `marketing-analytics.cross-service.test.js` 2/2 passing 100% asserting HTTP 200 OK via Gateway -> Auth Service -> PostgreSQL, Bangkok timezone, no PII, 401/403 security, and DB error propagation)
- [x] **Step 5: Verify frontend test suite and quality gates** (`DashboardSection.test.js` + `api.test.js` 30/30 passing 100%; `npm run lint` and `npm run format:check` clean; commit pending explicit user instruction)

### Task MKT-AUDIT: Marketing Audit Trail (Append-Only Immutable Ledger)

**Files:**

- Modify: `backend/services/product-service/prisma/schema.prisma`
- Create: `backend/services/product-service/src/features/audit/marketingAuditSanitizer.js`
- Create: `backend/services/product-service/src/features/audit/marketingAuditRepository.js`
- Create: `backend/services/product-service/src/features/audit/marketingAuditService.js`
- Create: `backend/services/product-service/src/features/audit/marketingAuditController.js`
- Create: `backend/services/product-service/src/features/audit/marketingAuditRoutes.js`
- Modify: `backend/services/product-service/src/routes/productRoutes.js`
- Modify: `backend/services/product-service/src/features/campaigns/campaignRepository.js`
- Modify: `backend/services/product-service/src/features/campaigns/campaignService.js`
- Modify: `backend/services/product-service/src/features/auctions/auctionRepository.js`
- Modify: `backend/services/product-service/src/features/auctions/auctionService.js`
- Modify: `backend/services/product-service/src/models/articleModel.js`
- Modify: `backend/services/product-service/src/controllers/articleController.js`
- Modify: `frontend/lib/api.js`
- Create: `frontend/components/marketing/sections/AuditTrailSection.js`
- Modify: `frontend/app/marketing/page.js`
- Test: `backend/services/product-service/src/features/audit/marketingAuditService.test.js`
- Test: `backend/services/product-service/test/marketing-audit.integration.test.js`
- Test: `frontend/components/marketing/sections/AuditTrailSection.test.js`
- Test: `frontend/app/marketing/page.test.js`

**Interfaces:**

- Model: `MarketingAuditLog` mapped to `marketing_audit_logs` in `reloop_product`
- 18 Actions Whitelisted: `CAMPAIGN_CREATE`, `CAMPAIGN_UPDATE`, `CAMPAIGN_SUBMIT`, `CAMPAIGN_APPROVE`, `CAMPAIGN_REJECT`, `CAMPAIGN_PUBLISH`, `CAMPAIGN_END`, `AUCTION_ROUND_CREATE`, `AUCTION_ITEM_APPROVE`, `AUCTION_ITEM_REJECT`, `AUCTION_ITEM_SCHEDULE`, `AUCTION_ITEM_CANCEL`, `AUCTION_ITEM_CLOSE`, `ARTICLE_CREATE`, `ARTICLE_UPDATE`, `ARTICLE_PUBLISH`, `ARTICLE_ARCHIVE`, `ARTICLE_DELETE`
- Read-only Endpoint: `GET /api/products/marketing/audit-logs` (Gateway) and `GET /marketing/audit-logs` (Direct) with query filters (`entityType`, `action`, `actorId`, `from`, `to`, `page`, `limit`)
- RBAC: Guarded by `requireAuth` + `requireMarketingAccess` (role: `MARKETING` only; `BUYER`, `SELLER`, `ADMIN` return 403 Forbidden per `MKT-DEC-014`; permission bypass blocked)
- Security: Zero client-facing write/update/delete endpoints; recursive credential sanitization; SYSTEM actor determinism with unique `idempotencyKey` via `createMany({ skipDuplicates: true })` + `findUnique` (no 25P02 transaction abort)

- [x] **Step 1: Write unit tests for sanitizer, audit service, and validation** (`marketingAuditService.test.js`, 6/6 passing 100%)
- [x] **Step 2: Add Prisma model `MarketingAuditLog` and push to PostgreSQL `reloop_product`**
- [x] **Step 3: Wire business mutations into atomic database transactions with audit writes across Campaign, Auction, and Article**
- [x] **Step 4: Implement read-only REST endpoint and Next.js UI component `AuditTrailSection` with details modal, filters, and pagination**
- [x] **Step 5: Verify real PostgreSQL integration suite (`REQUIRE_INTEGRATION=1`) and frontend Jest tests** (`marketing-audit.integration.test.js` 11/11 passing 100% [1 parent suite + 10 subtests]; `AuditTrailSection.test.js` [13/13] + `page.test.js` [6/6] = 19/19 passing 100%; regression suites clean; commit pending explicit user instruction)

### Task MKT-BUDGET-DATE: Campaign Date Validation and Budget Tracking with Auto-End (MKT-DEC-023)

**Files:**

- Modify: `backend/services/product-service/prisma/schema.prisma`
- Modify: `backend/services/product-service/src/features/campaigns/campaignRepository.js`
- Modify: `backend/services/product-service/src/features/campaigns/campaignService.js`
- Modify: `backend/services/product-service/src/features/campaigns/campaignMetrics.js`
- Modify: `frontend/components/marketing/sections/CampaignsSection.js`
- Test: `backend/services/product-service/test/campaignValidation.test.js`
- Test: `backend/services/product-service/test/campaignMetrics.test.js`
- Test: `backend/services/product-service/test/campaign-budget.integration.test.js`
- Test: `backend/services/product-service/test/campaign.integration.test.js`
- Test: `frontend/components/marketing/sections/CampaignsSection.test.js`

**Interfaces:**

- Model: `Campaign` has `spentBudget Int @default(0) @map("spent_budget")` in `reloop_product`
- Validation: Server-side rejection of past dates on create/update and expired endsAt on publish; Thai error messages
- Budget Tracking: Atomic increment of `spentBudget` by `discountAmount` when processing `order.completed.v1` from Outbox; auto-end after completed attribution processing when `spentBudget >= budget` with `SYSTEM` audit log (`reason: "BUDGET_REACHED"`); automatic expiry of `CLAIMED` vouchers; claim/applicable/quote-and-hold post-ended gating (note: not a strict real-time hard cap, overshoot possible on final order)
- UI: HTML `min` on `datetime-local` inputs; pre-submit validation; `"ใช้แล้ว ฿X / ฿Budget"` display with budget progress bar

- [x] **Step 1: Add unit tests for past dates, publish expiry, budget ceiling (below/equal/above), idempotency, and concurrency** (`campaignValidation.test.js` 23/23, `campaignMetrics.test.js` 14/14)
- [x] **Step 2: Add `spent_budget` column to Prisma schema and synchronize database via `prisma db push`**
- [x] **Step 3: Implement server-side date validation, atomic budget increment on order completed event, auto-end trigger, and CLAIMED voucher expiration**
- [x] **Step 4: Update frontend `CampaignsSection.js` with `min` attributes, client validation warnings, and `"ใช้แล้ว ฿X / ฿Budget"` progress display**
- [x] **Step 5: Verify live PostgreSQL integration tests (`REQUIRE_INTEGRATION=1` 0 skips) and frontend test suite** (`campaign-budget.integration.test.js` 6/6, `campaign.integration.test.js` 11/11, `campaign-attribution.integration.test.js` 13/13, `CampaignsSection.test.js` 16/16; Schema active, ER Diagram update pending)
