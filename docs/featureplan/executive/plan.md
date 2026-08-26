# Executive Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้บริหารดู KPI, แนวโน้ม, หมวดหมู่ยอดนิยม, alert และ export จากข้อมูลที่ trace กลับได้

**Architecture:** แต่ละ owner service เปิด read-only aggregate endpoint; Executive UI compose ผลผ่าน Gateway ไม่มี cross-database query และแสดง partial/unavailable แยกจากค่าศูนย์

**Tech Stack:** Express, Prisma aggregates, Next.js charts, CSV/PDF export, Node/Jest tests

## Global Constraints

- Owner: อัสนัย; Reviewer: ศิวกร
- Trace: `UR-27`–`UR-31`, `UC-13`
- Executive เป็น functional read-only Role; production authorization hardening ทำภายหลัง
- Metrics, alert state และ export job metadata ต้องคำนวณ/อ่านจาก PostgreSQL จริง
  ห้ามใช้ hardcoded dashboard หรือ mock/in-memory database เป็น acceptance evidence
- `NFR-SP-*` และ `NFR-CP-*` เป็น Deferred Security Phase
- Metric definitions/version/timezone ต้องปรากฏใน response

---

## Requirement Traceability

| UR      | Functional Requirement | Active/Deferred NFR                                                            | Workflow | Task / Phase                |
| ------- | ---------------------- | ------------------------------------------------------------------------------ | -------- | --------------------------- |
| `UR-27` | `FR-6.1.1`             | `NFR-P-01`, `NFR-AR-01`, `NFR-U-02`, `NFR-BR-02`; `NFR-SP-01` (Security Phase) | `WF-12`  | `CEO-001`, `CEO-002` / Core |
| `UR-28` | `FR-6.1.2`             | `NFR-SC-02`, `NFR-BR-02`, `NFR-BR-03`                                          | `WF-12`  | `CEO-001`, `CEO-002` / Core |
| `UR-29` | `FR-6.1.3`             | `NFR-U-01`                                                                     | `WF-12`  | `CEO-003` / Core            |
| `UR-30` | `FR-6.2.1`             | `NFR-M-02`; `NFR-SP-03` (Security Phase)                                       | `WF-12`  | `CEO-004` / Extended        |
| `UR-31` | `FR-6.1.4`             | `NFR-P-06`                                                                     | `WF-12`  | `CEO-005` / Extended        |

### PostgreSQL acceptance for Executive

- `CEO-001`: GMV/revenue/user metrics are aggregated from persisted service-owner facts
- `CEO-002`: dashboard fixtures are created through APIs/Prisma and partial state is not a fake zero
- `CEO-003`: rankings rebuild from completed Order/Product facts with deterministic ties
- `CEO-004`: alert fingerprint/status persists in the provider database
- `CEO-005`: export job/status/expiry persists and export content derives from database facts
- Database tests run with `REQUIRE_INTEGRATION=1`; an unavailable database must fail, not skip

### Task CEO-001: Metric Definitions and Provider Endpoints

**Files:**

- Create: `backend/services/auth-service/src/features/metrics/userMetrics.js`
- Create: `backend/services/order-service/src/features/metrics/platformMetrics.js`
- Create: `backend/services/product-service/src/features/metrics/catalogMetrics.js`
- Test: `backend/services/order-service/test/platform-metrics.integration.test.js`

**Interfaces:**

- Produces: `GET /api/*/executive/metrics?from&to&timezone`
- Produces: `ExecutiveMetricPoint` from `../integration.md`

- [x] **Step 1: Write failing fixture-based GMV/revenue/user tests**

```js
assert.deepEqual(metrics, {
  gmv: 3000,
  platformRevenue: 300,
  completedOrders: 2,
});
```

- [x] **Step 2: Run integration tests; confirm protected aggregate endpoints missing**
- [x] **Step 3: Implement owner-local aggregates and metadata**

```js
{ data, meta: { definitionVersion: "v1", timezone: "Asia/Bangkok", from, to } }
```

- [x] **Step 4: Verify non-Executive `403`, cancelled exclusion and boundary timestamps**
- [x] **Step 5: Update docs** — commit `feat(executive): add governed metrics` still pending

### Task CEO-002: Executive Dashboard and Comparisons

**Files:**

- Create: `frontend/app/executive/page.js`
- Create: `frontend/components/executive/MetricCard.js`
- Create: `frontend/components/executive/TrendChart.js`
- Test: `frontend/app/executive/executive.test.js`

**Interfaces:** Consumes three provider metric responses and preserves `unavailable` state

- [x] **Step 1: Write failing KPI/month/year/partial-state tests**
- [x] **Step 2: Run Jest and confirm route/components missing**
- [x] **Step 3: Implement parallel fetch with per-provider result state**

```js
const results = await Promise.allSettled([
  fetchUsers(),
  fetchOrders(),
  fetchCatalog(),
]);
```

- [x] **Step 4: Verify keyboard/chart labels, mobile layout and one-provider failure**
- [x] **Step 5: Update docs** — commit `feat(executive): add KPI dashboard` still pending

### Task CEO-003: Top Products and Categories

**Files:**

- Create: `backend/services/product-service/src/features/metrics/topCatalog.js`
- Create: `frontend/components/executive/TopCategories.js`
  — built as `RankingList.js` instead: one component renders both the category
  and the product ranking (same `{id,label,count,gmv}` shape), so a
  category-only component would have needed a near-duplicate sibling.
- Test: `backend/services/product-service/test/top-catalog.integration.test.js`

**Interfaces:** Consumes completed-sale facts; produces ranked `{id, label, count, gmv}`

- [x] **Step 1: Write failing top-10/tie/category/date tests**
- [x] **Step 2: Run integration test; confirm aggregate missing**
- [x] **Step 3: Implement deterministic rank with stable tie-break**

```js
rows.sort(
  (a, b) =>
    b.gmv - a.gmv || b.count - a.count || a.label.localeCompare(b.label),
);
```

- [x] **Step 4: Verify removed products retain historical label and filters**
      — ranking reads `products` rows directly, so a title is whatever the row
      still holds; a hard-deleted product leaves the ranking entirely. Revisit
      if listings ever become soft-deleted.
- [x] **Step 5: Update docs** — commit `feat(executive): add catalog rankings` still pending

### Task CEO-004: Extended Anomaly Alerts

**Files:**

- Create: `backend/services/review-service/src/features/alerts/anomalyRule.js`
- Create: `backend/services/review-service/src/features/alerts/alertWorker.js`
- Modify: `backend/services/review-service/prisma/schema.prisma`
- Test: `backend/services/review-service/test/executive-alert.integration.test.js`
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
- Create: `backend/services/review-service/src/features/exports/exportWorker.js`
- Modify: `backend/services/review-service/prisma/schema.prisma`
- Test: `backend/services/review-service/test/executive-export.integration.test.js`

**Interfaces:**

- Produces: `POST /api/reviews/executive/exports {format, from, to, category}`
- Produces: `runExportJob({exportJobId})` which claims one persisted `PENDING` job and writes
  `COMPLETED` or `FAILED`

- [ ] **Step 1: Write failing format/date-range/job-persistence tests**
- [ ] **Step 2: Run integration test; confirm export route absent**
- [ ] **Step 3: Implement bounded async export backed by persisted ExportJob**

```js
const exportJob = await prisma.exportJob.create({
  data: { requestedBy, format, from, to, category, status: "PENDING" },
});
return { id: exportJob.id, status: exportJob.status };
```

- [ ] **Step 4: Verify expiry, audit, 10-second target on agreed fixture and cleanup**
- [ ] **Step 5: Update docs and commit `feat(executive): add governed exports`**
