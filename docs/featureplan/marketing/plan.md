# Marketing Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ Marketing สร้าง อนุมัติ เผยแพร่ และวัดผล Campaign ได้โดยไม่ข้าม Order/Product ownership

**Architecture:** Campaign module อยู่แยกภายใน Product service; Order เก็บ attribution ตอน checkout และส่ง completed event Marketing dashboard อ่าน aggregate ไม่อ่าน Order database โดยตรง

**Tech Stack:** Express, Prisma/PostgreSQL, Redis events, Next.js, Node/Jest tests

## Global Constraints

- Owner: ศิวกร; Reviewer: อัสนัย
- Trace: `UR-08`–`UR-16`, `UC-12`
- Campaign publish ต้องมี permission/approval; discount snapshot เก็บใน Order
- Conversion = completed attributed orders ไม่ใช่ clicks

---

## Requirement Traceability

| Requirement                     | Task                       |
| ------------------------------- | -------------------------- |
| `UR-08` user activity/peak time | `MKT-003`                  |
| `UR-09` campaign conversion     | `MKT-003`                  |
| `UR-10` scheduled auction event | `MKT-005`                  |
| `UR-11` swipe-to-choose         | `MKT-005`, Buyer `BUY-005` |
| `UR-12` marketing KPI dashboard | `MKT-003`                  |
| `UR-13` segmentation            | `MKT-004`                  |
| `UR-14` knowledge content       | `MKT-004`                  |
| `UR-15` promotion management    | `MKT-001`, `MKT-002`       |
| `UR-16` promotion approval      | `MKT-002`                  |

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
- Create: `frontend/app/marketing/content/page.js`
- Test: `backend/services/product-service/src/features/segments/segmentRule.test.js`

**Interfaces:** Produces deterministic `matchesSegment(profile, rule)` and versioned content publish

- [ ] **Step 1: Write failing consent/minimization/segment rule tests**
- [ ] **Step 2: Run tests; confirm modules absent**
- [ ] **Step 3: Implement allowlisted fields and draft→published content**

```js
function matchesSegment(profile, rule) {
  return rule.every(
    ({ field, value }) =>
      ALLOWED_FIELDS.includes(field) && profile[field] === value,
  );
}
```

- [ ] **Step 4: Verify opt-out, empty segment, unauthorized publish and audit**
- [ ] **Step 5: Update docs and commit `feat(marketing): add segmentation and content`**

### Task MKT-005: Extended Auction and Swipe Contracts

**Files:**

- Create: `backend/services/product-service/src/features/auctions/auctionService.js`
- Create: `frontend/app/auctions/page.js`
- Create: `frontend/app/swipe/page.js`
- Test: `backend/services/product-service/test/auction.integration.test.js`

**Interfaces:** Seller submits listing; Admin approves; Buyer bids; Marketing schedules event

- [ ] **Step 1: Write failing schedule/approval/late-bid tests**
- [ ] **Step 2: Run tests; confirm auction module missing**
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

- [ ] **Step 4: Verify unapproved item denial, tie rule, close race and swipe fallback**
- [ ] **Step 5: Update docs and commit `feat(marketing): add auction and swipe experience`**
