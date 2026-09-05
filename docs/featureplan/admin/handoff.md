# Admin Feature Handoff

> อัปเดตล่าสุด: 2026-08-25

## Ownership

- Owner: สิรดนัย กันหา
- Reviewer: อชิรวินท์ จรูญกีรติโรจน์
- Requirement scope: `UR-22`–`UR-26`
- Current status: **ADM-001–ADM-005 implemented, awaiting Reviewer sign-off** — ห้ามเริ่ม
  Deferred Security Phase ก่อน Reviewer ตรวจรอบนี้ผ่าน (ตาม `decision.md` ADM-DEC-004)

## Scope to hand off

- `ADM-001`: Multi-Role Permission Foundation — **Done**, evidence ยืนยันแล้ว
- `ADM-002`: Test-KYC Review Queue — **Done**, evidence ยืนยันแล้ว
- `ADM-003`: Reports, User Suspension and Product Moderation — **Done**, evidence ยืนยันแล้ว
- `ADM-004`: Dispute Evidence and Simulated Fund Hold — **Done**, evidence ยืนยันแล้ว
- `ADM-005`: Extended Safe Operations — **Done** (bulk suspend + audit query);
  auction bounded-batch **ไม่ได้ทำ** ตาม `ADM-DEC-015` (Auction อยู่นอก Release A scope
  ทั้งโปรเจกต์)

## Manual QA — คลิกทดสอบหน้า /admin/\* ด้วยตัวเอง

ไม่มีทางสมัคร ADMIN หรือยื่น KYC/report/dispute ผ่าน UI ได้เอง (Admin ไม่ใช่เจ้าของ endpoint
สมัครสมาชิก และ CS/Chat/Seller submission ที่ควรเป็นต้นทางข้อมูลจริงยังไม่มี feature — ดู
`ADM-DEC-010`, `ADM-DEC-013`) ใช้ seed script ที่เตรียมไว้แทน ทุกอันเป็น idempotent
(fixed id, รันซ้ำได้ไม่ error/ไม่สร้างข้อมูลซ้ำ) และ **ไม่ได้รันอัตโนมัติตอน container start**
(แยกจาก `prisma db seed` ที่ผูกกับ demo seller ปกติ) ต้องรันเองเมื่อจะทดสอบ:

```bash
# ต้องมี postgres รันอยู่ก่อน (docker compose up -d postgres) และรัน
# `npx prisma migrate dev`/`db push` ให้ schema sync แล้ว (ดูหัวข้อ Migration ด้านล่าง)

cd backend/services/auth-service
npm run seed:admin-demo    # → login admin@test.local / AdminPass123!
npm run seed:kyc-demo      # → ใบสมัคร KYC ค้างตัดสินใจ ดูที่ /admin/kyc
npm run seed:report-demo   # → report ค้าง OPEN ดูที่ /admin/reports

cd ../order-service
npm run seed:dispute-demo  # → order + evidence ดูที่ /admin/disputes/<id ที่ script พิมพ์ออกมา>
```

จากนั้นเปิด service ทั้งหมดตามปกติ (`npm run dev` ในแต่ละ service + `gateway` + `frontend`,
หรือ `npm run dev` จาก root เพื่อรันทั้งชุดผ่าน Docker) แล้วเข้า `http://localhost:3000/login`
ด้วย admin account ด้านบน — `POST /admin/bulk` (`ADM-005`) ยังไม่มีหน้า UI ต้องยิง API ตรง
(ดูตัวอย่างคำสั่งใน `progress.md`/บทสนทนาที่เกี่ยวข้อง)

## Current evidence

- Requirement traceability และ acceptance steps อยู่ใน [`plan.md`](plan.md)
- สถานะล่าสุดของแต่ละ Task อยู่ใน [`progress.md`](progress.md)
- ประวัติการเปลี่ยนแปลงทั้งหมดอยู่ใน [`changelog.md`](changelog.md)
- คำตัดสินใจ (`ADM-DEC-001`–`ADM-DEC-015`) อยู่ใน [`decision.md`](decision.md)
- บทเรียนจากการตรวจ admin flow อยู่ใน [`teachme.md`](teachme.md)
- ทุก Task มี PostgreSQL integration test จริงต่อฐานข้อมูลของ owner service
  (`reloop_auth`/`reloop_product`/`reloop_order`) รันด้วย `REQUIRE_INTEGRATION=1` และผ่านหมด
  — ไม่มี mock/in-memory database ใช้เป็น acceptance evidence

## Branch/commit และรายการไฟล์ที่เปลี่ยน

- Branch: `main` (local working tree) — **ยังไม่มีการ commit** ในรอบนี้; รอ Reviewer ตรวจก่อน
  จึงค่อยตัดสินใจเรื่อง commit/branch
- ไฟล์ที่แก้/สร้างทั้งหมด (`git status`, 2026-08-25):

  ```
  M  backend/services/auth-service/prisma/schema.prisma
  M  backend/services/auth-service/src/app.js
  M  backend/services/auth-service/src/services/authService.js
  M  backend/services/order-service/prisma/schema.prisma
  M  backend/services/order-service/src/app.js
  M  backend/services/product-service/prisma/schema.prisma
  M  backend/services/product-service/src/app.js
  M  backend/shared/src/authMiddleware.js
  M  backend/shared/src/authMiddleware.test.js
  M  backend/shared/src/index.js
  M  docs/featureplan/admin/changelog.md
  M  docs/featureplan/admin/decision.md
  M  docs/featureplan/admin/progress.md
  ?? backend/services/auth-service/prisma/migrations/
  ?? backend/services/auth-service/src/features/
  ?? backend/services/auth-service/src/services/productModerationClient.js
  ?? backend/services/auth-service/test/admin-kyc.integration.test.js
  ?? backend/services/auth-service/test/admin-reports.integration.test.js
  ?? backend/services/auth-service/test/bounded-bulk.integration.test.js
  ?? backend/services/auth-service/test/multi-role.integration.test.js
  ?? backend/services/order-service/src/features/
  ?? backend/services/order-service/test/
  ?? backend/services/product-service/src/features/moderation/
  ?? backend/services/product-service/test/moderation.integration.test.js
  ?? backend/shared/src/permissions.js
  ?? backend/shared/src/permissions.test.js
  ?? frontend/app/admin/
  ```

## Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม

| Task      | UR              | Workflow        | Test command                                                                                                                                        | ผลล่าสุด                |
| --------- | --------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `ADM-001` | `UR-22`         | `WF-01`         | `REQUIRE_INTEGRATION=1 node --test test/multi-role.integration.test.js` (auth-service)                                                              | pass, 2026-08-25        |
| `ADM-002` | `UR-23`         | `WF-09`         | `REQUIRE_INTEGRATION=1 node --test test/admin-kyc.integration.test.js` (auth-service)                                                               | pass, 2026-08-25        |
| `ADM-003` | `UR-23`,`UR-24` | `WF-09`         | `REQUIRE_INTEGRATION=1 node --test test/admin-reports.integration.test.js` (auth-service) + `test/moderation.integration.test.js` (product-service) | pass, 2026-08-25        |
| `ADM-004` | `UR-25`,`UR-26` | `WF-08`,`WF-09` | `REQUIRE_INTEGRATION=1 node --test test/admin-hold.integration.test.js` (order-service)                                                             | pass, 2026-08-25        |
| `ADM-005` | `UR-26`         | `WF-09`         | `REQUIRE_INTEGRATION=1 node --test test/bounded-bulk.integration.test.js` (auth-service)                                                            | pass ×2 รอบ, 2026-08-25 |

Unit tests ที่เกี่ยวข้อง (`permissions.test.js`, `authMiddleware.test.js`, `app.test.js` ของทั้ง 3
service) รันผ่านครบ ไม่มี regression จากการแก้ในรอบนี้

## Migration/schema change และ recovery note

- `auth-service` (`reloop_auth`, มี migration history เดิมอยู่แล้ว): ใช้ `prisma migrate dev`
  ตามปกติ — migration ใหม่ 3 ตัว: `add_multi_role_foundation`, `add_kyc_applications`,
  `add_reports_and_admin_audit`, `add_bulk_action_runs`
- `product-service` (`reloop_product`) และ `order-service` (`reloop_order`): **ไม่มี migration
  history เดิม** (ตั้งค่าด้วย `prisma db push` มาก่อน) — ใช้ `prisma db push` แทน `migrate dev`
  เพื่อไม่ให้ Prisma พยายาม baseline schema ใหม่ทั้งหมดและเสี่ยง reset database ที่มีข้อมูลอยู่
  (ดู `ADM-DEC-012`, `ADM-DEC-014`) คอลัมน์ใหม่ทั้งหมดเป็น nullable/มี default — ไม่มีข้อมูลเดิม
  สูญหาย
- Recovery note: ยังไม่มี migration history อย่างเป็นทางการสำหรับ `reloop_product`/`reloop_order`
  — ถ้าต้องการในอนาคตต้องทำ baseline migration แยกต่างหาก (นอก scope ของรอบนี้)

## Dependencies and contracts

- เป็นเจ้าของ Auth/RBAC contract ที่ทุก Feature ใช้งาน (`permissions.js`, `requirePermission`)
- ใช้ Seller/Product (moderation command), Buyer/Order (dispute hold/release) ผ่าน API เท่านั้น
  ไม่มีการเขียน DB ข้าม service (ยืนยันด้วย `productModerationClient.js` pattern)
- Customer Service/Chat evidence **ยังไม่มี feature จริง** — `ADM-002` และ `ADM-004` seed ข้อมูล
  ตรงผ่าน Prisma ในเทสต์แทนการสร้าง endpoint ให้ Seller/CS ยื่นเอง (`ADM-DEC-010`, `ADM-DEC-013`)
- KYC เป็น synthetic/test flow และ fund hold เป็น simulation; decision/audit state persist ใน
  PostgreSQL จริงทุกจุด
- `completedOrders` ใน user safety summary ยังเป็น `null`/unavailable — รอ contract review กับ
  เจ้าของ Order (`ADM-DEC-011`)
- API shape, state และ merge gate ต้องตรงกับ [`../integration.md`](../integration.md)

## Blocker และงานที่ยังไม่เสร็จ

- **Blocker หลัก:** รอ Reviewer (อชิรวินท์) ตรวจ evidence ทั้งหมดข้างต้นก่อนเปลี่ยนสถานะเป็น
  Done อย่างเป็นทางการ และก่อนเริ่ม Deferred Security Phase ตาม `decision.md` (`ADM-DEC-004`)
- งานที่ตั้งใจเว้นไว้ (ไม่ใช่ blocker แต่ต้องรู้ก่อน sign-off):
  - Production privileged-audit, encryption, PDPA และ PCI-DSS hardening (`NFR-SP-*`/`NFR-CP-*`)
    — Deferred Security Phase ตามเดิม
  - Auction bounded-batch action — รอ Auction feature จริงจาก Product/Marketing (`ADM-DEC-015`)
  - `completedOrders` cross-service integration กับ order-service — รอ contract review ร่วม
    (`ADM-DEC-011`)
  - CS case/Chat evidence submission endpoint จริง — รอ CS/Chat feature (`ADM-DEC-010`,
    `ADM-DEC-013`)
  - `reloop_product`/`reloop_order` ยังไม่มี migration history อย่างเป็นทางการ (`ADM-DEC-012`,
    `ADM-DEC-014`)

## Next action ที่ทำต่อได้ทันทีหลัง Reviewer ตรวจผ่าน

1. Reviewer ตรวจ evidence ในตารางด้านบน + อ่าน `ADM-DEC-001`–`ADM-DEC-015` ใน `decision.md`
2. ถ้าผ่าน: commit การเปลี่ยนแปลงทั้งหมด (ยังไม่ commit ในรอบนี้) แล้วเปลี่ยนสถานะ `ADM-001`–
   `ADM-005` เป็น Done อย่างเป็นทางการใน `progress.md`
3. เริ่ม Deferred Security Phase (`NFR-SP-*`, `NFR-CP-*`, privileged audit hardening) ตาม scope
   ที่ระบุไว้ใน `plan.md`/`decision.md`

## Required handoff evidence

- Branch/commit และรายการไฟล์ที่เปลี่ยน — ดูหัวข้อด้านบน
- Task ID และ UR/FR/NFR/Workflow ที่ครอบคลุม — ดูตารางด้านบน
- คำสั่งทดสอบ ผลลัพธ์ และวันที่รัน — ดูตารางด้านบน (ทั้งหมดรัน 2026-08-25)
- Migration/schema change และ recovery note ถ้ามี — ดูหัวข้อด้านบน
- Blocker, งานที่ยังไม่เสร็จ และ next action ที่ทำต่อได้ทันที — ดูหัวข้อด้านบน
