# Executive production audit — 2026-10-25

## Scope and conclusion

ตรวจต่อจากงานที่ค้างไว้ โดยแก้เฉพาะโมดูล Executive ใน Frontend, Auth metrics/audit และ Order metrics/detail รวมเอกสารและ tests ของ Executive ไม่แก้ shared authentication, Gateway, schema, migrations, API ค้นผู้ใช้เดิม หรือฟีเจอร์ของบทบาทอื่น และไม่ commit/stage ทับงานที่มีอยู่

Executive runtime ที่ตรวจอ่านข้อมูลจริงผ่าน API ของเจ้าของข้อมูล ไม่พบ dashboard fixture, mock repository หรือ cross-service database connection ในเส้นทาง Executive การ seed ข้อมูลตัวอย่างลงฐานข้อมูลพัฒนาและการใช้ fixture ใน tests เป็นคนละเรื่องกับ runtime ที่ hardcode ตัวเลขให้ผู้บริหาร

ผลรอบนี้เป็นการตรวจ source, automated regression, PostgreSQL integration และ smoke ผ่าน browser ในเครื่อง ไม่ใช่การรับรอง production infrastructure, load/SLA, security ทั้งระบบ หรือ deployment ใหม่

## Coverage

| ส่วน | สิ่งที่ตรวจ |
| --- | --- |
| Executive page | login redirect, ข้อจำกัด role, การสลับ 3 แท็บ |
| Overview | ยอดซื้อ/ประมูล, GMV, fee metadata, ผู้ใช้สะสมรายวัน, การเทียบช่วงก่อนหน้า, provider failure |
| Dates | Asia/Bangkok, วันนี้เทียบวันเดียวกันสัปดาห์ก่อน, เดือน/ปี, ช่วงกำหนดเอง, วันที่ไม่ถูกต้อง/อนาคต, ขีดจำกัด 366 วัน, hour/day/month series |
| Rankings | Product ขอ completed-sale facts จาก Order ผ่าน API แล้วจัดกลุ่มหมวดหมู่ในฐานข้อมูลของตัวเอง, stable ties, สินค้าที่ถูกลบ, สัดส่วนจากยอดทั้งหมด |
| Order status | นับเฉพาะออเดอร์ที่ชำระแล้ว แยกสำเร็จ/กำลังดำเนินการ/ข้อพิพาทและคืนเงิน |
| Reports | รายเดือนแยกรายวัน, รายปีแยกรายเดือน, ยอดรวม, partial data, missing/malformed buckets |
| CSV | ข้อมูลเดียวกับตาราง, คอลัมน์แยกหน่วย, BOM ภาษาไทย, ต้องบันทึก audit สำเร็จก่อนดาวน์โหลด |
| Complaints | report/ticket/dispute, status/category/type/priority, date/search/target/sort, totals/status counts, pagination, provider failure |
| Details | ผู้เกี่ยวข้อง, ผู้รับเคส, ผู้ดำเนินการ/ผู้ตัดสิน, ผล/เหตุผล, SLA, dependency unavailable; ไม่ส่งหลักฐาน แชท หรือ internal notes ให้ CEO |
| Audit | actor จาก token, อีเมลจาก Auth DB, action/metadata allowlist, IP ผ่าน proxy configuration |

## Fixed in this audit

### 1. Search results silently capped at 100 users

`sellerNameSearch` เดิมเรียก `/internal/users/search` ซึ่งคืนสูงสุด 100 บัญชีและไม่มี pagination ทำให้ข้อพิพาทของร้านหลังจากนั้นหายจากผลค้นหา

เพิ่ม `POST /executive/seller-search` ภายใน Auth metrics module ของ Executive โดยมี `requireInternalToken` และอ่านเฉพาะ seller IDs หน้าไม่เกิน 100 บัญชี ใช้ cursor บน `users.id` เรียงคงที่ คืน `{sellerIds, nextCursor}` ไม่ส่ง KYC, contact details หรือ user directory payload

Order อ่านทุกหน้าผ่าน HTTP ใช้ deadline เดียวตลอดการค้นหา ตรวจ response และ cursor ซ้ำ ถ้า provider ล้มเหลวหรือค้นไม่ครบจะตอบ unavailable แทนรายการที่ดูเหมือนครบแล้ว เก็บร้านที่ถูกระงับไว้ในการค้นหาตามการตัดสินใจเดิมของ Executive; `%`, `_`, `\` เป็นอักขระธรรมดาและ escape ที่ Auth เพียงครั้งเดียว

ทดสอบ PostgreSQL ด้วย seller 103 บัญชี: ชื่อที่ตรง 102 บัญชีรวมร้าน SUSPENDED, อีกหนึ่งชื่อไม่ตรงสำหรับตรวจ wildcard; ตรวจทั้ง endpoint และ Order client ที่เรียก Auth app ผ่าน HTTP จริง ครบสองหน้า

API ค้นผู้ใช้และร้านเดิมของทีม Auth ไม่ได้เปลี่ยน

### 2. Requests could leave Executive loading indefinitely

เพิ่ม `frontend/lib/executiveRequest.js` ใช้ `apiFetch` เดิมพร้อม deadline 15 วินาที ครอบคลุม overview, report series, first sale, complaints, case detail และ audit export โดยไม่เปลี่ยน default ของ API client ที่บทบาทอื่นใช้

เพิ่ม regression ของ network ที่ไม่ตอบ: request ถูก abort และภาพรวมจบที่ unavailable โดยไม่มีการแทนข้อมูลที่หายด้วยศูนย์

ฝั่ง Order รายละเอียดข้อพิพาทใช้ Product lookup เฉพาะ Executive พร้อม timeout 3 วินาทีและ encode product ID แทน client กลางที่ไม่มี timeout ไม่แก้ client ที่ Buyer/Order ใช้งาน

### 3. Queue shrinking could strand the last page

`useExecutiveInbox` ปรับหน้าปัจจุบันกลับหน้าสุดท้ายที่ยังมีอยู่หลังรับผลสำเร็จ หากจำนวนเรื่องลดลงระหว่างใช้งาน รองรับทั้งรายการรวมและรายการประเภทเดียว ไม่ปรับหน้าจาก error response

ทดสอบเปิดหน้าที่ 2 แล้วรายการลดเหลือ 1 หน้า ต้องเรียกหน้าที่ 1 และแสดงข้อมูลอีกครั้ง

### 4. Report buckets could crash or conceal missing data

ตรวจ response series ว่าเป็น array, timestamp ใช้ได้, ไม่ซ้ำ และตัวเลข finite/non-negative ถ้า provider ตอบ HTTP success แต่ payload ใช้ไม่ได้ให้ถือว่า unavailable

ตารางรวมวันที่จากทั้ง Order และ Auth โดยจับคู่จาก period ไม่พึ่งตำแหน่ง array แต่ละเซลล์ที่ไม่มี bucket แสดง unavailable และยอดรวมคอลัมน์นั้นไม่รวมค่าขาดเป็นศูนย์ CSV ใช้สถานะเดียวกับตาราง

### 5. Status counts and list could describe different snapshots

งานก่อนหน้าปรับ predicate ให้ counts ใช้ date/search/target เดียวกับรายการแล้ว รอบนี้ย้ายการนับสถานะเข้า repeatable-read transaction เดียวกับ page และ total ใน `reportSearch.js` เพื่อให้รายการ จำนวนทั้งหมด และปุ่มสถานะอ้างอิง snapshot เดียวกัน

### 6. Audit IP trusted an unvalidated raw header

`extractActor` ใช้ `req.ip` ที่ Express ประเมินผ่าน trust-proxy configuration ของ Auth แล้ว แทนการอ่านสมาชิกแรกของ `x-forwarded-for` เอง มี regression สำหรับ header ที่แทรก IP ปลอม โดยไม่เปลี่ยน proxy configuration ของทีม

## Existing work retained and verified

- `CUSTOM_MODE.usersGranularity` ถูกลบไว้แล้ว ไม่ทำซ้ำ
- date helpers ถูกแยกไว้ใน `executiveDates.js` และ re-export จาก `executive.js` แล้ว
- `sellerNameSearch.js` และ test เดิมอยู่ใน Git index แล้ว ณ เริ่ม audit ไม่ได้หายจากรายการ tracked
- GMV ใช้ completed orders หลังคูปอง; แยกยอดซื้อกับประมูล
- platform fee มาจาก Order config/metadata; ค่าเริ่มต้น 3% เป็น business fallback เดิม ไม่ใช่ตัวเลข dashboard ตัวอย่าง
- auth/order/product/support อ่านฐานข้อมูลของตัวเอง ข้อมูลข้ามบริการผ่าน API
- ข้อร้องเรียน, Ticket และข้อพิพาทยังแยกสถานะ/ตัวกรองตาม domain ของตนเอง
- ข้อความแปล enum, สีกราฟ, pagination size และค่า timeout เป็นค่าตั้งระบบ ไม่ใช่ mock business facts

## Verification

- Frontend Executive/CSV: 19 suites, 233 tests ผ่าน (จากเดิม 18 suites, 227 tests)
- Backend: Executive integration 24 tests ผ่านบน PostgreSQL 16 จริง ด้วย `REQUIRE_INTEGRATION=1`, 0 skipped; unit tests ของ Executive/shared metrics เพิ่มอีก 33 tests
- ใช้ PostgreSQL container ชั่วคราว `ise-ceo-audit-20261025` พอร์ต localhost 55439 และฐานข้อมูล `reloop_ci_executive_auth`, `reloop_ci_executive_order`, `reloop_ci_executive_product`, `reloop_ci_executive_support` แยกจากฐานข้อมูลใช้งาน
- Migrations ของทั้ง 4 service apply สำเร็จในฐานข้อมูลทดสอบ ใช้ lookup seed สำหรับ test เท่านั้น
- ESLint เฉพาะ Executive ผ่าน; Prettier ใช้กับไฟล์ที่แก้ในรอบนี้
- Browser smoke: sign in บัญชี Executive ในเครื่องและเปิดครบภาพรวม/รายงาน/ข้อร้องเรียน แสดงข้อมูลจาก local services สำเร็จ ไม่ได้กด export หรือสั่ง moderation
- Production build: `npm --workspace frontend run build` ผ่านหลังแก้โค้ดครบ; เก็บ output ใน `output/executive-audit-build-results.txt`
- Backend output รวมอยู่ใน `output/executive-audit-backend-results.txt`; stack traces ของ dependency-error cases เป็นสิ่งที่ tests จงใจทดสอบ ไม่ใช่ test failure
- ผลรวม Backend รอบสุดท้าย: 57 passed, 0 failed, 0 skipped; ตรวจ `git diff --check` และ Prettier ของไฟล์โค้ดที่แก้ผ่าน

คำสั่ง Frontend: `npm --workspace frontend run test -- --runInBand --coverage=false --testPathPatterns='executive|csv'`

Backend เลือกไฟล์ `executive-*`, `user-metrics*`, `platform-metrics*`, `catalog-metrics*`, `top-catalog*`, `first-sale*`, `product-sales*` ใน service tests ร่วมกับ `sellerNameSearch`, `orderStatusMetrics`, `executiveAuditPolicy`, `executiveAuditController`, `executiveMetrics` unit tests โดยตั้ง DATABASE_URL ของแต่ละ service ไปยัง disposable DB แล้วใช้ `node --test --test-concurrency=1` ไม่ใช้ฐานข้อมูลจริงเป็น test target

## Deployment and remaining boundaries

1. Deploy Auth และ Order รุ่นนี้ร่วมกัน: Order client ใหม่ต้องใช้ Auth `/executive/seller-search` ใหม่ หาก Auth ยังเป็นรุ่นเก่า การค้นชื่อร้านจะแสดง unavailable อย่างชัดเจน ไม่ fallback กลับไปค้นแบบตกหล่น 100 รายการ Frontend ต้อง build/deploy เพื่อใช้ timeout และ report guards ใหม่ ไม่มี migration ใหม่จาก audit นี้
2. Browser smoke ใช้บริการที่รันอยู่เดิม จึงไม่ใช่การทดสอบ deployment ของ Backend patch ใหม่ หลักฐาน patch ใหม่มาจาก local code + isolated PostgreSQL/HTTP integration
3. ยังไม่ได้ตรวจ mobile viewport แบบ visual และไม่ได้วัดโหลด, SLA 2 วินาที/10 วินาที, 99.9% availability หรือข้อมูลระดับล้านรายการ ไม่อ้างว่า tests เหล่านี้รับรอง performance production
4. `CEO-004` full anomaly worker/persisted alert lifecycle ยังไม่ส่งมอบตาม CEO-DEC-011; คงแค่ repeat-complaint warning ที่ query ตอนอ่าน ไม่เพิ่มฟีเจอร์นอกขอบเขต review
5. PDF/background export jobs ถูกตัดออกตาม CEO-DEC-016; audit ก่อน download บันทึกคำขอส่งออก ไม่สามารถรับรองว่า browser บันทึกไฟล์ลงเครื่องสำเร็จจริง
6. Fee schedule ยังเป็น rate เดียวจาก environment การเปลี่ยนอัตราทำให้รายงานย้อนหลังถูกคำนวณใหม่ ไม่ใช่ financial ledger ที่เก็บ rate ตามเวลาของรายการ
7. Gateway `/internal/` policy, authentication infrastructure และ security hardening ของระบบรวมเป็น shared/team scope ไม่ได้แก้ในรอบนี้
8. Build มี warning เดิมเรื่องหลาย lockfiles และ Next.js ESLint plugin; ไม่แก้ configuration ส่วนกลางเพื่อให้ขอบเขตอยู่เฉพาะ Executive
