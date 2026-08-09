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

- [ ] **Step 1: Write failing lifecycle/date/discount tests**

```js
assert.equal(canTransition("draft", "pending_approval"), true);
assert.equal(canTransition("published", "draft"), false);
```

- [ ] **Step 2: Run Campaign integration test; confirm schema/routes missing**
- [ ] **Step 3: Implement draft and validated transition service**

```js
const CAMPAIGN_TRANSITIONS = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: ["published"],
  published: ["ended"],
};
```

- [ ] **Step 4: Verify invalid date, negative discount, ownership and stale version**
- [ ] **Step 5: Update docs and commit `feat(marketing): add campaign lifecycle`**

### Task MKT-002: Review, Preview and Publish Workspace

**Files:**

- Create: `frontend/app/marketing/campaigns/page.js`
- Create: `frontend/app/marketing/campaigns/[id]/page.js`
- Modify: `backend/services/product-service/src/features/campaigns/campaignRoutes.js`
- Test: `frontend/app/marketing/campaigns/campaigns.test.js`

**Interfaces:**

- Produces: approval commands requiring `campaign:approve`
- Consumes: published Campaign in Buyer catalog

- [ ] **Step 1: Write failing permission/preview/publish tests**
- [ ] **Step 2: Run backend/Jest tests and confirm missing workspace**
- [ ] **Step 3: Implement server-derived preview and separate approve/publish actions**

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

- [ ] **Step 4: Verify self-approval policy, expired campaign and unauthorized direct URL**
- [ ] **Step 5: Update docs and commit `feat(marketing): add campaign workspace`**

### Task MKT-003: Attribution and Conversion Dashboard

**Files:**

- Modify: `backend/services/order-service/prisma/schema.prisma`
- Create: `backend/services/order-service/src/features/attribution/attributionService.js`
- Create: `backend/services/product-service/src/features/campaigns/campaignMetrics.js`
- Create: `backend/services/auth-service/src/features/metrics/activityMetrics.js`
- Create: `frontend/app/marketing/dashboard/page.js`
- Test: `backend/services/order-service/test/campaign-attribution.integration.test.js`

**Interfaces:**

- Consumes: campaign validation endpoint at checkout
- Produces: immutable Order fields `campaignId`, `discountAmount`, `finalPrice`
- Consumes: `order.completed.v1` with attribution snapshot

- [ ] **Step 1: Write failing completed-vs-click conversion and replay tests**
- [ ] **Step 2: Run tests; confirm attribution fields/events missing**
- [ ] **Step 3: Snapshot validated discount, record privacy-minimized activity buckets and consume idempotent completion event**

```js
{
  (campaignId, discountAmount, finalPrice, pricingVersion);
}
```

- [ ] **Step 4: Verify expired code, concurrent usage cap, event replay, peak-usage buckets and date filter**
- [ ] **Step 5: Update docs and commit `feat(marketing): measure campaign conversion`**

### Task MKT-004: Extended Segmentation and Content

**Files:**

- Create: `backend/services/product-service/src/features/segments/`
- Create: `backend/services/product-service/src/features/content/`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Create: `frontend/app/marketing/content/page.js`
- Test: `backend/services/product-service/src/features/segments/segmentRule.test.js`

**Interfaces:** Produces deterministic `matchesSegment(profile, rule)` and versioned content publish

- [ ] **Step 1: Write failing segment rule, empty-result and content-version tests**
- [ ] **Step 2: Run tests; confirm modules absent**
- [ ] **Step 3: Implement deterministic fields and draft→published content**

```js
const SEGMENT_FIELDS = ["favoriteCategory", "preferredSize", "styleTag"];

function matchesSegment(profile, rule) {
  return rule.every(
    ({ field, value }) =>
      SEGMENT_FIELDS.includes(field) && profile[field] === value,
  );
}
```

- [ ] **Step 4: Verify empty segment, stale content version, publish role and persisted result**
- [ ] **Step 5: Update docs and commit `feat(marketing): add segmentation and content`**

### Task MKT-005: Extended Auction and Swipe Contracts

**Pulled source baseline (not acceptance):** `ProductVideo`, `GET /videos/feed`, `POST /videos`,
`frontend/app/swipe/page.js` และ seller upload UI มีอยู่ใน source หลัง pull แต่หน้า Swipe
เพียงเลื่อน feed/เปิดรายละเอียดสินค้า ยังไม่มี persisted choose action และยังไม่ผ่าน Marketing
requirement/contract review

**Files:**

- Create: `backend/services/product-service/src/features/auctions/auctionService.js`
- Modify: `backend/services/product-service/prisma/schema.prisma`
- Modify: `backend/services/product-service/src/models/productModel.js`
- Modify: `backend/services/product-service/src/controllers/productController.js`
- Modify: `backend/services/product-service/src/routes/productRoutes.js`
- Modify: `backend/gateway/src/app.js`
- Create: `frontend/app/auctions/page.js`
- Modify: `frontend/app/swipe/page.js`
- Test: `backend/services/product-service/test/auction.integration.test.js`
- Test: `backend/services/product-service/test/product-crud.integration.test.js`
- Test: `frontend/app/swipe/page.test.js`

**Interfaces:** Seller/Product provides video upload/feed; Buyer consumes public Swipe UI; Marketing owns
`UR-11` acceptance and auction scheduling; Admin approves auction items

- [ ] **Step 1: Freeze “Swipe-to-Choose” semantics, then write failing schedule/approval/late-bid and swipe contract tests**
- [ ] **Step 2: Run tests; confirm auction module missing and pulled Swipe baseline lacks persisted choose behavior**
- [ ] **Step 3: Implement server-time state machine and idempotent bid command**

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

- [ ] **Step 4: Verify unapproved item denial, tie rule, close race, allowed feed Product states, identity source and swipe fallback**
- [ ] **Step 5: Update docs and commit `feat(marketing): add auction and swipe experience`**
