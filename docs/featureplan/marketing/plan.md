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

**Status note:** Source implementation exists in `backend/services/product-service/src/features/campaigns/campaignMetrics.js`, `frontend/components/marketing/sections/DashboardSection.js`, and `test/campaignMetrics.test.js` (7/7 passing). Order completed dispatch is wired in `orderController.js`. Real cross-service Prisma-backed database persistence in `reloop_order` / `reloop_product` is pending Part 3 hardening.

**Files:**

- Modify: `backend/services/order-service/prisma/schema.prisma`
- Create: `backend/services/order-service/src/features/attribution/attributionService.js`
- Create: `backend/services/product-service/src/features/campaigns/campaignMetrics.js`
- Create: `backend/services/auth-service/src/features/metrics/activityMetrics.js`
- Create: `frontend/app/marketing/dashboard/page.js`
- Test: `backend/services/order-service/test/campaign-attribution.integration.test.js`
- Test: `backend/services/product-service/test/campaignMetrics.test.js`

**Interfaces:**

- Consumes: campaign validation endpoint at checkout
- Produces: immutable Order fields `campaignId`, `discountAmount`, `finalPrice`
- Consumes: `order.completed.v1` with attribution snapshot

- [x] **Step 1: Write completed-vs-click conversion and metrics unit tests** (`test/campaignMetrics.test.js`, 7/7 passing)
- [x] **Step 2: Verify source implementation exists** (`campaignMetrics.js`, `DashboardSection.js`, `productClient.js`)
- [x] **Step 3: Snapshot validated discount and consume idempotent completion event** (`POST /internal/campaigns/events/order-completed`)
- [ ] **Step 4: Verify cross-service PostgreSQL persistence in `reloop_order` / `reloop_product`** (Attribution DB acceptance pending Part 3 hardening)
- [ ] **Step 5: Update docs and commit `feat(marketing): measure campaign conversion`** (Pending Part 3 hardening)

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

**Refactored source baseline (partial evidence, not acceptance):** ProductVideo provider แยก
route/controller/service/repository, feed แสดง Product `available` เท่านั้น, seller identity
มาจาก signed JWT และ Swipe UI มี component/tests/per-active-video playback แล้ว แต่ยังไม่มี
persisted choose action และยังไม่ผ่าน Marketing requirement/contract review

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
  - **Unit Tests:** `node -r ./scripts/test-shim.js --test backend/services/product-service/src/features/auctions/auctionService.test.js` (48/48 tests passing, including 7 idempotency scoping tests and 9 round overlap/phase/selection tests; 0 live DB/Redis dependency via `dummyPrisma`)
  - **Frontend Tests:** `npm --prefix frontend test -- components/marketing/sections/AuctionScheduleSection.test.js` (7/7 tests passing, covering focused `RoundManagementSection` tests: current/upcoming round display, all-round history table, phase badges, empty state, 409 Conflict error banner, refresh on creation, and parent `AuctionScheduleSection` with explicitly mocked API calls)
  - **Integration Tests:** `$env:REQUIRE_INTEGRATION="1"; $env:REDIS_URL="redis://localhost:6379"; node -r ./scripts/test-shim.js --test backend/services/product-service/test/auction.integration.test.js` (11/11 tests across 10 steps passing against live PostgreSQL & Redis, verifying lifecycle, concurrency, soft close, BullMQ worker, safe idempotency scoping, and Step 10: round overlap protection with `pg_advisory_xact_lock(1001, 1)`, back-to-back success, deterministic selection with `fakeNow`, and concurrent conflict 409)
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

- [x] **Step 1: Write unit tests for attribution ingestion, count semantics, date range validation, and conversion calculations** (`campaignMetrics.test.js`, 7/7 passing)
- [x] **Step 2: Implement `campaignMetrics.js` backend engine and REST endpoints in `campaignController.js`**
- [x] **Step 3: Implement `DashboardSection.js` UI with real-time KPI metrics, date range filters, and comparison table**
- [ ] **Step 4: Verify real PostgreSQL cross-service persistence in `reloop_order` / `reloop_product`** (Attribution DB acceptance pending Part 3 hardening)
- [ ] **Step 5: Update docs and commit `feat(marketing): campaign attribution and metrics dashboard`**
