# Executive Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-27`–`UR-31`
- กำหนด read-only KPI/monthly/top-category เป็น Core
- กำหนด alert/export/drill-down เป็น Extended
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-27`–`UR-31` พร้อม FR, NFR, `WF-12` และ Task/Phase
- เพิ่ม PostgreSQL acceptance สำหรับ metric facts, rankings, persisted alert state และ export jobs
- ห้ามใช้ hardcoded dashboard, client-only Seller calculation หรือ mock/in-memory database เป็นหลักฐาน
- คง Core metrics/dashboard/rankings และ Extended alert/export ordering
- ย้าย production Executive authorization และ alert/audit security hardening ไป Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Executive implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `CEO-001`–`CEO-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, read-only analytics, owner-local aggregate และ deferred security decisions
- ไม่มี Executive implementation/database change ในรายการนี้

## 2026-08-10 — Post-Pull Source Audit

- ProductVideo/feed และ demo seed ที่ pull มาไม่เพิ่ม Executive metrics, aggregate API, alert หรือ export
- Executive status, blocker และ `CEO-001` next action ยังคงเดิม
- ไม่ได้แก้ Executive application code หรือรัน Executive PostgreSQL acceptance test

## 2026-08-26 — CEO-001 Metric Definitions and Provider Endpoints (Done)

- เพิ่ม owner-local aggregate endpoint `GET /api/*/executive/metrics?from&to&timezone` ในทั้งสาม service:
  `auth-service` (`activeUsers`, `newUsers`), `order-service` (`gmv`, `platformRevenue`, `completedOrders`),
  `product-service` (`newListings`, `soldListings`, `activeListings`)
- เพิ่ม shared helper `resolveMetricRange`/`metricMeta` ใน `backend/shared` เพื่อให้ query shape และ
  `meta.{definitionVersion,timezone,from,to}` ตรงกันทั้งสาม service
- Non-Executive role ได้ `403`, unauthenticated ได้ `401`; cancelled/pending order ไม่นับเข้า GMV
- Database acceptance: `user-metrics.integration.test.js`, `platform-metrics.integration.test.js`,
  `catalog-metrics.integration.test.js` รันผ่านกับ PostgreSQL จริงด้วย `REQUIRE_INTEGRATION=1`

## 2026-08-26 — CEO-002 Executive Dashboard and Comparisons (Done)

- เพิ่ม `frontend/app/executive/page.js` แสดง KPI จากทั้งสาม provider ด้วย `Promise.allSettled` — provider
  ที่ล่มแสดง "ไม่พร้อมใช้งาน" แทนค่าศูนย์ปลอม (ตาม `CEO-DEC-003`)
- เพิ่ม `MetricCard.js` (KPI tile พร้อม growth % เทียบช่วงก่อนหน้า) และ `TrendChart.js`
  (per-period trend bar chart ที่ mark ช่วงที่ provider ไม่ตอบสนองแยกจาก 0) ใน `frontend/components/executive/`
- รองรับสลับมุมมองรายเดือน/รายปีตาม `FR-6.1.2`; แสดง `meta.definitionVersion`/`timezone` ท้ายหน้า
- เพิ่มลิงก์ "แดชบอร์ดผู้บริหาร" ใน `NavBar.js` สำหรับ role `EXECUTIVE`
- Test: `frontend/app/executive/executive.test.js` (role restriction, KPI render, partial-provider-failure)
  ผ่านทั้งหมด; ตรวจ manual ผ่าน browser จริงด้วยบัญชี demo executive (`ceo@example.com`)

## 2026-08-26 — CEO-003 Catalog Rankings + Executive Sub-pages

- เพิ่ม `topCatalog.js` และ `GET /api/products/executive/top-catalog?from&to&limit` จัดอันดับ
  หมวดหมู่และสินค้าจากยอดขายจริง พร้อม tie-break `gmv → count → label` ให้ผลลัพธ์คงที่ (`CEO-003`)
- เพิ่ม `GET /api/auth/executive/reports?status&limit` อ่านตาราง `reports` ที่ auth-service
  เป็นเจ้าของ พร้อมกลุ่ม "ผู้ถูกร้องเรียนซ้ำ" — เป็นส่วนหนึ่งของ `CEO-004` เท่านั้น
  (ยังไม่มี anomaly rule / alert worker / persisted alert state)
- Seed ข้อร้องเรียนตัวอย่าง 5 รายการใน `auth-service/prisma/seed.js` (ตารางเดิมว่างเปล่า)
- Frontend: แยกเป็น 3 หน้าใต้ `/executive` ผ่าน `ExecutiveShell.js` (guard + แถบนำทางร่วมกัน)
  - `/executive` — ภาพรวม + อันดับหมวดหมู่/สินค้า (`RankingList.js`)
  - `/executive/reports` — ตัวกรองรายเดือน/รายปี, MoM/YoY, ดาวน์โหลด CSV
  - `/executive/complaints` — รายการข้อร้องเรียนเรียงเป็นหมายเลข 1,2,3,4
- Login redirect: บัญชี `EXECUTIVE` เข้าหน้า `/executive` ทันทีหลังล็อกอิน (`UR-27`)
- แก้ปัญหา test isolation ที่มีอยู่เดิม: `catalog-metrics` assert ค่า `activeListings`
  แบบตายตัว ทั้งที่เป็น live gauge ระดับแพลตฟอร์ม และ `npm test` รันไฟล์เทสต์แบบขนาน
  บน database เดียวกัน — เปลี่ยนเป็น assert ส่วนต่างที่คร่อมการ insert แทน
- Test: เพิ่ม `top-catalog.integration.test.js`, `executive-reports.integration.test.js`,
  `complaints.test.js`, `reports.test.js`, `csv.test.js`
  → backend 49 ผ่าน / frontend 24 ผ่าน / eslint สะอาด

## 2026-08-26 — CSV Export: Wide Format (Unit Separation)

- แก้ CSV export ที่ `/executive/reports` จาก long format (1 แถวต่อ 1 ตัวชี้วัด, คอลัมน์ "ค่า"
  ผสมหน่วยบาทกับจำนวนรายการปนกัน — SUM/pivot ทั้งคอลัมน์ได้ค่าไม่มีความหมาย) เป็น wide format
  (1 แถวต่อ 1 ช่วงเวลา, แยกคอลัมน์ค่า/MoM/YoY ต่อตัวชี้วัด แต่ละคอลัมน์มีหน่วยเดียวเสมอ)
- Header ระบุหน่วยกำกับไว้ในชื่อคอลัมน์ตรงๆ เช่น `ยอดขายรวม (GMV) (บาท)`,
  `คำสั่งซื้อสำเร็จทั้งหมด (รายการ)` — เปิดไฟล์แล้วรู้ทันทีว่าคอลัมน์ไหนหน่วยอะไร
  ไม่ต้องเดา, ปลอดภัยต่อการ `SUM()`/pivot ใน Excel หรือ pandas
- โครงสร้างนี้พร้อมขยายเป็น multi-period export ในอนาคต (เพิ่มแถวต่อเดือน ไม่ใช่เพิ่มคอลัมน์)
- อัปเดต `reports.test.js` ให้ตรวจ header/cell แยกตามคอลัมน์แทนการเช็คว่ามีตัวเลขปรากฏในไฟล์
  → backend 49 ผ่าน / frontend 24 ผ่าน / eslint สะอาด
