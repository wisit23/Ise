# Admin Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## ADM-DEC-001 — Vertical Admin ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Admin Owner รับผิดชอบ `UR-22`–`UR-26` แบบ vertical ตั้งแต่ UI, API, RBAC/admin rules, PostgreSQL tests และเอกสาร
- Reason: รวม staff-control behavior และหลักฐานการตัดสินใจไว้ที่ Owner เดียว
- Consequence: Product, Order และ Chat owner ต้องร่วม review command contract ที่กระทบข้อมูลของตน

## ADM-DEC-002 — Central Auth/RBAC contract

- Date: 2026-08-10
- Status: Accepted
- Decision: Admin/Auth เป็น provider ของ role และ permission catalog สำหรับทุก Feature
- Reason: ป้องกันแต่ละ service นิยาม role/permission ไม่ตรงกัน
- Consequence: Frontend visibility ไม่ถือเป็น authorization และการเปลี่ยน permission contract ต้อง review ร่วมทุก Role

## ADM-DEC-003 — Synthetic KYC and simulated fund hold

- Date: 2026-08-10
- Status: Accepted
- Decision: KYC review ใช้ synthetic data และ fund hold เป็น simulation เท่านั้น
- Reason: รองรับ functional workflow โดยไม่ใช้ข้อมูลส่วนบุคคลหรือเงินจริง
- Consequence: KYC decision, moderation, dispute และ hold state ต้อง persist ใน PostgreSQL จริงพร้อม audit evidence

## ADM-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Privileged audit/security/PDPA hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้

## ADM-DEC-005 — Legacy role fallback แทน bulk backfill migration

- Date: 2026-08-24
- Status: Accepted
- Decision: ผู้ใช้เดิมที่ยังไม่มีแถวใน `UserRole` จะ resolve permission จาก legacy `role`
  column แบบ on-the-fly (`authService.getUserRoles`); แถว `UserRole` จะถูกสร้างจริง
  (materialize) ก็ต่อเมื่อมีการ `assignRole`/`removeRole` ครั้งแรกกับ user คนนั้น
- Reason: หลีกเลี่ยงการรัน migration ที่แก้ข้อมูลผู้ใช้ทั้งหมดพร้อมกันในรอบที่ Reviewer
  ยังไม่ได้ตรวจ contract; ลดความเสี่ยงต่อข้อมูลจริงและยังคง freshness ได้เพราะ
  `getUserRoles` query สดทุกครั้งที่ออก token (ไม่มี cache ค้าง)
- Consequence: ทุก permission resolution มี fallback query เพิ่ม 1 ครั้งกรณียังไม่มีแถว;
  ต้องมีเทสต์คลุม fallback path (มีแล้วใน `multi-role.integration.test.js`) ก่อนนับ
  `ADM-001` เป็น Done

## ADM-DEC-006 — คง legacy `role` column ไว้ ไม่ลบใน ADM-001

- Date: 2026-08-24
- Status: Accepted
- Decision: คง `Role` enum (`BUYER/SELLER/ADMIN`) และ column `role` บน `User` ไว้ตามเดิม
  ควบคู่กับ `RoleCode`/`UserRole` ใหม่ ไม่ลบหรือ migrate ออกในรอบนี้
- Reason: จุดอื่นในระบบ (register, seller lookup, refresh token payload) ยังอ้างอิง
  `user.role` โดยตรง; การลบ column พร้อมกับเพิ่ม RBAC ใหม่จะขยาย scope เกิน `ADM-001`
  และเพิ่มความเสี่ยง breaking change โดยไม่จำเป็น
- Consequence: มี 2 แหล่งความจริงชั่วคราว (`role` column กับ `UserRole` table); ต้องตัดสินใจ
  ในรอบถัดไปว่าจะ deprecate `role` column เมื่อไหร่ — แนะนำก่อนเข้า Deferred Security Phase

## ADM-DEC-007 — `requirePermission` ใช้ error contract ใหม่, `requireRole` เดิมคงไว้ไม่แตะ

- Date: 2026-08-24
- Status: Accepted
- Decision: `requirePermission` คืน `403 {error:{code,message,requestId}}` ตาม response
  contract ใน `integration.md`; `requireRole` เดิมยังคง `{error:"Forbidden"}` แบบเก่า
  โดยไม่แก้
- Reason: การเปลี่ยน `requireRole` ทันทีกระทบทุก route ที่ service อื่นใช้อยู่แล้วข้าม
  service — เป็น breaking change นอก scope `ADM-001`; route permission-based ใหม่ทั้งหมด
  ใช้ contract ใหม่ตั้งแต่ต้นแทน
- Consequence: มี error shape สองแบบอยู่คู่กันชั่วคราวในระบบ; ทีมต้องวางแผน migrate route
  เก่าจาก `requireRole` ไป `requirePermission` เป็นงานแยกต่างหาก ไม่ใช่ทำพร้อมกันรอบนี้

## ADM-DEC-008 — บังคับ user ต้องมีอย่างน้อย 1 role เสมอ (server-side invariant)

- Date: 2026-08-24
- Status: Accepted
- Decision: `removeRole` ปฏิเสธ (throw `409 conflict`) เมื่อเป็นการลบ role สุดท้ายที่เหลืออยู่
  ของ user แทนที่จะยอมให้เหลือ 0 roles
- Reason: user ที่ไม่มี role เลยจะผ่าน permission check ไม่ได้ทุก action และขัดกับ identity
  contract ใน `integration.md` ที่กำหนดว่า `roles: [...]` ต้องไม่ว่าง
- Consequence: Admin UI ที่จะทำใน `ADM-005` (audit/bulk role management) ต้อง handle `409`
  นี้เป็นเคส validation ปกติ ไม่ใช่ bug; ยังไม่มี UI จริงในรอบนี้จึงยังไม่ได้ทดสอบฝั่ง frontend

  ## ADM-DEC-009 — KycApplication แยกจาก SellerProfile.kycStatus

- Date: 2026-08-25
- Status: Accepted
- Decision: เก็บ KYC submission เป็น model แยก (`KycApplication`, 1-to-many กับ User)
  แทนการใช้แค่ field เดี่ยวใน `SellerProfile`; `SellerProfile.kycStatus` ยังอยู่
  แต่เป็นแค่ "สถานะล่าสุด" ที่ sync มาจาก decision ล่าสุด
- Reason: `plan.md` Step 4 ต้อง verify "resubmission state" ได้ — field เดี่ยวเก็บได้แค่
  สถานะปัจจุบัน ไม่มีที่เก็บประวัติ/evidence แต่ละรอบเพื่อ audit ย้อนหลังตาม `decision.md`
  ADM-DEC-003 (ต้อง persist evidence จริงใน PostgreSQL)
- Consequence: มี 2 ที่เก็บ KYC state ที่ต้อง sync กันทุกครั้ง (`decideKyc` เขียนทั้งคู่ใน
  คำสั่งเดียวกัน); ถ้า Seller feature (`SEL-001`) เพิ่ม endpoint submit เอง ต้องอ้าง contract
  นี้ ไม่สร้าง table ใหม่ซ้ำ

## ADM-DEC-010 — ทดสอบด้วยการ seed ข้อมูลตรง แทนสร้าง endpoint submit ให้ Seller

- Date: 2026-08-25
- Status: Accepted
- Decision: `admin-kyc.integration.test.js` seed `User`/`SellerProfile`/`KycApplication`
  ผ่าน Prisma ตรงๆ แทนการเรียก HTTP endpoint เพื่อ "ยื่นใบสมัคร" เพราะ ADM-002 ยังไม่มี
  endpoint แบบนั้น
- Reason: การยื่นใบสมัคร KYC เป็นขอบเขตของ Seller/`SEL-001` ตาม `ADM-DEC-001`
  (vertical ownership) — Admin เป็นเจ้าของแค่ฝั่งตัดสินใจ ไม่ควรสร้าง endpoint submit
  เองเพื่อความสะดวกของเทสต์
- Consequence: เมื่อ Seller ทำ `SEL-001` เสร็จและมี endpoint submit จริง ควรเพิ่ม
  contract-level integration test คู่ service (Admin decide ต่อจาก Seller submit) แยก
  จากเทสต์นี้ — ยังไม่ได้ทำในรอบนี้

  ## ADM-DEC-011 — completedOrders unavailable แทนเรียก order-service ข้าม scope

- Date: 2026-08-25
- Status: Accepted (interim)
- Decision: `getUserSafetySummary` คืน `completedOrders: null, completedOrdersAvailable: false`
  แทนการเพิ่ม endpoint ใน order-service เพื่อดึงข้อมูลจริงตอนนี้
- Reason: order-service ไม่อยู่ใน file list ที่ `plan.md` กำหนดให้ `ADM-003` แตะ; การเพิ่ม
  endpoint/contract ใหม่ใน service ของ owner อื่นโดยไม่มี review ก่อนขัดกับกติกาใน
  `integration.md` ("ห้ามให้สอง Feature แก้ migration หรือ status enum เดียวกันโดยไม่มีลำดับ
  merge"); คืนค่า null สอดคล้องกับ Gate 1 ("Dashboard แสดง unavailable/partial state โดยไม่
  ปลอมเป็นเลขศูนย์")
- Consequence: หน้า Admin ที่จะแสดง safety summary ต้อง handle `completedOrdersAvailable:false`
  เป็น UI state จริง (เช่น "ไม่มีข้อมูล" ไม่ใช่ "0 รายการ"); ต้องเปิด PR แยกร่วมกับเจ้าของ Order
  เพื่อเพิ่ม endpoint จริงในรอบถัดไป — ยังไม่ได้ทำ

## ADM-DEC-012 — product-service ใช้ `prisma db push` ต่อ ไม่สร้าง migration baseline

- Date: 2026-08-25
- Status: Accepted
- Decision: เพิ่มคอลัมน์ moderation ใหม่ใน `reloop_product` ด้วย `prisma db push` แทน
  `prisma migrate dev`
- Reason: `reloop_product` ไม่มี migration history เดิม (ตั้งค่าด้วย `db push` มาก่อน) —
  การรัน `migrate dev` ตอนนี้จะพยายาม baseline schema ทั้งหมดใหม่และมีความเสี่ยงต้อง reset
  database ที่มีข้อมูลอยู่แล้ว
- Consequence: `reloop_product` ยังไม่มี migration history เป็นทางการ — ถ้าต้องการ migration
  history จริงในอนาคตต้องทำ baseline migration แยกต่างหาก (นอก scope ของ `ADM-003`)

  ## ADM-DEC-013 — Dispute evidence ยัง seed ตรง ไม่สร้าง endpoint ให้ CS/Chat

- Date: 2026-08-25
- Status: Accepted (interim)
- Decision: `DisputeEvidence` ถูก populate ผ่าน Prisma โดยตรงในเทสต์ แทนการสร้าง endpoint
  ให้ CS case/Chat ส่งเข้ามาจริงตอนนี้
- Reason: CS/Chat evidence projection ที่ `plan.md` ระบุว่า `ADM-004` "Consumes" ยังไม่มี
  feature นั้นในระบบเลย; การให้ Admin ออกแบบ contract รับ evidence เองตอนนี้จะเดา schema
  ที่ CS/Chat ต้องการจริงและขัดกับ `integration.md` (cross-feature contract ต้องมี Reviewer
  ของทั้งสองฝั่งร่วมก่อน merge) — หลักการเดียวกับ `ADM-DEC-010`
- Consequence: เมื่อ CS/Chat feature เกิดขึ้นจริง ต้องเปิด PR contract review ร่วมกันก่อนเพิ่ม
  endpoint ให้ CS ส่ง evidence เข้า `DisputeEvidence` — ยังไม่ได้ทำในรอบนี้

## ADM-DEC-014 — order-service ใช้ prisma db push เหมือน product-service

- Date: 2026-08-25
- Status: Accepted
- Decision: เพิ่มคอลัมน์/ตาราง dispute ใหม่ใน `reloop_order` ด้วย `prisma db push`
- Reason: `reloop_order` ไม่มี migration history เดิมเช่นเดียวกับ `reloop_product`
  (ดู `ADM-DEC-012`) — เหตุผลและความเสี่ยงเดียวกันทุกประการ
- Consequence: เช่นเดียวกับ `ADM-DEC-012` — ยังไม่มี migration history อย่างเป็นทางการ
  สำหรับ `reloop_order`

## ADM-DEC-015 — ตัด Auction ออกจาก ADM-005, ใช้ action-registry แทน

- Date: 2026-08-25
- Status: Accepted
- Decision: ไม่สร้าง `adminAuctionRoutes.js`/ไม่แก้ `product-service` schema ตามที่ `plan.md`
  ระบุไว้เดิม; แทนที่ด้วย bounded-batch engine แบบ action-registry ที่มี `SUSPEND_USER`
  เป็น action แรก และออกแบบให้เพิ่ม `AUCTION_DECISION` ได้ในอนาคตแบบเพิ่ม entry เดียว
- Reason: `database/ER-changes.md` ระบุชัดว่า `Auction` อยู่นอก Release A scope **ทั้งโปรเจกต์**
  ("no shipped feature needs them yet") แม้แต่ Seller's `SEL-005` เองก็ยัง "Consumes" contract
  auction ที่ยังไม่มีคนสร้าง — การให้ Admin สร้าง `Auction` model เองตอนนี้จะขัด Release A
  boundary ที่กำหนดไว้ระดับโปรเจกต์ ไม่ใช่แค่ scope ของ Admin เอง
- Consequence: `POST /admin/bulk` ตอนนี้ใช้งานได้จริงกับ `SUSPEND_USER` เท่านั้น; เมื่อ Auction
  feature ถูกสร้างจริง (Product/Marketing เป็นเจ้าของ) ต้องเพิ่ม handler ใน `actionRegistry.js`
  พร้อม permission ใหม่ (เช่น `admin:auction:decide`) — ไม่ต้องแก้ `bulkActionService.js`,
  `bulkActionRoutes.js` หรือเทสต์ `bounded-bulk.integration.test.js` ที่มีอยู่
