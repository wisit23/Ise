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

## ADM-DEC-016 — เปลี่ยนผ่านบทบาท ADMIN เป็น TRUST_AND_SAFETY แบบ 100%

- Date: 2026-09-06
- Status: Accepted
- Decision: ลบและแทนที่บทบาท `ADMIN` ออกจากระบบทั้งหมด 100% โดยเปลี่ยนชื่อและ Enum เป็น `TRUST_AND_SAFETY` (Trust and Safety) ในทุกเลเยอร์ของระบบ:
  - Database Enum `Role` และ `RoleCode` ใน `reloop_auth` schema
  - Shared Permission Catalog (`permissions.js`) และ Token Claims
  - Backend Services (`auth-service`, `product-service`, `order-service`, `support-service`)
  - Frontend Workspace, Navigation, และ Role guards
  - Seed Scripts และ Test Suites
- Reason: บทบาทและหน้าที่หลักของสตาฟฟ์ในกลุ่มนี้คือการตรวจสอบความปลอดภัยของแพลตฟอร์ม (Trust & Safety) ได้แก่ การตรวจ KYC ผู้ขาย, การจัดการข้อพิพาทและพักเงิน (Fund Hold), การลบ/ระงับสินค้าที่ไม่เหมาะสม, การระงับ/ตักเตือนผู้ใช้ตามรายงาน (Reports & Tickets) ไม่ใช่ผู้ดูแลระบบไอที (System Admin) การเปลี่ยนเป็น `TRUST_AND_SAFETY` ทั้งหมดโดยไม่คง `ADMIN` ไว้ช่วยกำจัด Technical Debt ทำให้โค้ดสะอาดและชัดเจนตามหน้าที่จริง (Domain-driven semantics)
- Consequence:
  - ข้อมูลเดิมในฐานข้อมูล `users` และ `user_roles` ที่เคยมี role `ADMIN` ถูก migrate ให้เป็น `TRUST_AND_SAFETY` และตัด `ADMIN` ออกจาก Postgres Enums
  - ผู้ใช้ที่มี active session เดิมด้วย token เก่าจะต้อง login ใหม่เพื่อรับ token ที่มี role `TRUST_AND_SAFETY`
  - หากในอนาคตต้องการบทบาทสำหรับผู้ดูแลระบบเทคนิค/ไอที สามารถเพิ่มบทบาทใหม่แยกต่างหาก (เช่น `SYSTEM_ADMIN` หรือ `SUPER_ADMIN`) ได้โดยไม่สับสนกับงานด้านความปลอดภัยและตรวจสอบ

## ADM-DEC-017 — ลบระบบอนุมัติประมูลออกจากขอบเขตหน้าที่ของ Trust and Safety

- Date: 2026-09-06
- Status: Accepted
- Decision: นำระบบและสิทธิ์การอนุมัติ/ปฏิเสธการประมูล (Auction Approvals) ออกจากขอบเขตหน้าที่ของ `Trust and Safety` โดยสมบูรณ์:
  - **Frontend Workspace (`frontend/app/workspace/page.js`):** นำแท็บ `auction_approvals` ออกจาก `ADMIN_SECTIONS` และลบไฟล์คอมโพเนนต์ `frontend/components/support/sections/AuctionApprovalsSection.js`
  - **Backend Service (`backend/services/product-service/src/features/auctions/auctionService.js`):** ตัดบทบาท `TRUST_AND_SAFETY` ออกจากสิทธิ์ `approve`, `reject`, `schedule`, `cancel`, และ `submit` โดยคงการตรวจสอบสิทธิ์ `approve`/`reject` ไว้เฉพาะบทบาท `MARKETING`
  - **Marketing Boundary:** ไม่แก้ไขโค้ดหรือคอมโพเนนต์ในส่วนของทีม Marketing (`frontend/components/marketing/` ฯลฯ) เพื่อป้องกันความขัดแย้งในการ merge ร่วมกับทีม Marketing ที่รับผิดชอบส่วนนั้น
- Reason: การอนุมัติแคมเปญประมูลและโปรโมชั่นสินค้าเป็นขอบเขตงานของฝ่ายการตลาด (Marketing) ไม่ใช่งานด้านความปลอดภัย ความโปร่งใส และการตรวจสอบชุมชน (Trust & Safety) ซึ่งมุ่งเน้นงานตรวจสอบ KYC, รายงานการกระทำผิด (Reports/Tickets), สินค้าละเมิดกฎ (Product Moderation), และข้อพิพาทการเงิน (Disputes/Fund Hold)
- Consequence: ผู้ใช้งานบทบาท `Trust and Safety` จะไม่เห็นแท็บ "อนุมัติประมูล" ใน Workspace และหากพยายามเรียกใช้ API อนุมัติประมูลด้วยสิทธิ์ Trust & Safety จะได้รับสถานะ 403 Forbidden; การอนุมัติประมูลจะถูกส่งมอบให้ทีมการตลาด (Marketing) จัดการผ่าน UI ของทีมตนเองต่อไป

## ADM-DEC-018 — เปลี่ยนชื่อแท็บและข้อความแสดงผลจาก "เคสระดับแอดมิน" เป็น "เคส Trust & Safety"

- Date: 2026-09-06
- Status: Accepted
- Decision: เปลี่ยนชื่อเรียกแท็บงาน Escalation & Reports และข้อความลิงก์บนแดชบอร์ดจากเดิม `"เคสระดับแอดมิน"` เป็น `"เคส Trust & Safety"`:
  - `frontend/app/workspace/page.js`: แท็บ `admin_inbox` เปลี่ยน label เป็น `"เคส Trust & Safety"`
  - `frontend/components/support/sections/DashboardSection.js`: การ์ด KPI Escalated Tickets เปลี่ยนข้อความนำทางเป็น `sub="ดูที่เคส Trust & Safety"`
- Reason: สืบเนื่องจากการปลดระวางบทบาท `ADMIN` และเปลี่ยนเป็น `TRUST_AND_SAFETY` แบบ 100% ตาม `ADM-DEC-016` การคงชื่อ "เคสระดับแอดมิน" ไว้ในหน้าจอทำให้เกิดความขัดแย้งเชิงความหมาย (Semantic mismatch) และอาจทำให้ผู้ปฏิบัติงานสับสน การใช้ชื่อ "เคส Trust & Safety" สอดคล้องกับชื่อตำแหน่งและทีมงานที่รับผิดชอบโดยตรง มีความกระชับ ชัดเจน และสะท้อนถึงการดูแลเคสส่งต่อและรายงานความปลอดภัย
- Consequence: หน้าจอ Workspace และ Dashboard มีคำศัพท์ที่กลมกลืนเป็นหนึ่งเดียวกับบทบาท Trust & Safety ทั้งหมด ไม่หลงเหลือคำว่า "แอดมิน" ในการใช้งานปกติ

## ADM-DEC-019 — ป้องกันการแบนผู้แจ้งปัญหาผิดพลาด โดยปรับปรุงลำดับและสิทธิ์การจัดการคู่กรณีในตั๋ว Support

- Date: 2026-09-07
- Status: Accepted
- Decision: ปรับปรุงโครงสร้าง UI และขั้นตอนการระงับบัญชี (Ban/Suspend) ในโมดูลจัดการเคสตั๋วและข้อพิพาท เพื่อป้องกันข้อผิดพลาดที่เจ้าหน้าที่แบนผู้แจ้งปัญหา (Requester) แทนคู่กรณีที่เป็นผู้ถูกร้องเรียน (Target):
  - **จัดลำดับการแสดงผลใหม่ (Target First):** ใน `TicketCasePanel.js` สลับนำการ์ด `คู่กรณี (Target - ผู้ถูกร้องเรียน)` มาแสดงเป็นอันดับแรกด้านบนสุดของหน้าต่างตรวจสอบเคส และนำ `ผู้แจ้ง (Requester - ผู้ส่งคำร้อง)` ไปไว้ด้านล่าง
  - **แยกสไตล์และข้อความปุ่มดำเนินการ (Button Distinctiveness):**
    - สำหรับคู่กรณี: แสดงปุ่มเน้นสีแดงเด่นชัด `[แบนคู่กรณี]` และ `[ตักเตือนคู่กรณี]`
    - สำหรับผู้แจ้งปัญหา: ปรับปุ่มแบนเป็นสไตล์เตือนระวังแบบรอง (Subtle Outline/Ghost) ข้อความ `[แบนผู้แจ้ง (ระวัง)]` เพื่อให้เจ้าหน้าที่ต้องระมัดระวังเป็นพิเศษก่อนกดดำเนินการกับผู้ที่ส่งคำร้องเข้ามา
  - **ระบบรองรับคู่กรณีที่ไม่ได้ผูกอัตโนมัติ (Fallback Target Input):** หากตั๋วไม่ได้ผูกกับ Order หรือ `targetId` เป็นค่าว่าง ระบบจะแสดงกล่องแจ้งเตือนสีส้มพร้อมช่องกรอก User ID ของคู่กรณีด้วยตนเอง เพื่อให้เจ้าหน้าที่ Trust & Safety สามารถระบุตัวผู้ถูกร้องเรียนและสั่งตักเตือน/แบนได้โดยตรง แทนที่จะเห็นเพียงผู้แจ้งปัญหาคนเดียว
  - **ปรับปรุงโมดอลยืนยัน (Explicit Confirmation Context):** ใน `AdminInboxSection.js` ข้อความและชื่อปุ่มบน `ConfirmDialog` จะระบุชัดเจนว่ากำลังดำเนินการกับ "คู่กรณี" หรือ "ผู้แจ้งปัญหา" พร้อมระบุ User ID และหากเป็นการดำเนินการกับผู้แจ้งจะมีไอคอนเตือน `⚠️ ยืนยันการระงับบัญชีผู้แจ้งปัญหา?` เพื่อป้องกันความเข้าใจผิด
  - **ปรับปรุงตารางคิวเคส (AdminInboxTable.js):** แทนที่คอลัมน์เดิมที่แสดงเพียง `requesterId` ด้วยคอลัมน์ `คู่กรณี / ผู้แจ้ง` เพื่อแสดงรหัสคู่กรณี (สีส้มเด่นชัด) ควบคู่กับผู้แจ้งปัญหาตั้งแต่ภาพรวมในตาราง
  - **อัปเดต Seed & Database:** ผูก `targetId` ในตั๋ว `#CS-000002` (เคสข้อพิพาท) เข้ากับบัญชีร้านค้า Denim Seller (`10000000-0000-0000-0000-000000000001`) และปรับปรุง seed upsert ให้ sync ค่า `targetId` เสมอ
- Reason: จากการทดสอบพบว่าเมื่อผู้แจ้งเปิดตั๋วร้องเรียน (เช่น ผู้ซื้อร้องเรียนผู้ขาย) หากตั๋วไม่ได้ผูก targetId หรือหน้า UI วางการ์ดผู้แจ้งไว้ด้านบนสุดพร้อมปุ่ม "แบนผู้ใช้นี้" สีแดง เจ้าหน้าที่จะเข้าใจผิดว่าปุ่มนั้นคือการลงโทษคนที่ถูกร้องเรียน ส่งผลให้เกิดการแบนบัญชีของผู้เสียหาย/ผู้แจ้งปัญหาผิดพลาด
- Consequence: เจ้าหน้าที่ Trust & Safety สามารถเห็นและดำเนินการกับคู่กรณีที่ถูกร้องเรียนได้อย่างถูกต้อง ชัดเจน และลดความเสี่ยงจากการแบนผู้ใช้งานผิดบัญชีโดยสิ้นเชิง

## ADM-DEC-020 — ปรับปรุงสถาปัตยกรรม Backend สำหรับ Trust & Safety (Atomicity, Complete Audit, Bulk Registry & S2S Resilience)

- Date: 2026-09-07
- Status: Accepted
- Decision: Refactor ปรับปรุงคุณภาพโค้ดและสถาปัตยกรรม Backend ในส่วนของระบบ Trust & Safety ครอบคลุมทั้ง 4 Microservices:
  - **Database Transactions (`prisma.$transaction`):**
    - `auth-service (adminKycService.js)`: การตัดสิน KYC (`decideKyc`) รวมการอัปเดตสถานะใบสมัคร `kycApplication`, สถานะผู้ขาย `sellerProfile`, และการบันทึก Audit Log เข้าด้วยกันใน Transaction เดียว เพื่อป้องกันความไม่สอดคล้องของข้อมูลกรณีเกิดความผิดพลาดในจุดใดจุดหนึ่ง
    - `order-service (adminDisputeService.js)`: การพักเงิน (`holdSimulatedFunds`) และการคืนเงิน (`releaseSimulatedFunds`) ถูกห่อหุ้มใน Transaction เดียวกันกับการบันทึกประวัติการตรวจสอบ `disputeAudit`
  - **บันทึก Audit Trail ของ KYC ครบ 100%:** เพิ่มการบันทึก `adminAudit` สำหรับการอนุมัติและปฏิเสธ KYC (`KYC_APPROVED`, `KYC_REJECTED`) ปิดช่องว่างตามข้อกำหนดความปลอดภัย `NFR-SP-03`
  - **ขยาย Action Registry ใน Bulk Moderation Engine:** เพิ่มคำสั่ง `WARN_USER` (ตักเตือนผู้ใช้) และ `RESTORE_USER` (ปลดการระงับผู้ใช้) เข้าสู่ `actionRegistry.js` ใน `auth-service` รองรับการ Dry-run, Idempotency และ Batch Limit อย่างสมบูรณ์
  - **ความทนทานในการเรียกข้าม Service (S2S Resilience):** เพิ่ม Timeout 5,000ms ผ่าน `AbortSignal.timeout` ใน `productModerationClient.js` พร้อมจัดการข้อผิดพลาดระดับ HTTP 504 Gateway Timeout อย่างชัดเจน ป้องกันปัญหา Thread หรือ Connection ค้างเมื่อ `product-service` ตอบสนองช้า
  - **ยกระดับสิทธิ์กำกับดูแลใน Support Service:** ปรับปรุง `assertAccess` ใน `ticketService.js` ให้ผู้ใช้งานบทบาท `TRUST_AND_SAFETY` สามารถเปิดดูรายละเอียดของตั๋วทุกใบได้ (รวมถึงตั๋วที่มีเจ้าหน้าที่ CS รับผิดชอบอยู่และถูกส่งต่อมา) แก้ไขปัญหา 403 Forbidden เดิมที่เคยถูกบันทึกเป็นข้อจำกัดไว้
  - **ปรับปรุง Domain Naming และ Input Sanitization:** ทำความสะอาดพารามิเตอร์ภายในเป็น `actorId` / `staffId` (พร้อมคง backward compatibility สำหรับ `adminId`) และทำการตัดช่องว่างข้อความ (trim) เหตุผลก่อนบันทึกลงฐานข้อมูลเสมอ
- Reason: กำจัด Technical Debt, เสริมความเสถียรของฐานข้อมูล (ACID Transactional Guarantees), ป้องกันการค้างของการเรียกข้ามเครือข่าย และทำให้สิทธิ์การกำกับดูแลของฝ่าย Trust & Safety ชัดเจนสมบูรณ์
## ADM-DEC-021 — ปรับปรุงสถาปัตยกรรมและประสบการณ์ผู้ใช้งาน Frontend ฝั่ง Trust & Safety (UX Consistency, Confirmation Modals, Pagination & Complete Terminology)

- Date: 2026-09-07
- Status: Accepted
- Decision: Refactor ปรับปรุงโค้ดและประสบการณ์ผู้ใช้งาน (UX/UI) ของโมดูล Trust & Safety บน Frontend ทั้งหมด:
  - **KycSection (`frontend/components/support/sections/KycSection.js`):**
    - เพิ่มตัวกรองสถานะคำขอ (`PENDING`, `VERIFIED`, `REJECTED`, `ALL`) ช่วยให้เจ้าหน้าที่สามารถตรวจสอบประวัติการอนุมัติและปฏิเสธย้อนหลังได้
    - เพิ่มระบบ Pagination เชื่อมต่อกับ backend paginated API
    - เพิ่ม `ConfirmDialog` ก่อนดำเนินการอนุมัติ (`VERIFY`) หรือปฏิเสธ (`REJECT`) เพื่อป้องกันข้อผิดพลาดจากการกดผิดพลาด พร้อมระบบแจ้งเตือนผลลัพธ์ผ่าน Toast
    - ปรับปรุงการแสดงผลการ์ดร้านค้าและสถานะด้วย `Badge` ในธีม Emerald/Slate ให้สวยงามและเป็นระเบียบ
  - **AuditSection (`frontend/components/support/sections/AuditSection.js`):**
    - ปรับคำศัพท์หัวข้อและคอลัมน์เป็น `"Audit Log ของ Trust & Safety"` และ `"ผู้ดำเนินการ (Staff ID)"`
    - แก้ไขการแมปข้อมูลฟิลด์ให้ตรงกับฐานข้อมูลจริง (`actorId`, `targetId`, `reason`)
    - เพิ่มตัวกรองการกระทำ (Action Filter) แบบ Dropdown สำหรับคำสั่งสำคัญ (`USER_SUSPENDED`, `WARN_USER`, `USER_RESTORED`, `KYC_APPROVED`, `KYC_REJECTED`, `PRODUCT_REMOVED`, `PRODUCT_RESTORED`) ควบคู่กับช่องค้นหา Target ID
    - เพิ่ม Pagination รองรับการดูประวัติขนาดใหญ่
  - **ProductsSection (`frontend/components/support/sections/ProductsSection.js`):**
    - ปรับปรุงสถานะสินค้าที่ถูกระงับเป็น `"ถูกระงับโดย Trust & Safety"`
    - เพิ่ม Pagination ในหน้าผลการค้นหาสินค้า
    - เสริมการแจ้งเตือนความสำเร็จผ่าน Toast เมื่อกู้คืนสินค้า
  - **AdminDisputeDetailPage (`frontend/app/admin/disputes/[id]/page.js`):**
    - ห่อหุ้มคำสั่งระงับเงิน (`hold`) และปล่อยเงิน (`release`) ด้วย `ConfirmDialog` ที่ระบุจำนวนเงินและผลกระทบอย่างชัดเจน
    - ปรับปรุงข้อความคำเตือนให้อ้างอิงถึงฝ่าย Trust & Safety
  - **AdminInboxSection (`frontend/components/support/sections/AdminInboxSection.js`):**
    - ปรับปรุงข้อความในโมดอลยกระดับตั๋ว (Escalate) เป็น `"ส่งต่อให้ทีม Trust & Safety?"`
- Reason: ปลดเปลื้อง Technical Debt ในฝั่ง Frontend, ลดความเสี่ยงจากการกดสั่งการผิดพลาด (Accidental actions), รองรับการสืบค้นข้อมูลจำนวนมากอย่างมีประสิทธิภาพด้วย Pagination และทำให้คำศัพท์บนหน้าจอทั้งหมดสอดคล้องกับบทบาท Trust & Safety อย่างสมบูรณ์ 100%
- Consequence: ประสบการณ์การใช้งานของเจ้าหน้าที่ Trust & Safety มีความปลอดภัย ชัดเจน และเป็นมาตรฐานเดียวกันในทุกหน้าจอ ไม่หลงเหลือคำว่า "แอดมิน" ในข้อความแสดงผล

## ADM-DEC-022 — ศูนย์ค้นหาข้อมูลอเนกประสงค์ (Unified Search Center) และการควบคุมบัญชีผู้ใช้โดยตรง (Direct Moderation)

- Date: 2026-09-08
- Status: Accepted
- Decision: ปรับปรุงหน้าแท็บ "ค้นหา" ใน Workspace จากเดิมที่ค้นหาได้เพียงรหัสคำสั่งซื้อ ให้กลายเป็น **"ศูนย์ค้นหาข้อมูล Trust & Safety (Unified Search Center)"** ที่สามารถเลือกค้นหาประเภทข้อมูลได้หลากหลาย พร้อมแสดงโปรไฟล์ ประวัติ และดำเนินการทางวินัยได้ในที่เดียว:
  - **การค้นหาแบบเลือกประเภท (Multi-Entity Search Dropdown):**
    - `orderId`: ค้นหารหัสคำสั่งซื้อ แสดงการ์ดคำสั่งซื้อ ยอดเงิน สถานะ พร้อมปุ่มด่วน `[ตรวจสอบผู้ซื้อ]` และ `[ตรวจสอบผู้ขาย]` เพื่อสลับไปดูประวัติผู้ใช้งานได้ทันที
    - `buyerId`: ค้นหาด้วยรหัสผู้ซื้อ (Buyer ID หรือ Email)
    - `sellerId`: ค้นหาด้วยรหัสผู้ขาย (Seller ID, Email หรือชื่อร้านค้า Shop Name)
    - `userId`: ค้นหาด้วยรหัสบัญชีผู้ใช้ทั่วไป (User ID หรือ Email)
  - **การ์ดโปรไฟล์และความปลอดภัย (User Profile & Safety Summary Card):**
    - แสดงชื่อ, อีเมล, เบอร์โทร, บทบาทผู้ใช้, สถานะบัญชี (`ACTIVE` / `SUSPENDED`) พร้อมปุ่มคัดลอก User ID
    - สถิติด้านความปลอดภัย 3 ด้าน: จำนวนรายงานที่ได้รับ (`reportCount`), การตักเตือน (`warningCount`), และประวัติการระงับบัญชี (`suspensionCount`)
    - ข้อมูลผู้ขาย (Seller Profile): แสดงชื่อร้านค้า, สถานะ KYC (`VERIFIED` / `PENDING` / `REJECTED`), เลขบัตรประชาชน, บัญชีธนาคาร และที่อยู่
  - **ระบบดำเนินการควบคุมความปลอดภัยโดยตรง (Direct Moderation Actions):**
    - `[ตักเตือนผู้ใช้ (Warn)]`: บันทึกการตักเตือนลงในฐานข้อมูลความปลอดภัยพร้อมระบุเหตุผล
    - `[ระงับบัญชี (Ban)]`: แบนผู้ใช้ที่มีพฤติกรรมละเมิดกฎทันที
    - `[ปลดการระงับ (Restore)]`: กู้คืนสถานะบัญชีที่ถูกแบนกลับมาเป็นปกติ
    - ทุกคำสั่งดำเนินการต้องผ่านการยืนยันและระบุเหตุผลผ่าน `ConfirmDialog` เพื่อบันทึกลงใน Audit Log และแสดงผลลัพธ์ผ่าน `ToastProvider` ทันที
  - **รายการคำสั่งซื้อที่เกี่ยวข้อง (Associated Orders List):**
    - แสดงรายการคำสั่งซื้อจริงทั้งหมดของผู้ซื้อ/ผู้ขายรายนั้น พร้อมสถานะและยอดเงิน
  - **Backend Support (`auth-service`):**
    - เพิ่มฟังก์ชัน `getUserDetail(identifier)` ใน `reportService.js` ค้นหาผู้ใช้จาก ID, Email หรือชื่อร้านค้า พร้อมดึง `safetySummary` และ `sellerProfile`
    - เพิ่ม Route `GET /admin/users/:id` รองรับสิทธิ์ `admin:report:read` และ `support:case:read`
- Reason: ตอบสนองความต้องการของผู้ใช้งานที่ต้องการให้หน้าค้นหาสามารถทำงานได้จริงตามประเภทใน Dropdown ช่วยให้เจ้าหน้าที่ Trust & Safety สามารถตรวจสอบประวัติบุคคล (ผู้ซื้อ/ผู้ขาย) ความเสี่ยง ความน่าเชื่อถือ และสั่งการระงับหรือตักเตือนได้จากศูนย์ค้นหาทันทีโดยไม่ต้องสลับหน้าจอไปมา
- Consequence: เจ้าหน้าที่สามารถสืบค้นและระงับยับยั้งผู้กระทำผิดได้อย่างรวดเร็ว มีข้อมูลประกอบการตัดสินใจครบถ้วนทั้งประวัติ KYC, สถิติความปลอดภัย และประวัติคำสั่งซื้อ
