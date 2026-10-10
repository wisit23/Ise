# Executive Feature Changelog

## 2026-10-10 — Pre-Git recheck

- แก้ pagination เมื่อหน้าสุดท้ายหายหลังคำร้องเปลี่ยนสถานะ ให้กลับหน้าที่มีผลลัพธ์ได้ และไม่ submit Search ขณะ IME กำลังประกอบข้อความ
- เปลี่ยน target/actor lookup เป็น Map เพื่อไม่อ่าน inherited object properties กรณีรหัสเป้าหมายพิเศษ; เพิ่ม regression cases constructor/__proto__
- Focused frontend 41/41, isolated PostgreSQL checks 3/3, scoped lint/Prettier/static API-module type check/Compose config/diff checks ผ่าน. Secret scan tracked 619 files และ new files 9 files ไม่พบ secrets. Handoff ระบุให้รวมไฟล์ใหม่ใน commit

## 2026-10-10 — Complaint quality review and refactor

- แยก useExecutiveComplaints (fetch/search/state/timeout) และ ComplaintRow จากหน้า section; คง ComplaintDetailsModal และ shared UI เดิม
- โมดูลรับข้อมูลเปิด @ts-check พร้อม JSDoc types และ normalized payload จริง; runtime ตรวจโครงสร้าง/วันที่/ตัวเลข/Action และความสอดคล้อง total-page-limit-totalPages. ไม่ใช้ runtime mock fallback
- Request timeout รองรับ NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS และ retry โดยคงช่องค้นหาไว้; ยกเลิก timer เมื่อเปลี่ยนคำขอ/unmount. Domain labels เป็น UI translations ไม่ใช่ข้อมูลคำร้องจำลอง
- Report page/count/detail อ่าน RepeatableRead snapshot เดียวกัน และสร้าง report-count join เฉพาะ most_reported. ไม่เปลี่ยน schema หรือคำสั่ง moderation
- เพิ่ม production build args เฉพาะ Executive public config ใน Dockerfile.prod/Compose override เพราะ Next.js ฝังค่าขณะ build
- Verification: strict TypeScript check ของ executiveComplaints.js ผ่าน; scoped ESLint ผ่าน; frontend 4 suites/40 tests ผ่าน; isolated PostgreSQL query/config/actions/search 3/3 ผ่าน; frontend production build บนสำเนาชั่วคราวผ่าน; production Compose config และ diff check ผ่าน. ไม่มี browser QA ใหม่ในรอบนี้

## 2026-10-09 — All report statuses

- เพิ่มปุ่ม “ทั้งหมด” ต่อจาก “ยกคำร้อง”, ส่ง status=ALL เพื่อยกเงื่อนไขสถานะใน API; search/target/pagination คงทำงานร่วมกันได้
- Focused frontend 18/18 และ isolated PostgreSQL integration 1/1 ผ่าน; ALL fixture ยืนยัน OPEN/REVIEWED/ACTIONED/DISMISSED ครบ

## 2026-10-09 — Search as you type

- ค้นหาอัตโนมัติหลังหยุดพิมพ์ 300ms (NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS รองรับ override ที่ validate แล้ว), ยกเลิก timer เดิม และรอ IME composition จบก่อนค้น
- คง input/controls ขณะ API โหลดหรือผิดพลาดหลังโหลดครั้งแรก เพื่อไม่เสีย focus; คง stale-response guard, reset page 1 และสถานะเดิม
- Focused complaint regression tests 17/17 ผ่าน รวม auto-search, focus ขณะ request ค้าง และ IME. ไม่แก้ Backend/API contract

## 2026-10-09 — Target/shop complaint search

- เพิ่ม Search ชิดขวาของหัวข้อรายการ ค้นหาจากชื่อร้าน ชื่อผู้ใช้เป้าหมาย หรือ target ID ผ่าน API โดยคงสถานะที่เลือก; มีล้างคำค้นและ empty state เฉพาะการค้นหา
- API รองรับ search/page พร้อม validation; SQL parameterized ค้นหาก่อนแบ่งหน้าและใช้ predicate เดียวกับ total count. ส่ง total/page/limit/totalPages ให้ pagination เพื่อเข้าถึงผลลัพธ์ครบเกิน limit เดิม
- ย้าย most_reported ordering ไปฐานข้อมูลก่อนแบ่งหน้า พร้อม id tie-break ป้องกันรายการข้าม/ซ้ำเมื่อ reportedAt เท่ากัน; ไม่เปลี่ยน KPI summary หรือ moderation commands
- Verification: PostgreSQL schema แยก 3/3 checks ผ่าน (query/config + persisted actions/search) ครอบคลุม partial case-insensitive shop search, owner name/ID, status, multi-page, no match, literal SQL-like input และ global ranking. Focused frontend 26/26 ผ่าน; schema/runner ทดสอบลบหลังตรวจ

## 2026-10-09 — Full-page complaint overlay and background scroll lock

- ComplaintDetailsModal ใช้ React portal ไปยัง body เพื่อออกจาก transformed animation ของ section และครอบ Navbar/Sidebar/Content ทั้งหน้า
- ล็อก scrollable panel ancestors ขณะเปิดและคืนค่า overflow เดิมเมื่อปิด/unmount; shared Modal คง body lock, focus trap, Esc/backdrop behavior และ scroll ภายในรายละเอียด
- แก้เฉพาะ component ข้อร้องเรียน CEO; ไม่แก้ shared Modal หรือ layout ของทีมอื่น
- Regression checks: complaint/Modal 18/18 ผ่าน รวม portal อยู่ใต้ body, panel/body scroll lock และคืนค่าเมื่อปิดด้วย Esc. ยังไม่ได้ตรวจ browser จริง

## 2026-10-09 — Complaint validation, error handling and component cleanup

- แยก `ComplaintDetailsModal` และโมดูล `executiveComplaints` สำหรับ runtime payload validation/JSDoc types/ข้อความแสดงผล; ข้อมูลรายการและการตัดสินอ่านจาก API จริง ไม่มี runtime mock fallback
- ลบค่า KPI/threshold จำลองระหว่างโหลด; payload ผิดรูปแบบหรือ API ล้มเหลวแสดง ErrorState พร้อม retry และไม่ใช้ผลตอบกลับเก่าทับคำขอล่าสุด
- Backend ตรวจ query เป็น scalar string, limit เป็น integer และ targetId ไม่ว่าง. Config limit/threshold อ่านจาก EXECUTIVE_REPORT_* โดยตรวจค่าตอนเริ่ม; timezone อ่าน NEXT_PUBLIC_REPORT_TIMEZONE. ตัวอย่างอยู่ `.env.example`
- Verification: focused frontend 4 suites / 30 tests ผ่าน, backend query/config tests 2/2 ผ่าน, ESLint scope ที่แก้ผ่าน. Auth image build สำเร็จ

## 2026-10-09 — Trust & Safety decision in complaint details

- Executive API ส่ง `actionTaken` และ `actionDetails` (actor ID/name, decision reason) สำหรับคำร้องที่ ACTIONED/DISMISSED โดยจับคู่ Report.id กับ AdminAudit.targetId และ REPORT_<actionTaken>; lookup ชื่อเจ้าหน้าที่จาก Users แบบ batch
- ป๊อปอัปแสดงผู้ดำเนินการ Action และเหตุผลแยกจากเหตุผลผู้ร้อง; คำร้องที่ยังไม่เสร็จหรือไม่มีข้อมูลแสดง `-`. SUSPEND_USER แสดงระงับบัญชีผู้ใช้ตามพฤติกรรมจริง
- Verification: PostgreSQL integration ใน schema ชั่วคราวแยกผ่าน 1/1 (ไม่ skip) ครอบคลุมผู้ตรวจคนละคนกับผู้ตัดสิน, unrelated audit, ทั้งสี่ Action, pending และ missing audit; ลบ schema หลังตรวจ. Frontend complaint/Modal tests ผ่าน 15/15

## 2026-10-09 — Complaint details popup

- เพิ่มปุ่ม “รายละเอียด” แต่ละคำร้อง เปิด shared `Modal` แสดงเหตุผล ผู้ส่ง วันเวลาไทย เป้าหมาย และสถานะจากข้อมูล API ที่โหลดแล้ว
- แสดงชื่อร้าน/ชื่อผู้ใช้และรหัสเต็มเมื่อมีข้อมูล; คำร้องที่ระบุเฉพาะสินค้าแสดงรหัสสินค้า
- ใช้ Modal กลางสำหรับ Esc, backdrop close, focus trap และคืน focus; ไม่เพิ่ม API หรือเปลี่ยนสถานะคำร้อง
- Verification: existing `ComplaintsSection.test.js` + `Modal.test.js` ผ่าน 2 suites / 8 tests ใน frontend container; `git diff --check` ผ่าน. ยังไม่ได้ตรวจคลิกจริงผ่าน browser

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

## 2026-08-26 — Reports Page: Per-Day/Per-Month Breakdown (Owner request, replaces MoM/YoY)

- Owner ขอให้เปลี่ยน `/executive/reports` จากตาราง MoM/YoY (1 แถวสรุปต่อช่วงที่เลือก) เป็นตาราง
  แจกแจงราย: **รายเดือน → 1 แถวต่อวัน** (สูงสุด 31 แถว), **รายปี → 1 แถวต่อเดือน** (12 แถว)
  — คอลัมน์เดิม (ยอดขาย, รายได้แพลตฟอร์ม, คำสั่งซื้อ, ผู้ใช้งานที่ล็อกอิน) คงไว้ ตัด MoM/YoY ออก
- เพิ่ม endpoint ใหม่ทั้งสอง provider เพื่อรองรับการแจกแจงนี้ในฝั่ง SQL แทนการวนเรียก API ทีละวัน:
  - `GET /api/orders/executive/metrics-series?from&to&granularity&timezone` (order-service) —
    `date_trunc` ตาม `granularity` (`day`/`month`) พร้อม gap-fill ให้ทุกช่วงเวลามีแถว แม้ไม่มีออร์เดอร์เลย
  - `GET /api/auth/executive/metrics-series?from&to&granularity&timezone` (auth-service) —
    `activeUsers` รายวัน/รายเดือนแบบเดียวกัน
  - `PLATFORM_FEE_RATE`, `dayLabel`, `monthLabel`, `fetchMetricsSeries` เพิ่มใน
    `frontend/lib/executive.js`
- คง `CEO-DEC-003` เดิม: provider ไหนล่ม คอลัมน์ของ provider นั้น (เท่านั้น) ขึ้น "ไม่พร้อมใช้งาน"
  ต่อแถว ไม่ปลอมเป็นศูนย์; ถ้าทั้งสอง provider ล่มพร้อมกันถึงจะขึ้นข้อความระดับหน้าแทนตารางเปล่า
- CSV export ตามตารางใหม่ไปด้วย (1 แถวต่อวัน/เดือน, 1 คอลัมน์ต่อ 1 หน่วยเดิม)
- **แก้บั๊ก 2 จุดที่เจอระหว่างทำ:**
  1. `dayLabel` เคยเรียก `toLocaleDateString("th-TH", {year:"2-digit"})` แยกจาก `month` — th-TH
     ICU จะสะกดเป็น `"พ.ศ. 69"` เมื่อขอปีอย่างเดียว แต่ตัด prefix เหลือ `"69"` เมื่อขอ
     เดือน+ปีพร้อมกัน ทำให้ label ที่ควรเป็น `"01/ส.ค./69"` กลายเป็น `"01/ส.ค./พ.ศ. 69"` — แก้โดย
     รวมเป็น `toLocaleDateString` ครั้งเดียว
  2. `fetchMetricsSeries` ลืม unwrap `.data` จาก response (`{data, meta}`) ทำให้หน้าเว็บ crash
     ด้วย `TypeError: order.map is not a function` เมื่อ provider ตอบกลับสำเร็จ
  - ทั้งสองมี unit test คุมไว้ (`lib/executive.test.js`) กันกลับมาเป็นซ้ำ
- Owner ลบข้อความ placeholder ท้ายหน้า `/executive/complaints`
  ("ระบบตรวจจับธุรกรรมผิดปกติอัตโนมัติยังไม่ได้พัฒนา...") ด้วยตัวเอง — อัปเดต `complaints.test.js`
  ให้ตรงกับหน้าปัจจุบัน (ไม่มีข้อความนี้แล้ว)
- ลบ seed ข้อร้องเรียนตัวอย่าง 5 รายการออกจาก `auth-service/prisma/seed.js` ตามที่ Owner ขอ
  (ตาราง `reports` seed เหลือแต่ demo seller/executive account เหมือนเดิม)
- Test: `frontend/lib/executive.test.js` ใหม่ (day/month label formatters, `growthPct`),
  `platform-metrics-series.integration.test.js`, `user-metrics-series.integration.test.js` ใหม่
  → backend 51 ผ่าน (รวมทุก suite เดิม) / frontend 28 ผ่าน / eslint สะอาด
## 2026-08-26 — Consolidate into a Panel (Same as CS/Admin), Reconnect Complaints to Real Data

ผู้ใช้ขอให้ Executive กับ Marketing ใช้ Layout แบบเดียวกับ CS/Admin Workspace (Sidebar + Section
Switch หน้าเดียว) โดยเนื้อหา/ข้อมูลต้องเหมือนเดิมทุกอย่าง แค่เปลี่ยน Format

**Layout เปลี่ยน:** รวม `/executive`, `/executive/reports`, `/executive/complaints` (3 route,
แยก Top-tab Navigation ผ่าน `ExecutiveShell.js`) เข้าเป็น `/executive/page.js` เดียว มี Sidebar
สลับ Section ในหน้าเดียวแบบ `/workspace` — ลบ `ExecutiveShell.js` และ 2 route ย่อยทิ้ง ย้าย Logic
เดิมไปเป็น Component แยกใน `frontend/components/executive/sections/`
(`OverviewSection`, `ReportsSection`, `ComplaintsSection`) ใช้ UI Atom ร่วม (`KpiCard`,
`ChartCard`, `DropdownFilter`, `Badge`) ที่ย้ายจาก `components/support/ui/` ไปที่กลาง
`components/panel/ui/` เพื่อให้ทุก Panel (CS/Admin/Executive/Marketing) ใช้ร่วมกันได้
`MetricCard`/`TrendChart`/`RankingList` เดิมไม่แตะ (มี Logic เฉพาะ CEO-DEC-003 ที่ต้องแยก
"unavailable" จาก "0" ไม่ต้องการ Merge เข้า `KpiCard`)

**เชื่อมข้อมูลจริง — ไม่ใช่แค่เปลี่ยนหน้าตา:** `/executive/complaints` เดิม Hardcode
`EMPTY_DATA` ไว้ (คอมเมนต์เดิมบอกว่า "ยังไม่เชื่อม เพราะกลัว Seed Data ดูเหมือนกิจกรรมจริง")
ตามที่ผู้ใช้สั่งให้ "แสดงรายละเอียดเหมือนเดิมจากตอนแรก...เพิ่มรายละเอียดให้ครบถ้วนตามความเหมาะสม"
จึงต่อกลับเข้ากับ `GET /api/auth/executive/reports` ที่มีอยู่แล้วจริง (อ่านตาราง `reports`
เดียวกับที่ Admin Inbox ใช้) — Panel อื่นในระบบ (CS Dashboard, Admin Inbox) ก็แสดงข้อมูล Seed
ตรงๆ อยู่แล้วโดยไม่มีข้อกังวลนี้ ความเสี่ยงเดิมจึงไม่สมเหตุผลอีกต่อไปเมื่อทั้งระบบ Consolidate เข้าด้วยกัน

**บั๊กที่พบระหว่างทดสอบจริง:** `ComplaintsSection.js` เขียน `apiFetch(...).then(setData)` โดยเข้าใจผิดว่า
Response คือ Object ตรงๆ แต่ Endpoint จริงห่อด้วย `{data, meta}` เหมือน Executive Endpoint อื่นทุกตัว
— ทำให้กดแท็บ "ข้อร้องเรียน" แล้วหน้าเว็บ Crash ทันที (`Cannot read properties of undefined
(reading 'OPEN')` เพราะ `data.statusCounts` เป็น `undefined`) พบจากการทดสอบผ่าน Browser จริงกับ
Docker Stack (ไม่ใช่ Unit Test เพราะ Test เดิม Mock Shape ผิดตามสมมติฐานเดียวกัน) แก้โดย unwrap
`res.data` และแก้ Test ให้ Mock Response Envelope ให้ตรงของจริงด้วย ป้องกัน Regression ซ้ำ

- Test: ย้าย `reports.test.js` → `ReportsSection.test.js`, เขียน `ComplaintsSection.test.js`
  ใหม่ทั้งหมดให้ตรงกับพฤติกรรมจริง (ก่อนหน้านี้ Test เดิม Assert ว่าต้องเป็น Placeholder ว่างเปล่า
  ซึ่งขัดกับ Requirement ใหม่โดยตรง)
- ยืนยันผ่าน Browser จริง: `/executive` ครบทั้ง 3 Section (Overview/Reports/Complaints) แสดงข้อมูลถูกต้อง
  หลัง Restart Frontend Container (เจอ Docker-on-Windows File-watcher Gap ซ้ำ — Known Issue เดิม)
- `npm run test:frontend`: 28/28 ผ่าน (8 suites), `eslint` สะอาด, `next build` สำเร็จ
