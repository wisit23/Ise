# Executive Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้บริหารดู KPI, แนวโน้ม, หมวดหมู่ยอดนิยม, alert และ export จากข้อมูลที่ trace กลับได้

**Architecture:** แต่ละ owner service เปิด read-only aggregate endpoint; Executive UI compose ผลผ่าน Gateway ไม่มี cross-database query และแสดง partial/unavailable แยกจากค่าศูนย์

**Tech Stack:** Express, Prisma aggregates, Next.js charts, CSV/PDF export, Node/Jest tests

## Global Constraints

- Owner: อัสนัย; Reviewer: ศิวกร
- Trace: `UR-27`–`UR-31`, `UC-13`
- Executive เป็น read-only Role; ห้าม reuse Seller dashboard เป็นหลักฐาน
- Metric definitions/version/timezone ต้องปรากฏใน response

---

## Requirement Traceability

| Requirement                                  | Task                 |
| -------------------------------------------- | -------------------- |
| `UR-27` GMV/revenue/users                    | `CEO-001`, `CEO-002` |
| `UR-28` monthly/yearly comparison            | `CEO-001`, `CEO-002` |
| `UR-29` top products/categories              | `CEO-003`            |
| `UR-30` abnormal transaction/complaint alert | `CEO-004`            |
| `UR-31` one-click report export              | `CEO-005`            |

### Task CEO-001: Metric Definitions and Provider Endpoints

**Files:**

- Create: `backend/services/auth-service/src/features/metrics/userMetrics.js`
- Create: `backend/services/order-service/src/features/metrics/platformMetrics.js`
- Create: `backend/services/product-service/src/features/metrics/catalogMetrics.js`
- Test: `backend/services/order-service/test/platform-metrics.integration.test.js`

**Interfaces:**

- Produces: `GET /api/*/executive/metrics?from&to&timezone`
- Produces: `ExecutiveMetricPoint` from `../integration.md`

- [ ] **Step 1: Write failing fixture-based GMV/revenue/user tests**

```js
assert.deepEqual(metrics, {
  gmv: 3000,
  platformRevenue: 300,
  completedOrders: 2,
});
```

- [ ] **Step 2: Run integration tests; confirm protected aggregate endpoints missing**
- [ ] **Step 3: Implement owner-local aggregates and metadata**

```js
{ data, meta: { definitionVersion: "v1", timezone: "Asia/Bangkok", from, to } }
```

- [ ] **Step 4: Verify non-Executive `403`, cancelled exclusion and boundary timestamps**
- [ ] **Step 5: Update docs and commit `feat(executive): add governed metrics`**

### Task CEO-002: Executive Dashboard and Comparisons

**Files:**

- Create: `frontend/app/executive/page.js`
- Create: `frontend/components/executive/MetricCard.js`
- Create: `frontend/components/executive/TrendChart.js`
- Test: `frontend/app/executive/executive.test.js`

**Interfaces:** Consumes three provider metric responses and preserves `unavailable` state

- [ ] **Step 1: Write failing KPI/month/year/partial-state tests**
- [ ] **Step 2: Run Jest and confirm route/components missing**
- [ ] **Step 3: Implement parallel fetch with per-provider result state**

```js
const results = await Promise.allSettled([
  fetchUsers(),
  fetchOrders(),
  fetchCatalog(),
]);
```

- [ ] **Step 4: Verify keyboard/chart labels, mobile layout and one-provider failure**
- [ ] **Step 5: Update docs and commit `feat(executive): add KPI dashboard`**

### Task CEO-003: Top Products and Categories

**Files:**

- Create: `backend/services/product-service/src/features/metrics/topCatalog.js`
- Create: `frontend/components/executive/TopCategories.js`
- Test: `backend/services/product-service/test/top-catalog.integration.test.js`

**Interfaces:** Consumes completed-sale facts; produces ranked `{id, label, count, gmv}`

- [ ] **Step 1: Write failing top-10/tie/category/date tests**
- [ ] **Step 2: Run integration test; confirm aggregate missing**
- [ ] **Step 3: Implement deterministic rank with stable tie-break**

```js
rows.sort(
  (a, b) =>
    b.gmv - a.gmv || b.count - a.count || a.label.localeCompare(b.label),
);
```

- [ ] **Step 4: Verify removed products retain historical label and filters**
- [ ] **Step 5: Update docs and commit `feat(executive): add catalog rankings`**

### Task CEO-004: Extended Anomaly Alerts

**Files:**

- Create: `backend/services/review-service/src/features/alerts/anomalyRule.js`
- Create: `backend/services/review-service/src/features/alerts/alertWorker.js`
- Test: `backend/services/review-service/src/features/alerts/anomalyRule.test.js`

**Interfaces:** Produces `executive.alert.created.v1` from explicit threshold/version

- [ ] **Step 1: Write failing threshold/deduplication/recovery tests**
- [ ] **Step 2: Run tests; confirm rule/worker absent**
- [ ] **Step 3: Implement deterministic rule with alert fingerprint**

```js
function alertFingerprint({ ruleId, bucketStart }) {
  return `${ruleId}:${bucketStart.toISOString()}`;
}
```

- [ ] **Step 4: Verify replay, quiet period, false zero and permission**
- [ ] **Step 5: Update docs and commit `feat(executive): add anomaly alerts`**

### Task CEO-005: Extended CSV/PDF Export

**Files:**

- Create: `backend/services/review-service/src/features/exports/exportRoutes.js`
- Create: `backend/services/review-service/src/features/exports/exportService.js`
- Test: `backend/services/review-service/test/executive-export.integration.test.js`

**Interfaces:** `POST /api/reviews/executive/exports {format, from, to, category}`

- [ ] **Step 1: Write failing permission/size/formula-injection tests**
- [ ] **Step 2: Run integration test; confirm export route absent**
- [ ] **Step 3: Implement bounded async export with escaped CSV cells**

```js
function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
```

- [ ] **Step 4: Verify expiry, audit, 10-second target on agreed fixture and cleanup**
- [ ] **Step 5: Update docs and commit `feat(executive): add governed exports`**
