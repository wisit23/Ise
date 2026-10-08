# Marketing Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-08`–`UR-16`
- กำหนด Campaign CRUD/approval/conversion เป็น Core
- กำหนด segmentation/content/auction/swipe เป็น Extended
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-08`–`UR-16` พร้อม FR, NFR, Workflow และ Task/Phase
- เพิ่ม PostgreSQL acceptance สำหรับ Campaign, approval/publish, Order attribution,
  segment/content และ auction/bid data
- ยืนยัน Conversion จาก persisted completed attributed Orders ไม่ใช่ click fixture
- ระบุ `UR-11` ไม่มี FR Swipe เฉพาะ และ `UR-10` ไม่มี Workflow ประมูลเฉพาะใน Req Doc
- ย้าย production authorization/privacy/push security hardening ไป Deferred Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Marketing implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `MKT-001`–`MKT-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, Campaign ownership, attribution contract และ deferred security decisions
- ไม่มี Marketing implementation/database change ในรายการนี้

## 2026-08-10 — Post-Pull `UR-11` Reconciliation

- พบ Product-owned video feed และ `/swipe` UI ใน source ที่ pull มา แต่ยังไม่มี persisted choose action
- คง Marketing `MKT-005` เป็น requirement owner, Seller/Product เป็น provider และ Buyer เป็น consumer
- ปรับ plan, progress, handoff และ decision ให้แยก source baseline ออกจาก `UR-11` acceptance
- Campaign, Attribution และ Auction ยังคงไม่มี implementation/acceptance evidence จาก pull นี้
- ไม่ได้แก้ Marketing application code หรือรัน Marketing PostgreSQL acceptance test

## 2026-08-26 — Auctions Close on Time Without Anyone Visiting the Page

- Previously an auction only closed (and created the winner's Order) when someone happened to
  load `/auctions/:id` or the API after `scheduledEndAt` — closing was purely a side effect of a
  read (`maybeAdvance`), so an auction nobody looked at after it ended just sat in `open` forever
  with no Order ever created
- Added `backend/services/product-service/src/jobs/auctionCloseQueue.js` (BullMQ + Redis,
  already provisioned in `docker-compose.yml` but unused until now): `schedule()` books a
  delayed job at the exact `scheduledEndAt`; `cancel()` removes it; a `Worker` started in
  `server.js` fires the same `auctionService.get()` path a page visit would have triggered
- `maybeAdvance` (the lazy read-time check) is kept as a fallback in case Redis was ever down
  when a schedule happened — not removed
- Verified live: scheduled an auction for 15s out, deliberately never called the API/UI again,
  confirmed via direct `psql` (not the API, to rule out the lazy fallback) that it closed within
  ~100ms of `scheduledEndAt`
- Unit tests updated to mock `auctionCloseQueue` (Redis is not reachable in a plain
  `node --test` run); all 31 tests still pass

## 2026-08-26 — Seller Auction Submission Creates a New Product

- `/seller/auctions` no longer picks an existing store listing — it's now the same product-creation
  form as `/sell` (photos, title, description, category, condition, size, location, tags) plus
  `startingPrice`/`bidIncrement`, and on submit creates the Product then the auction in one action
- Also fixed: `auctionRepository` never included `product.photos`, so every auction card/detail page
  showed no image — added `photos` to the `product` include on create/findById/list/updateStatus

## 2026-08-26 — Bulk Scheduling on `/marketing/auctions`

- Added checkbox multi-select to `/marketing/auctions` plus a shared schedule bar so Marketing
  can apply the same open/close window to several approved auctions in one action instead of
  filling the form per item — no backend change, fires the existing `PATCH /:id/schedule`
  once per selected id via `Promise.allSettled`
- Verified through the real UI: selected 2 approved auctions, submitted once, both received the
  same `scheduledStartAt`/`scheduledEndAt` and moved to `scheduled`

## 2026-08-26 — MKT-005 Auction Core + UR-11 Choose Implemented

- Added `AuctionItem`/`Bid` to `reloop_product` and `SwipeChoice` (the `UR-11` choose action) to
  the same database; added `orders.auction_id` to `reloop_order`
- Implemented the full auction lifecycle in `backend/services/product-service/src/features/auctions/`:
  submit (Seller), approve/reject (Admin), schedule/cancel (Marketing), lazy open/close by wall
  clock, bid placement serialized with a Postgres advisory lock, idempotent bids
- Auction close automatically creates the winner's Order via a new internal
  `POST /internal/from-auction` on order-service — recorded as `MKT-DEC-007`
- Implemented the `UR-11` choose action (`POST /api/products/videos/:id/choose`,
  `SwipeChoice` model) as a bookmark separate from bidding — recorded as `MKT-DEC-006`
- Added `MARKETING`, `CUSTOMER_SERVICE`, `EXECUTIVE` to the `Role` enum in `reloop_auth`
  (previously only `BUYER`/`SELLER`/`ADMIN` existed) plus a seeded `marketing@example.com` demo
  account
- Frontend: `/marketing/auctions` (Marketing schedule/cancel), `/seller/auctions` (Seller
  submission), `/auctions` + `/auctions/:id` (Buyer browse/bid), choose button on
  `SwipeVideoCard`; `NavBar` links added for all three
- Verified with 17 new `node --test` unit tests (all passing, full existing product-service
  suite still green at 31/31) and a full manual walkthrough against the real Docker stack:
  submit → approve → schedule → auto-open → bid (including a real advisory-lock bug found and
  fixed — `pg_advisory_xact_lock` returns `void`, which `$queryRaw` can't deserialize, switched
  to `$executeRaw`) → auto-close → Order auto-created, confirmed both via API/psql and through
  the live browser UI
- `MKT-001`–`MKT-004` (Campaign, Attribution, Segmentation, Content) remain untouched — no
  application code exists for them yet

## 2026-08-10 — Swipe Baseline Correctness Refactor

- Product-owned video feed แสดงเฉพาะสินค้า `available` และ seller identity มาจาก signed token
- Swipe UI เล่นเฉพาะ active card และมี focused tests แล้ว
- การเปลี่ยนแปลงนี้ปรับ baseline provider/consumer ให้ถูกต้องขึ้น แต่ยังไม่มี choose persistence,
  Campaign, Attribution หรือ Marketing PostgreSQL acceptance จึงไม่ใช่ `UR-11` acceptance

## 2026-08-26 — Consolidate into a Panel (Same as CS/Admin) + Dashboard Overview

รวม `/marketing/layout.js` + `/marketing/auctions/page.js` (Top-tab เดิมมีแค่ 1 Tab) เข้าเป็น
`/marketing/page.js` เดียว รูปแบบ Sidebar + Section Switch เดียวกับ `/workspace` ตามที่ผู้ใช้ขอ
ให้ทุก Role-panel ในระบบใช้ Format เดียวกัน — Logic การตั้งเวลา/ยกเลิกประมูลเดิมย้ายเป็น
`AuctionScheduleSection.js` ไม่มีการเปลี่ยนพฤติกรรม แค่ Restyle ด้วย UI Atom กลาง
(`components/panel/ui/`) แทน Element ดิบเดิม

**เพิ่มใหม่ — Dashboard Section:** เดิม Marketing ไม่มีหน้าภาพรวมเลย เห็นแต่รายการประมูลดิบ
เพิ่ม `DashboardSection.js`: การ์ด KPI นับจำนวนประมูลต่อสถานะ (รออนุมัติ/อนุมัติแล้ว/ตั้งเวลาแล้ว/
กำลังประมูล) และ Donut Chart สัดส่วนทุกสถานะรวม `rejected`/`cancelled`/`closed` — ใช้ Endpoint
`GET /api/products/auctions?status=X&limit=1` ที่มีอยู่แล้ว อ่านแค่ `.total` ไม่เพิ่ม Backend ใหม่
(Pattern เดียวกับที่ CS Dashboard ใช้กับ Ticket Queue)

- อัปเดต `NavBar.js`: ลิงก์ Marketing จาก `/marketing/auctions` → `/marketing`
- ยืนยันด้วย Browser จริงผ่าน Docker Stack: Login เป็น `marketing@example.com`, Dashboard
  แสดง "อนุมัติแล้ว รอตั้งเวลา: 1" ตรงกับประมูลที่ Admin เพิ่งอนุมัติจริงในรอบทดสอบเดียวกัน
  (ยืนยัน Pipeline Seller → Admin → Marketing ทำงานครบวงจรจริง ไม่ใช่แค่ Mock)
- `next build` สำเร็จ, `eslint` สะอาด — ไม่มี Test แยกสำหรับ Marketing Pages มาก่อน (ไม่มี Baseline
  ให้ Migrate)

## 2026-09-05 — Bug Fix: Isolate Auction Products from General Feeds and Seller Storefront

- **Bug found:** เมื่อผู้ขายลงสินค้าเข้าประมูลผ่าน `/seller/auctions` สินค้าดังกล่าวถูกสร้างด้วยสถานะ `available` และคงสถานะนั้นไว้ ทำให้สินค้าประมูลหลุดไปแสดงผลในหน้าแรก (`/feed`), หน้าค้นหาสินค้า (`/search`) และหน้าร้านค้าของผู้ขาย (`/store/:sellerId`) อีกทั้งผู้ซื้อทั่วไปยังสามารถกดซื้อหรือหยิบใส่ตะกร้าผ่านหน้า `/products/:id` ได้
- **Fix (MKT-DEC-008):**
  - ใน `productPayload.js` และ `frontend/app/seller/auctions/page.js`: เมื่อสร้างสินค้าเพื่อประมูล กำหนดให้มีสถานะ `auction` โดยตรงตั้งแต่แรก
  - ใน `auctionRepository.js` และ `auctionService.js`: เพิ่ม `setProductStatus` จัดการสถานะสินค้า:
    - เมื่อ Submit เข้าประมูล สินค้าเปลี่ยนสถานะเป็น `auction`
    - หาก Admin ปฏิเสธ (`reject`) หรือ Marketing ยกเลิก (`cancel`) หรือปิดประมูลโดยไม่มีผู้เสนอราคา (`close` with no bids): คืนสถานะสินค้ากลับเป็น `available` เพื่อให้ผู้ขายนำไปขายปกติได้
  - ใน `productController.js`: ดักจับไม่ให้แก้ไข (`update`) หรือลบ (`remove`) สินค้าที่อยู่ในสถานะ `auction` (สอดคล้องตาม `FR-1.3.5`)
  - ใน `frontend/app/products/[id]/page.js`: ปิดการสั่งซื้อปกติและแสดงแบนเนอร์แจ้งเตือนระบุว่าสินค้านี้อยู่ในระบบประมูล พร้อมปุ่มนำทางไปยัง `/auctions`
  - ใน `sellerStatus.js`: เพิ่มการแสดงผลสถานะ `auction` ("กำลังประมูล") ในแดชบอร์ดของผู้ขาย
- เพิ่ม Unit Tests ใน `productPayload.test.js` และ `auctionService.test.js` ครอบคลุมทุกการเปลี่ยนสถานะ (Submit, Reject, Cancel, Close no bids) ผ่านการทดสอบทั้งหมด

## 2026-09-05 — Feature: Marketing Auction Rounds & Marketing-owned Approval (MKT-DEC-009)

- **Requirement Change:** ปรับเปลี่ยนระบบประมูลให้ Marketing เป็นผู้กำหนดรอบการประมูล (Auction Rounds) ล่วงหน้า โดยระบุช่วงเวลาเปิด-ปิดรับสินค้า และช่วงเวลาประมูลจริงในครั้งเดียว และโอนสิทธิ์การอนุมัติสินค้าประมูลจาก Admin มาเป็นของ Marketing
- **Database & Prisma:**
  - เพิ่มโมเดล `AuctionRound` ใน `schema.prisma` (`title`, `submissionStartsAt`, `submissionEndsAt`, `auctionStartsAt`, `auctionEndsAt`)
  - เชื่อมโยง `roundId` Foreign Key ใน `AuctionItem`
  - ทำการ `prisma db push` และ `prisma generate` ใน Docker container เรียบร้อย
- **Backend Service & API (`product-service`):**
  - เพิ่ม API: `GET /rounds/current`, `GET /rounds`, `POST /rounds`
  - `auctionService.submit`: ตรวจสอบว่ามีรอบประมูลที่กำลังเปิดรับสมัคร (`submissionStartsAt <= now <= submissionEndsAt`) หรือไม่ หากไม่มีหรือไม่ตรงช่วงเวลา จะโยนข้อผิดพลาด `400 Bad Request` และหากผ่านจะผูก `roundId` พร้อมสืบทอดวันเวลาประมูลจากรอบโดยอัตโนมัติ
  - `auctionService.approve` & `auctionService.reject`: ปรับสิทธิ์ให้ Role `MARKETING` สามารถอนุมัติหรือปฏิเสธสินค้าได้โดยตรง หากสินค้ามีกำหนดเวลาจากรอบแล้ว การกดอนุมัติจะเลื่อนสถานะไปเป็น `scheduled` และลงทะเบียนคิวปิดประมูลใน BullMQ ทันที
- **Frontend Changes:**
  - `frontend/app/seller/auctions/page.js`: เพิ่มการ์ดแสดงข้อมูลรอบการประมูลปัจจุบัน พร้อมรายละเอียดช่วงเวลารับสินค้าและช่วงเวลาประมูลจริง หากไม่มีรอบหรือหมดเวลารับสินค้า ฟอร์มจะถูกล็อก (Disabled) และแสดงข้อความเตือนอย่างชัดเจน
  - `frontend/components/marketing/sections/AuctionScheduleSection.js`: เพิ่มส่วนบริหารจัดการรอบการประมูล (Round Management) ให้ Marketing เปิดรอบใหม่ได้ และเพิ่มปุ่ม "อนุมัติ" / "ปฏิเสธ" ในตารางรายการสินค้าที่รออนุมัติ
  - `backend/gateway/src/app.js`: เปิดสิทธิ์ Public ให้เส้นทาง `/api/products/auctions/rounds/current` เพื่อให้แขกและผู้ขายตรวจสอบสถานะรอบได้สะดวก
- **Testing:**
  - เพิ่ม Unit Tests ใน `auctionService.test.js` ครอบคลุมการสร้างรอบ, การตรวจสอบวันเวลา, การล็อกการส่งสินค้านอกรอบ, การคำนวณสถานะรอบ, และการอนุมัติโดย Marketing ผ่านทั้งหมด 28/28 tests

## 2026-09-05 — Feature: Anti-Sniping Soft Close Extension (MKT-DEC-010)

- **Requirement:** หากมีผู้ใช้งานเคาะราคาใน 5 นาทีสุดท้ายก่อนสิ้นสุดการประมูล ให้ขยายเวลาประมูลออกไปอีก 5 นาที และหากมีผู้เคาะราคาเพิ่มอีกในเวลาที่ขยาย ก็ให้บวกเวลาเพิ่มทีละ 5 นาทีต่อไปเรื่อยๆ แบบไม่จำกัด
- **Implementation (`auctionService.js`):**
  - ใน `placeBid()`: เมื่อมี Bid ใหม่เข้ามา ตรวจสอบว่าเวลาที่เหลือก่อนถึง `scheduledEndAt` อยู่ภายใน 5 นาทีหรือไม่ (`0 < remainingMs <= 5 * 60 * 1000`)
  - หากเข้าเงื่อนไข: อัปเดต `scheduledEndAt` เพิ่มอีก 5 นาที (`+ 5 * 60 * 1000`) และเรียก `auctionCloseQueue.scheduleClose` เลื่อนเวลางาน BullMQ job ให้สอดคล้องกันทันที
- **Frontend (`frontend/app/auctions/[id]/page.js`):**
  - เพิ่มกล่องข้อความแจ้งเตือนสีอำพันในหน้ารายละเอียดการประมูล: _"⏱️ หากมีผู้เสนอราคาใน 5 นาทีสุดท้าย ระบบจะต่อเวลาออกไปอีก 5 นาทีอัตโนมัติ"_
  - เนื่องจากหน้าเว็บมี polling ทุก 4 วินาทีอยู่แล้ว เมื่อเวลาถูกขยาย ผู้ใช้งานทุกคนในหน้านั้นจะเห็นเวลาปิดใหม่ที่ถูกอัปเดตทันที
- **Testing:**

## 2026-09-05 — UX Enhancement: Auto-Fill Minimum Next Bid on Buyer Auction Page

- **Requirement:** ในหน้ารายละเอียดการประมูลของผู้ซื้อ (`/auctions/:id`) ให้ช่องใส่ราคาประมูลกรอกราคาขั้นต่ำที่ถูกต้อง (Min Next Bid) ให้อัตโนมัติล่วงหน้า โดยที่ผู้ซื้อยังสามารถแก้ไขหรือเปลี่ยนเป็นตัวเลขที่ต้องการได้อย่างอิสระ
- **Implementation (`frontend/app/auctions/[id]/page.js`):**
  - เพิ่ม `useEffect` คอยคำนวณ `minNext` (`highest ? highest.amount + bidIncrement : startingPrice`) และใส่ค่าเริ่มต้นลงใน State `amount` ทันทีเมื่อเปิดหน้า
  - หากมีผู้ประมูลรายอื่นเคาะราคาตัดหน้าขณะเปิดหน้าเว็บอยู่ (`amount < minNext`) ระบบจะอัปเดตราคาในช่องให้เป็นราคาขั้นต่ำใหม่อัตโนมัติ ป้องกันการส่งราคาที่ไม่ผ่านเกณฑ์
  - ปรับปรุง UI ให้แสดงป้ายแจ้งราคาขั้นต่ำถัดไปอย่างเด่นชัด และมีข้อความกำกับ _"ใส่ราคาขั้นต่ำให้อัตโนมัติ สามารถพิมพ์เปลี่ยนเป็นจำนวนเงินที่ต้องการได้"_

## 2026-09-05 — Bug Fix: Auth Service Seed Failure & Test Account Login Readiness

- **Bug found:** เมื่อบูตระบบผ่าน Docker Compose คอนเทนเนอร์ `auth-service` เกิดข้อผิดพลาดและปิดตัวลงทันที (`Exited 1`) ทำให้ผู้ใช้ไม่สามารถเข้าสู่ระบบเพื่อทดสอบฟังก์ชันประมูลและรอบประมูลได้
  - สาเหตุ: ใน `backend/services/auth-service/prisma/seed.js` มีการเรียก `prisma.user.upsert` โดยใช้ `where: { id: staff.id }` หากในฐานข้อมูลมีบัญชีอีเมลนั้นอยู่แล้ว (เช่น `marketing@example.com` หรือ `admin@example.com`) ด้วย UUID อื่น การสั่ง `create` จะล้มเหลวด้วยข้อผิดพลาด `Unique constraint failed on the fields: (email)` (Prisma error `P2002`) ทำให้ `npm run seed` พังและ `server.js` ไม่ถูกเรียก
- **Fix:**
  - สร้างฟังก์ชัน `upsertUser` ใน `backend/services/auth-service/prisma/seed.js` ให้ตรวจสอบค้นหาตาม `email` ก่อน หากพบจะทำการ `update` ข้อมูลรหัสผ่าน `passwordHash`, ชื่อ-นามสกุล และบทบาท (`role`) พร้อมทั้งซิงก์ตาราง `user_roles`
  - หากไม่พบตาม `email` จึงตรวจสอบตาม `id` และหากไม่พบทั้งสองเงื่อนไขจึงค่อยสร้าง (`create`)
  - อัปเดตรหัสผ่านของบัญชีทดสอบเดโมทั้งหมดเป็น `password123`
- **Verification:**
  - รัน `seed.js` สำเร็จโดยไม่มีข้อผิดพลาด คอนเทนเนอร์ `auth-service` กลับมาอยู่ในสถานะ `healthy`
  - ทดสอบยิง API Login ผ่าน Gateway (`POST /api/auth/login`) ด้วยบัญชี Marketing, Admin, Seller, Buyer, CS, Executive ทุกบัญชีได้รับ JWT Token และสิทธิ์ถูกต้อง 100%

## 2026-09-05 — Feature & Fix: Seller KYC Verification Enforcement & Auto-Verify for Seed Sellers

- **Problem:** ผู้ใช้พบข้อผิดพลาด `403 Forbidden: seller account must complete identity verification before listing products` เมื่อพยายามลงสินค้าเข้าประมูลผ่าน `/seller/auctions` เนื่องจากบัญชีร้านค้ายังไม่มีสถานะ `kycStatus: "VERIFIED"`
- **Fix & Enhancements:**
  - ใน `backend/services/auth-service/prisma/seed.js`: กำหนดให้บัญชีผู้ขายเดโมทั้งหมด (`shop.denim@example.com`, `shop.sneaker@example.com`, `shop.vintage@example.com`, `shop.bag@example.com`) ได้รับสถานะ `kycStatus: "VERIFIED"` และ `verifiedAt` โดยอัตโนมัติ เพื่อให้พร้อมทดสอบลงสินค้าและส่งประมูลได้ทันที
  - ใน `frontend/app/seller/auctions/page.js`: เพิ่มการดึงข้อมูลสถานะ KYC (`GET /api/auth/kyc/mine`) มาตรวจสอบตั้งแต่โหลดหน้าเว็บ หากบัญชียังไม่ผ่านการยืนยันตัวตน ระบบจะแสดงกล่องข้อความเตือนอย่างชัดเจน พร้อมปุ่มนำทางไปยังหน้ายืนยันตัวตนผู้ขาย (`/seller/onboarding`) และล็อกการส่งฟอร์มเพื่อป้องกันการส่งคำขอที่ไม่ผ่านเกณฑ์

## 2026-09-05 — UX Enhancement: Auction Winner Direct Checkout Flow on Product & Auction Pages

- **Problem:** เมื่อการประมูลสิ้นสุดลง ระบบสร้างคำสั่งซื้อ (`Order`) ให้ผู้ชนะประมูลสถานะ `pending_payment` และล็อกสินค้าเป็น `reserved` แต่เมื่อผู้ชนะเปิดดูหน้ารายละเอียดสินค้า (`/products/:id`) ปุ่มกลับแสดงเป็นสีเทา _"สินค้าไม่พร้อมขาย"_ (เนื่องจากสินค้าถูกล็อกไม่ให้ผู้ซื้อทั่วไปซื้อ) ทำให้ผู้ชนะสับสนว่าต้องไปชำระเงินที่ไหน
- **Fix & Enhancements:**
  - ใน `frontend/app/products/[id]/page.js`: ตรวจสอบว่าผู้ใช้งานปัจจุบันมีคำสั่งซื้อรอชำระเงิน (`myPendingOrder`) ของสินค้านี้อยู่หรือไม่ หากมี:
    - แสดงกล่องข้อความเด่นชัดสีเขียว: _"🎉 คุณเป็นผู้ชนะการประมูลสินค้านี้! รายการนี้ถูกล็อกไว้รอให้คุณชำระเงิน"_
    - เปลี่ยนปุ่มสีเทาเดิม ให้กลายเป็นปุ่มกดชำระเงินสีเขียว: _"💳 ไปชำระเงินที่ตะกร้าสินค้า (฿...)"_ ซึ่งนำทางไปยัง `/cart` ได้ทันที
  - ใน `frontend/app/auctions/[id]/page.js`: เมื่อการประมูลปิดลง หากผู้ใช้งานที่เปิดดูอยู่คือผู้ชนะการประมูล (`isWinner`):
    - แสดงกล่องข้อความเฉลิมฉลอง: _"🎉 ยินดีด้วย! คุณเป็นผู้ชนะการประมูลสินค้านี้"_
    - แสดงปุ่มนำทางตรง: _"💳 ไปชำระเงินที่ตะกร้าสินค้า"_

## 2026-09-05 — Bug Fix: Auction Winner Order Missing from Cart & Orders List

- **Problem:** ผู้ชนะประมูลพบว่าเมื่อเข้าสู่หน้าตะกร้า (`/cart`) ระบบกลับแสดงเป็น _"ตะกร้าว่างเปล่า"_ และไม่แสดงรายการสินค้าที่ชนะประมูลให้ชำระเงิน
  - **Root Cause 1 (Backend Query Filter):** ใน `backend/services/order-service/src/models/orderModel.js` ฟังก์ชัน `listByBuyer` เมื่อกรองคำสั่งซื้อสถานะ `pending_payment` มีการใส่เงื่อนไข SQL `WHERE reservation_expires_at > NOW()` แต่สำหรับคำสั่งซื้อที่สร้างขึ้นจากการชนะประมูล (`createFromAuction`) ฟิลด์ `reservation_expires_at` จะเป็น `NULL` ทำให้เงื่อนไขใน PostgreSQL ประเมินค่าเป็น `UNKNOWN/FALSE` ส่งผลให้ API `GET /api/orders/mine?status=pending_payment` คัดทิ้งคำสั่งซื้อประมูลทั้งหมด ไม่ส่งกลับไปยังหน้าตะกร้า
  - **Root Cause 2 (Frontend Reservation Timer):** ใน `frontend/app/cart/page.js` ฟังก์ชัน `reservationDeadline` มีการ fallback ไปที่ `createdAt + 10 นาที` สำหรับคำสั่งซื้อที่ไม่มี `reservationExpiresAt` ทำให้คำสั่งซื้อที่ชนะประมูลมาเกิน 10 นาทีถูกฟรอนต์เอนด์กรองว่าเป็นคำสั่งซื้อที่หมดเวลาจองและซ่อนออกจากหน้าตะกร้า
- **Fix & Enhancements:**
  - **Backend (`orderModel.js`):** ปรับเงื่อนไขใน `listByBuyer` ให้ครอบคลุมคำสั่งซื้อที่มาจากการประมูล (`auctionId != null`) หรือคำสั่งซื้อที่ไม่มีการกำหนดวันหมดอายุจองระยะสั้น (`reservationExpiresAt: null`) ร่วมกับเงื่อนไข `reservationExpiresAt > new Date()` เดิม
  - **Frontend (`cart/page.js`):**
    - ขยายระยะเวลาชำระเงินของสินค้าประมูลเป็น 24 ชั่วโมงนับจากเวลาสิ้นสุดการประมูล (`createdAt + 24 ชั่วโมง`) เพื่อให้ผู้ชนะมีเวลาในการชำระเงินอย่างเพียงพอ
    - แสดงป้ายกำกับพิเศษ _"🔨 ชนะการประมูล · รอชำระเงิน"_ พร้อมเวลาถอยหลัง 24 ชั่วโมง
    - ปิดการแสดงปุ่ม _"ยกเลิก"_ สำหรับสินค้าประมูล เพื่อป้องกันผู้ชนะประมูลกดยกเลิกสิทธิ์โดยไม่ตั้งใจ
  - **Frontend (`orders/page.js`):**
    - ในหน้าคำสั่งซื้อของฉัน (`/orders`) แสดงสถานะของสินค้าประมูลเป็น _"ชนะประมูล · รอชำระเงิน"_
    - เพิ่มปุ่มลัด _"💳 ไปชำระเงินที่ตะกร้า"_ ให้ผู้ซื้อสามารถกดไปชำระเงินได้ทันทีจากหน้ารายการคำสั่งซื้อ
- **Verification:**
  - ยิงทดสอบ API `GET /api/orders/mine?status=pending_payment` ด้วยโทเคนของผู้ชนะประมูล (`buyer.demo@example.com`) ยืนยันว่าได้รับข้อมูลคำสั่งซื้อสินค้า "Mii" (ราคา ฿290) ถูกต้องครบถ้วน
  - รัน unit tests ฝั่ง frontend (`npm test`) ผ่านทั้งหมด 38/38 tests รวม test case ใหม่สำหรับระยะเวลาชำระเงิน 24 ชั่วโมงของสินค้าประมูล

## 2026-09-05 — Bug Fix: Multiple Uploaded Images Blurry & Auction Media Gallery Viewing

- **Problem 1 (รูปอื่นๆ ที่อัปโหลดไม่ชัด/เป็นสี่เหลี่ยมสีเบลอ):**
  - **Root Cause:** ใน `frontend/components/MediaUploader.js` มีการเรียกฟังก์ชันย่อ/ครอบภาพเป็นจัตุรัสผ่าน `files.map(cropImageToSquare)` โดยตัวฟังก์ชันกำหนดพารามิเตอร์ไว้เป็น `cropImageToSquare(file, maxSide = 1600)`
  - เมื่อ `Array.prototype.map` ทำงาน จะส่ง `(element, index)` เข้าไปในพารามิเตอร์เสมอ ทำให้:
    - รูปแรก (index 0): ได้รับ `maxSide = 0` ซึ่ง canvas สร้างไม่ได้ จึง fallback คืนไฟล์เดิมความละเอียดปกติ
    - รูปที่สอง (index 1): ได้รับ `maxSide = 1` กลายเป็น Canvas ขนาด 1x1 พิกเซล
    - รูปที่สาม (index 2): ได้รับ `maxSide = 2` กลายเป็น Canvas ขนาด 2x2 พิกเซล
    - รูปที่สี่ (index 3): ได้รับ `maxSide = 3` กลายเป็น Canvas ขนาด 3x3 พิกเซล
    - เมื่อนำภาพขนาด 1-3 พิกเซลมาขยายแสดงผล จึงเห็นเป็นบล็อกสีสี่เหลี่ยมเบลอๆ
  - **Fix:**
    - แก้ไขใน `MediaUploader.js` ให้ส่ง `files.map((file) => cropImageToSquare(file))` โดยตรง
    - เพิ่มตัวตรวจสอบใน `cropImageToSquare` ให้ `maxSide` ต้องไม่ต่ำกว่า 100 พิกเซล หากน้อยกว่าจะ fallback เป็น 1600 เสมอ
    - ซิงก์ไฟล์ภาพความละเอียดสูงต้นฉบับของผู้ใช้เข้าสู่โฟลเดอร์ `uploads/` ของสินค้าเดิม (Mii และ sitama) ให้กลับมาคมชัดทันที
- **Problem 2 (หน้าการประมูลของผู้ซื้อดูได้แค่ภาพแรก):**
  - **Root Cause:** ใน `frontend/app/auctions/[id]/page.js` เดิมทีมีการแสดงผลเพียงแท็ก `<img>` รูปแรกสุด (`auction.product.photos[0]`) โดยไม่มี Gallery หรือ Thumbnails ให้กดดูรูปอื่นของสินค้าประมูล
  - **Fix:**
    - นำคอมโพเนนต์ `MediaGallery` มาติดตั้งในหน้า `/auctions/[id]` โดยรวมทั้งภาพและวิดีโอของสินค้าประมูลเรียงตามตำแหน่ง
    - ปรับแต่ง `MediaGallery` ให้ใช้ `object-contain` เพื่อให้แสดงรูปภาพเต็มอัตราส่วน ไม่ถูกตัดขอบบน-ล่างหรือด้านข้าง
- **Verification:**
  - ยืนยันขนาดไฟล์และความละเอียดรูปภาพใน `uploads/` สำหรับ Mii และ sitama ทั้งหมดกลับมามีความละเอียดสูงคมชัดทุกรูป
  - ตรวจสอบหน้า `/auctions/[id]` และ `/products/[id]` แสดงแท็บ Thumbnails ทุกรูปครบถ้วน และสามารถกดสลับดูได้คมชัดทุกรูป
  - รัน unit tests ผ่านครบ 38/38 รายการ

## 2026-09-06 — Feature: Knowledge Base & Educational Articles System (MKT-004 / UR-14 / FR-5.2.3 / MKT-DEC-011)

- **Requirement:** พัฒนาระบบให้ความรู้ / บทความ (Knowledge Base & Educational Articles) ส่งเสริม second-hand fashion, การดูแลรักษาเสื้อผ้า (Care), สไตล์ (Styling) และความยั่งยืน (Sustainability) ตาม `ST-MKT-05` / `UR-14` / `FR-5.2.3`:
  - ฝ่ายการตลาด (Marketing) เป็นผู้เขียน จัดการ อัปโหลดภาพปก และเผยแพร่บทความ
  - ผู้ใช้งานทั่วไป (Buyer / Guest) สามารถเข้าดูบทความได้จากแถบเมนูด้านบน (Top Navigation Bar) และเปิดอ่านบทความรายชิ้นได้
  - ระบบค้นหาบทความต้องใช้อัลกอริทึมตั้งต้นเดิมของโปรเจกต์ (PostgreSQL `pg_trgm` Trigram + `ILIKE` Substring Fallback ตาม Task `MOCK-TRADE-011`)
- **Database & Prisma (`reloop_product`):**
  - เพิ่มโมเดล `Article` และ Enum `ArticleStatus` (`draft`, `published`, `archived`) ใน `prisma/schema.prisma`
  - ฟิลด์รองรับ: `id`, `slug`, `title`, `summary`, `content`, `coverImage`, `category`, `tags`, `readTimeMinutes`, `status`, `authorId`, `authorName`, `searchText`, `publishedAt`, `createdAt`, `updatedAt`
  - สร้าง GIN Trigram Index: `@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)`
  - เพิ่ม Trigger `articles_set_search_text()` ใน PostgreSQL เพื่อรวบรวม `title`, `summary`, `category`, `tags` ลงใน `search_text` อัตโนมัติทุกครั้งที่มีการ Insert หรือ Update
  - อัปเดต `prisma/seed.js` เพิ่มข้อมูลบทความตัวอย่างคุณภาพสูง 3 บทความ (Care, Styling, Sustainability)
  - รัน `prisma db push` และ Generate Prisma Client สำเร็จสมบูรณ์
- **Backend Service & API (`product-service`):**
  - สร้าง `articleModel.js`: รองรับ CRUD, การคำนวณ Pagination (`page`, `limit`), การคำนวณสถิติ KPI ฝั่ง Marketing, และ Trigram Ranking: `GREATEST(word_similarity(q, search_text), similarity(q, search_text))` พร้อม Substring Fallback `ILIKE`
  - สร้าง `articleController.js`: รองรับ Public endpoints (`listPublic`, `getOne`) และ Marketing endpoints (`listMarketing`, `create`, `update`, `remove`)
  - สร้าง `articleRoutes.js`: ตรวจสอบสิทธิ์ Role `MARKETING` / `ADMIN` สำหรับเส้นทางจัดการบทความ
  - เชื่อมต่อ Routing ใน `productRoutes.js` ภายใต้ `/articles`
  - อัปเดต `uploadRoutes.js` อนุญาตให้ Role `MARKETING` สามารถอัปโหลดไฟล์ภาพปกบทความได้
  - อัปเดต `gateway/src/app.js` เพิ่มเส้นทาง Public `/api/products/articles` ใน Whitelist
- **Frontend Pages & Components:**
  - `frontend/components/NavBar.js`: เพิ่มเมนู "บทความ" (`/articles`) ใน `DISCOVERY_LINKS` บน Navbar สำหรับผู้ใช้งานทุกคน
  - `frontend/app/articles/page.js`: หน้ารายการบทความสำหรับผู้ใช้งานทั่วไป พร้อมฟิลเตอร์แยกตามหมวดหมู่ (ทั้งหมด, การดูแลรักษา, สไตล์และการแต่งตัว, ความยั่งยืน), กล่องค้นหาแบบ Real-time Debounce, การ์ดบทความแสดงรูปภาพปก, ป้ายหมวดหมู่, เวลาในการอ่าน และสรุปเนื้อหา
  - `frontend/app/articles/[id]/page.js`: หน้ารายละเอียดบทความ ออกแบบ Typography สำหรับการอ่านบทความอย่างสบายตา, แบนเนอร์ภาพปก, ข้อมูลผู้เขียน, วันที่เผยแพร่, การจัดรูปแบบหัวข้อและย่อหน้าเนื้อหา, พร้อมแถบแนะนำบทความอื่นที่เกี่ยวข้องด้านล่าง
  - `frontend/components/marketing/sections/ArticlesSection.js`: แท็บ "จัดการบทความ" ในแดชบอร์ด Marketing พร้อมสรุป KPI (บทความทั้งหมด, เผยแพร่แล้ว, ฉบับร่าง), ตารางแสดงบทความพร้อมสถานะ, สวิตช์สลับการแสดงผล, หน้าต่าง Modal สร้างและแก้ไขบทความพร้อมอัปโหลดภาพปกในตัว, และ Dialog ยืนยันการลบ
  - `frontend/app/marketing/page.js`: ลงทะเบียนและแสดงผล Section "จัดการบทความ"
  - `frontend/app/articles/page.test.js`: เพิ่ม Unit Tests สำหรับหน้าบทความ
- **Verification:**
  - รัน `docker compose exec frontend npm test`: ผ่านครบ 12/12 test suites (41/41 tests passing)
  - รัน `docker compose exec frontend npm run build`: Next.js Static Pages & Server Components คอมไพล์ผ่านสมบูรณ์ 24/24 หน้า
  - ตรวจสอบ API Trigram Search ผ่าน Gateway: ผลลัพธ์การค้นหาภาษาไทยจับคู่ตรงและคำใกล้เคียงถูกต้อง 100%

## 2026-09-06 — Bug Fix: Media URL Resolution for Uploaded Article Cover & Content Images

- **Problem:** รูปภาพหน้าปกบทความที่ผู้ใช้งานอัปโหลดผ่านหน้าแดชบอร์ดการตลาดไม่แสดงผล (ขึ้น Broken Image หรือ 404) ในขณะที่รูปภาพของบทความที่ Seed มาเดิมแสดงผลได้ตามปกติ
  - **Root Cause:** รูปภาพที่อัปโหลดจะถูกเซฟบน File Storage ของ Backend และเก็บ Path เป็น Relative URL เช่น `"/uploads/b08d8e8e-....jpg"` เมื่อเรนเดอร์ `<img src={article.coverImage} />` โดยตรง เบราว์เซอร์จะไปร้องขอจาก Frontend Web Server พอร์ต 3000 (`http://localhost:3000/uploads/...`) ซึ่งไม่มีโฟลเดอร์นี้ ทำให้เกิดข้อผิดพลาด 404 (ในขณะที่รูปของ Seed Data เป็น External URL `https://...` จึงไม่เจอปัญหานี้)
- **Fix:**
  - นำฟังก์ชันตัวแปลงกลาง `mediaUrl()` จาก `frontend/lib/api.js` มาครอบที่รูปภาพบทความทุกจุด:
    - `frontend/components/marketing/sections/ArticlesSection.js`: รูปภาพในตารางรายการบทความ และรูปพรีวิวใน Modal เขียน/แก้ไขบทความ
    - `frontend/app/articles/page.js`: รูปภาพปกบนการ์ดบทความทุกใบ
    - `frontend/app/articles/[id]/page.js`: รูปภาพปกขนาดใหญ่, รูปภาพใน Markdown content renderer (`![alt](url)`), และรูปภาพในการ์ดบทความแนะนำ
- **Verification:**
  - รูปภาพปกบทความจริงที่ผู้ใช้อัปโหลด (เช่น "Mii_น่ารัก") และรูปภาพในเนื้อหาแสดงผลคมชัดถูกต้องผ่าน API Gateway (พอร์ต 8080)
  - รัน `docker compose exec frontend npm test` ผ่านครบ 41/41 tests

## 2026-09-07 — Bug Fix: Duplicate Auction Winner Orders from Concurrent Close Race Condition

- **Problem:** เมื่อการประมูลสิ้นสุดลง ผู้ชนะประมูลพบว่ามีรายการรอชำระเงินของสินค้านั้นปรากฏขึ้นในตะกร้า (`/cart`) ถึง 2 รายการซ้ำกัน
  - **Root Cause (Race Condition):** เมื่อการประมูลถึงกำหนดเวลาสิ้นสุด ระบบมี 2 ช่องทางในการปิดการประมูล:
    1. Worker คิวของ BullMQ (`auctionCloseQueue`) ที่ทำงานใน Background
    2. Lazy evaluation ใน `maybeAdvance` ของ `auctionService.js` เมื่อมีการเรียกดูข้อมูลสินค้า
    - เมื่อเวลาสิ้นสุดมาถึง ทั้ง Worker และ Request ข้อมูลเข้ามาประเมินเงื่อนไขพร้อมกันในระดับมิลลิวินาที โดยทั้งคู่พบว่า `status === "open"` จึงเรียก `closeAuction()` พร้อมกัน
    - `closeAuction()` ทำการยิง HTTP Request ไปที่ `order-service` ผ่าน `POST /internal/from-auction` ก่อนที่จะอัปเดตสถานะของ `AuctionItem` เป็น `"closed"` ในฐานข้อมูล
    - ฝั่ง `order-service` ฟังก์ชัน `createFromAuction` ไม่มีการตรวจสอบ Idempotency หรือ Unique Constraint บน `auction_id` ทำให้สร้างเรคอร์ดคำสั่งซื้อขึ้นมา 2 รายการซ้ำกัน
- **Fix:**
  - **Data Cleanup:** ลบคำสั่งซื้อรายการที่ซ้ำซ้อน (`9b4d52c6-...`) ที่ยังค้างสถานะรอชำระเงินออก เหลือเฉพาะคำสั่งซื้อจริงที่ผู้ซื้อชำระเงินแล้ว (`0c08a543-...`)
  - **Order Service Idempotency (`orderController.js` & `orderModel.js`):**
    - เพิ่มฟังก์ชัน `findByAuctionId` ใน `orderModel.js`
    - ใน `createFromAuction`: ตรวจสอบว่ามีคำสั่งซื้อของ `auctionId` นี้อยู่แล้วหรือไม่ หากมีอยู่แล้วให้คืนค่าคำสั่งซื้อเดิมทันที ไม่สร้างซ้ำ (HTTP 200)
    - ดักจับ Prisma Error `P2002` (Unique Constraint Violation) กรณีเกิด Race Condition พร้อมกันในระดับมิลลิวินาที ให้ดึงและคืนค่าคำสั่งซื้อเดิม
  - **Database Unique Constraint (`schema.prisma` in `order-service`):**
    - กำหนด `@unique` ให้กับฟิลด์ `auctionId` บนโมเดล `Order` เพื่อรับประกันในระดับฐานข้อมูล PostgreSQL ว่าหนึ่งการประมูลจะมีคำสั่งซื้อได้เพียงหนึ่งเดียวเท่านั้น
  - **Product Service Concurrency Check (`auctionService.js`):**
    - ใน `closeAuction`: ดึงสถานะล่าสุด (`findById`) ซ้ำอีกครั้งก่อนเริ่มประมวลผล หากพบว่าถูกปิดไปแล้วโดย Process อื่น ให้คืนค่าทันที
- **Verification:**
  - ทดสอบส่งคำขอซ้ำจำลอง Race Condition: ฐานข้อมูลปฏิเสธคำสั่งซื้อซ้ำด้วย Error Code `P2002` และ Controller คืนค่าคำสั่งซื้อที่มีอยู่เดิมอย่างถูกต้อง
  - ตรวจสอบหน้าตะกร้าของผู้ซื้อ: รายการคำสั่งซื้อซ้ำหายไปจากตะกร้าเรียบร้อยแล้ว
  - ตรวจสอบหน้ารายการสั่งซื้อ (`/orders`): คำสั่งซื้อที่ชำระเงินแล้วยังคงอยู่ครบถ้วนสมบูรณ์
  - รัน Unit Tests ใน `product-service`: ผ่านครบ 30/30 tests

## 2026-09-12 — MKT-001: Campaign Domain, State Machine & Voucher Wallet System

- **Requirement:** `MKT-001`, `UR-15`, `UR-16`, `WF-11` (ระบบจัดการแคมเปญโปรโมชัน วงจรชีวิตสถานะ และระบบกระเป๋าคูปองส่วนลด)
- **Database (`reloop_product`):**
  - เพิ่ม Enum `CampaignStatus` (`draft`, `pending_approval`, `approved`, `published`, `ended`, `rejected`)
  - เพิ่ม Enum `DiscountType` (`PERCENT`, `FIXED`)
  - เพิ่ม Enum `VoucherStatus` (`CLAIMED`, `USED`, `EXPIRED`)
  - เพิ่มโมเดล `Campaign` (ตาราง `campaigns`): กำหนดโครงสร้างข้อมูลแคมเปญครบถ้วน รหัสโค้ดส่วนลด (`code` Unique), ชนิดและมูลค่าส่วนลด, ยอดซื้อขั้นต่ำ, เพดานลดสูงสุด, หมวดหมู่ที่ใช้ได้, งบประมาณ, สิทธิ์ใช้งานรวม, ตัวนับการใช้งาน (`usedCount`), สถานะ, ช่วงวันเวลาเริ่ม-สิ้นสุด, ผู้สร้าง (`createdById`), ผู้อนุมัติ (`approvedById`), วันเวลาอนุมัติ (`approvedAt`), optimistic lock version
  - เพิ่มโมเดล `UserVoucher` (ตาราง `user_vouchers`): เก็บสิทธิ์คูปองของผู้ซื้อ พร้อมข้อจำกัดระดับฐานข้อมูล `@@unique([userId, campaignId])` รับประกัน 1 สิทธิ์ต่อ 1 ผู้ใช้งาน
  - ดำเนินการ Prisma db push ซิงก์ Schema เข้า PostgreSQL และ generate Prisma client ใน Docker container สำเร็จ
- **Backend Implementation (`product-service`):**
  - สร้าง `campaignRepository.js`: แยกการคิวรีฐานข้อมูลของ Campaign และ UserVoucher
  - สร้าง `campaignService.js`:
    - กลไก State Machine: ตรวจสอบและป้องกันการเปลี่ยนสถานะข้ามขั้น (`draft` -> `pending_approval` -> `approved` -> `published` -> `ended` / `rejected`)
    - การตรวจสอบความถูกต้องของข้อมูล (Validation): ตรวจสอบโค้ด, ชนิดส่วนลด, มูลค่าส่วนลด (เปอร์เซ็นต์ต้อง 1-100, มูลค่าคงที่ต้อง > 0), วันที่สิ้นสุดต้องอยู่หลังวันที่เริ่มต้น
    - นโยบายการอนุมัติ (Option 2 — Self-Approval for Evaluation): อนุญาตให้ `MARKETING` หรือ `ADMIN` กดอนุมัติได้ และบันทึก `approvedById` และ `approvedAt` เป็นหลักฐาน Audit Trail
    - ระบบเก็บคูปอง (Claim Voucher): ตรวจสอบสถานะ published, ช่วงเวลาที่เปิดใช้, เพดานสิทธิ์รวม, และป้องกันการกดเก็บซ้ำด้วย Unique Constraint (HTTP 409 Conflict)
    - ระบบคัดกรองคูปองอัจฉริยะ (`getApplicableVouchers`): คัดกรองคูปองในกระเป๋าที่ตรงตามเงื่อนไข (ยอดซื้อถึงขั้นต่ำ, หมวดหมู่ตรงกัน, ยังไม่หมดอายุ) พร้อมคำนวณส่วนลดโดยประมาณ (`estimatedDiscount`) และเรียงลำดับคูปองที่ลดได้มากที่สุดขึ้นก่อน
  - สร้าง `campaignController.js` และ `campaignRoutes.js`: ติดตั้งเส้นทาง REST API ครอบคลุมทั้งฝั่งฝ่ายการตลาดและผู้ซื้อ
  - ติดตั้ง Router ใน `routes/productRoutes.js` ภายใต้ prefix `/campaigns`
- **Gateway Integration (`gateway`):**
  - เพิ่ม Whitelist ใน `gateway/src/app.js` ให้เส้นทาง `/api/products/campaigns/available` และ `/published` เป็น Public ให้ผู้เข้าชมทั่วไปเข้าถึงได้โดยไม่ต้องใช้ Bearer Token
- **Verification & Testing:**
  - สร้าง `test/campaign.integration.test.js` ทดสอบร่วมกับฐานข้อมูล PostgreSQL จริง ผ่านครบ 7/7 ชุดการทดสอบ (RBAC, Validations, State Transitions, Rejection Flow, 1-per-user Claim Uniqueness, Smart Compatibility Filter)
  - ทดสอบการทำงานสดผ่าน API Gateway (`http://localhost:8080`): เข้าถึง Public endpoint -> Login Marketing -> สร้างแคมเปญร่าง -> ส่งขออนุมัติ -> อนุมัติ -> เผยแพร่ -> Login Buyer -> กดเก็บคูปอง -> ทดสอบกดเก็บซ้ำ (ได้ 409) -> เรียก Smart Filter คำนวณส่วนลดแม่นยำ 100%

## 2026-09-12 — MKT-002: Dual-Side Frontend UI (Marketing Workspace & Buyer Voucher Hub)

- **Requirement:** `MKT-002`, `UR-15`, `UR-16`, `WF-11` (ระบบ UI สองฝั่งสำหรับฝ่ายการตลาดและผู้ซื้อ เพื่อรองรับการทดสอบและการใช้งานจริงแบบ End-to-End)
- **Marketing Workspace UI (`frontend/components/marketing/sections/CampaignsSection.js` & `frontend/app/marketing/page.js`):**
  - เพิ่มแท็บ "แคมเปญและคูปอง" ในแดชบอร์ดฝ่ายการตลาด (`/marketing`)
  - **KPI Summary Cards:** แสดงการ์ดสถิติ 4 ใบ: แคมเปญทั้งหมด, กำลังเผยแพร่ (Active), รออนุมัติ, และสิทธิ์คูปองที่ถูกเก็บไปแล้ว
  - **Status Filter & Search:** ค้นหารหัสโค้ดหรือชื่อแคมเปญแบบเรียลไทม์ พร้อมตัวกรองสถานะแคมเปญ 6 สถานะ
  - **Campaigns Table:** แสดงตารางแคมเปญพร้อม Badge สีระบุสถานะ, ชนิดและมูลค่าส่วนลด, ยอดขั้นต่ำ, หมวดหมู่, สิทธิ์การใช้, วันเริ่ม-จบ, และปุ่ม Action ตามสถานะปัจจุบัน
  - **Modal สร้าง/แก้ไขแคมเปญ:**
    - รองรับการกำหนดรหัสโค้ด, ชนิดส่วนลด (%, บาทคงที่), เพดานลดสูงสุด, ยอดสั่งซื้อขั้นต่ำ, หมวดหมู่สินค้า, งบประมาณ, สิทธิ์ใช้งานรวม, และวันเริ่ม-สิ้นสุด
    - บังคับแก้ไขได้เฉพาะแคมเปญที่อยู่ในสถานะ `draft` เท่านั้น (ป้องกันการแก้ไขข้อมูลแคมเปญที่อยู่ระหว่างพิจารณาหรือเปิดให้ใช้งานแล้ว)
  - **Lifecycle Action Buttons & Modals:**
    - ปุ่ม "ส่งขออนุมัติ" (`submit`)
    - ปุ่ม "อนุมัติ" (`approve`) พร้อม Dialog ยืนยัน
    - ปุ่ม "ปฏิเสธ" (`reject`) พร้อม Modal ให้ระบุเหตุผลการปฏิเสธ
    - ปุ่ม "เผยแพร่" (`publish`) พร้อม Dialog ยืนยัน
    - ปุ่ม "ปิดแคมเปญ" (`end`) พร้อม Dialog ยืนยัน
- **Buyer Voucher Hub & Wallet UI (`frontend/app/campaigns/page.js`):**
  - เพิ่มหน้าศูนย์รวมคูปองส่วนลดสำหรับผู้ซื้อ (`/campaigns`)
  - **แท็บ "คูปองที่เก็บได้":** แสดงคูปองที่มีอยู่ในระบบรูปแบบ Ticket Card สวยงาม พร้อมปุ่ม 1-Click "เก็บคูปอง" ตรวจสอบสถานะการเก็บสิทธิ์ (ถ้าเก็บแล้วจะแสดง "เก็บแล้ว", ถ้าเต็มจะแสดง "สิทธิ์เต็มแล้ว")
  - **แท็บ "คูปองของฉัน (กระเป๋าคูปอง)":** ตรวจสอบคูปองที่อยู่ในกระเป๋าของผู้ซื้อ แสดงสถานะ "พร้อมใช้งาน", "ใช้ไปแล้ว", "หมดอายุ" พร้อมปุ่มลัด "ใช้คูปองช้อปเลย" ไปยังรายการสินค้า
- **Global Navigation Integration (`frontend/components/NavBar.js`):**
  - เพิ่มเมนู "คูปอง" ใน Navbar หลัก
  - เพิ่มเมนู "คูปองส่วนลดของฉัน" (`/campaigns?tab=mine`) ในเมนูข้อมูลบัญชีผู้ใช้งาน
- **Product Detail Page Voucher Preview (`frontend/app/products/[id]/page.js`):**
  - เชื่อมต่อ `POST /api/products/campaigns/applicable` และ `GET /api/products/campaigns/available`
  - แสดงกล่องแนะนำคูปองส่วนลดใต้ราคาขาย:
    - กรณีผู้ซื้อมีคูปองที่ตรงเกณฑ์: แสดงโค้ดคูปองพร้อมส่วนลดที่ประหยัดได้จริง และยอดคงเหลือที่ต้องชำระทันที
    - กรณีผู้ซื้อยังไม่มีคูปอง: แสดงไฮไลต์โปรโมชันที่ร่วมรายการพร้อมปุ่ม "เก็บโค้ด" พายังหน้ารวมคูปอง
- **Testing & Verification:**
  - เพิ่มชุดทดสอบ Jest Component Tests:
    - `frontend/app/campaigns/page.test.js` (ทดสอบแท็บคูปอง, แสดงการ์ด, และกระเป๋าคูปอง)
    - `frontend/components/marketing/sections/CampaignsSection.test.js` (ทดสอบ KPI cards, ตารางแคมเปญ, และเปิด Modal สร้างแคมเปญ)
  - รัน Jest ทั้งระบบ: ผ่าน 29/29 Test Suites (137/137 tests passing 100%)
  - รัน Next.js Production Build (`npm run build`): สำเร็จ 100% ไม่มีข้อผิดพลาด

## 2026-09-18 — Complete Marketing Ownership & Admin Role Decoupling

- **Requirement:** `MKT-DEC-002`, `MKT-DEC-009`, `MKT-DEC-011`, `MKT-DEC-013`, `ADM-DEC-017`
- **Backend Role Hardening (`backend/services/product-service`):**
  - **Campaigns (`campaignRoutes.js`, `campaignService.js`):** ปลดสิทธิ์บทบาท `ADMIN` ออกจาก Route และ Service ของระบบแคมเปญทั้งหมด ให้คงไว้เฉพาะบทบาท `MARKETING` เท่านั้น (ส่งผลให้ `GET /`, `POST /`, `submit`, `approve`, `reject`, `publish`, `end`, `PATCH`, `DELETE` รองรับเฉพาะ `MARKETING` 100%)
  - **Auctions (`auctionService.js`):** ปรับปรุง `approve`, `reject`, `schedule`, `cancel`, `listRounds`, และ `createRound` ให้ตรวจสอบสิทธิ์ `user.role === 'MARKETING'` เท่านั้น หากผู้เรียกเป็น `ADMIN` จะได้รับ HTTP `403 Forbidden`
  - **Articles (`articleRoutes.js`, `articleController.js`):** ปลดสิทธิ์ `ADMIN` ออกจากการจัดการบทความทั้งระบบ คงสิทธิ์เฉพาะ `MARKETING`
- **Frontend UI & Terminology Harmonization:**
  - **Marketing Dashboard (`frontend/components/marketing/sections/DashboardSection.js`):** เปลี่ยน Label การ์ด KPI จากเดิม "รออนุมัติจาก Admin" เป็น "รอการอนุมัติ (Marketing)" และ Subtitle เป็น "รอตรวจสอบและอนุมัติสินค้าในรอบประมูล"
  - **Seller Auctions (`frontend/app/seller/auctions/page.js`):** ปรับสถานะในตารางของผู้ขายจากเดิม `pending_approval: "รออนุมัติจาก Admin"` เป็น `"รออนุมัติจาก Marketing"` และ `approved: "อนุมัติแล้ว (เตรียมเปิดประมูลตามรอบ)"`
  - **Admin Workspace (`frontend/app/workspace/page.js`):** นำแท็บตกค้าง `auction_approvals` (อนุมัติประมูล) ออกจาก `ADMIN_SECTIONS` และลบการ Render ตามข้อตกลง `ADM-DEC-017` เพื่อไม่ให้หน้าจอซ้ำซ้อนกับ Marketing
- **Testing & Verification:**
  - อัปเดต `backend/services/product-service/src/features/auctions/auctionService.test.js` ปรับ Caller เป็น `role: 'MARKETING'` และเพิ่ม Test Cases ตรวจสอบว่าผู้เรียกบทบาท `ADMIN` จะถูกปฏิเสธด้วย `403 Forbidden`
  - อัปเดต `backend/services/product-service/test/campaign.integration.test.js` ให้ Rejection Step ทดสอบทั้งกรณี `adminToken` ถูกปฏิเสธด้วย `403 Forbidden` และ `marketingToken` ทำงานสำเร็จ
  - รัน Jest Tests ฝั่ง Frontend: ผ่านครบ 29/29 Test Suites (138/138 tests passing 100%)
  - รัน Next.js Production Build (`npm run build`): ผ่าน 26/26 Static Pages ปราศจากข้อผิดพลาด

## 2026-09-18 — Server-Side Voucher Validation & Discount Calculation (Anti-Tampering)

- **Security & Architecture Hardening:**
  - แก้ไขช่องโหว่ด้านความปลอดภัยจากการคำนวณส่วนลดและราคาสุทธิที่ Front End (`req.body.discountAmount`, `req.body.finalPrice`) ซึ่งอาจถูกผู้ไม่ประสงค์ดีปลอมแปลงราคา (Price Tampering)
  - ย้ายการตรวจสอบสิทธิ์และคำนวณส่วนลดทั้งหมดมาอยู่ที่ฝั่ง Back End (Single Source of Truth)
- **Product-Service Internal Endpoint:**
  - เพิ่ม API ภายใน `POST /internal/campaigns/:id/validate-discount` ใน `internalCampaignRoutes.js` และ `campaignController.js` ป้องกันความปลอดภัยด้วย `requireInternalToken` (`x-internal-token`)
  - พัฒนาฟังก์ชัน `validateAndCalculateDiscount` ใน `campaignService.js` ทำหน้าที่:
    - ตรวจสอบสถานะแคมเปญต้องเป็น `published` และอยู่ในช่วงวันเวลาที่เปิดใช้งาน
    - ตรวจสอบว่าผู้ซื้อเป็นเจ้าของคูปองจริง (`CLAIMED`) ในกระเป๋าคูปองของผู้ใช้
    - ตรวจสอบยอดสั่งซื้อขั้นต่ำ (`minOrderPrice`) และหมวดหมู่สินค้าที่ร่วมรายการ (`applicableCategory`)
    - คำนวณส่วนลดที่ถูกต้องตามกฎทางธุรกิจ (PERCENT พร้อมเพดาน `maxDiscount` หรือ FIXED) และหาราคาสุทธิที่แท้จริง
- **Order-Service Checkout Hardening:**
  - เพิ่ม `validateVoucherDiscount` ใน `productClient.js` เรียกใช้ API ภายในของ `product-service` แบบ Service-to-Service REST
  - ปรับปรุง `checkoutService.reserveOrder`:
    - เมินเฉยต่อค่า `discountAmount` และ `finalPrice` ที่ส่งมาจาก Client อย่างสิ้นเชิง
    - หากมี `campaignId` จะเรียกตรวจสิทธิ์และคำนวณส่วนลดจาก `productClient.validateVoucherDiscount` โดยตรง
    - หากเงื่อนไขคูปองไม่ถูกต้อง จะยกเลิกการล็อกสินค้า (release reservation) ทันที และโยน `400 Bad Request`
    - กำหนด `finalPrice = product.price - verifiedDiscountAmount` จากผลการคำนวณที่ผ่านการยืนยันแล้วเท่านั้น
  - ปรับปรุง `orderController.create` ให้รับเฉพาะ `buyerId`, `productId`, และ `campaignId`
- **Frontend Sanitization (`frontend/app/products/[id]/page.js`):**
  - ตัดการส่งฟิลด์ `discountAmount` และ `finalPrice` ออกจาก `addToCart` payload โดยส่งเฉพาะ `productId` และ `campaignId`
- **Testing & Verification:**
  - เพิ่ม Unit Tests ใน `order-service/src/features/checkout/checkoutService.test.js`:
    - ตรวจสอบว่าระบบเพิกเฉยต่อราคาปลอมแปลงจาก Client (`discountAmount: 99999`) และใช้ส่วนลดจริงจาก Server
    - ตรวจสอบการจัดการเมื่อการตรวจสอบคูปองล้มเหลว (ปล่อยการล็อกสินค้าและส่ง Error 400)
  - เพิ่ม Integration Tests ใน `product-service/test/campaign.integration.test.js`:
    - ตรวจสอบ Security Guard ของ Internal Token (ปฏิเสธ 403 หากไม่มี Token หรือ Token ผิด)
    - ตรวจสอบการคำนวณแบบเปอร์เซ็นต์, เพดานลดสูงสุด (`maxDiscount`), การปฏิเสธเมื่อยอดไม่ถึงเกณฑ์ขั้นต่ำ, การปฏิเสธเมื่อหมวดหมู่ไม่ตรง, และการปฏิเสธเมื่อผู้ใช้ยังไม่ได้เก็บคูปอง
  - ทดสอบ Jest Tests ฝั่ง Frontend: ผ่านครบ 29/29 Test Suites (138/138 tests passing)
  - ทดสอบ Next.js Production Build (`npm run build`): สำเร็จสมบูรณ์ 100% (26/26 Static Pages)

## 2026-09-18 — Full Server-Side Voucher Quote-and-Hold, Concurrency Guard & Admin Decoupling

- **Requirement:** `MKT-DEC-014`, `MKT-DEC-015`, `ADM-DEC-017`, `WF-11`
- **Security & Architecture Hardening (Checkout & Anti-Tampering):**
  - ย้ายการคำนวณและยืนยันส่วนลดมาประมวลผลที่ Backend 100% (Single Source of Truth) ป้องกันการปลอมแปลงราคา (Price Tampering)
  - Frontend (`frontend/app/products/[id]/page.js`) ส่งเฉพาะ `productId` และ `campaignId` (optional)
  - ห้ามเชื่อค่าจาก Client: `campaignCode`, `discountAmount`, `finalPrice` ถูกเพิกเฉยโดยสิ้นเชิง
- **Product-Service Internal Quote-and-Hold API:**
  - เพิ่ม `POST /internal/campaigns/:id/quote-and-hold` ป้องกันด้วย `requireInternalToken` (`x-internal-token`)
  - ตรวจสอบเงื่อนไขจากฐานข้อมูล `reloop_product` โดยตรง 10 ข้อ:
    1. Product มีอยู่จริงในระบบ
    2. Product อยู่ในสถานะ `reserved`
    3. ผู้ที่จองสินค้าตรงกับ Buyer คนนี้จริง (`reservedBy === userId`)
    4. การจองสินค้ายังไม่หมดอายุ (`reservationExpiresAt > now`)
    5. Buyer ถือคูปองนี้อยู่จริงในกระเป๋าคูปอง
    6. คูปองอยู่ในสถานะ `CLAIMED`
    7. คูปองไม่ถูก hold โดย Order อื่น (`usedOrderId === null || usedOrderId === orderId`)
    8. Campaign อยู่ในสถานะ `published`
    9. Campaign เริ่มแล้วและยังไม่หมดอายุ (`startsAt <= now <= endsAt`)
    10. ราคาสินค้าถึงยอดขั้นต่ำ `minOrderPrice` และหมวดหมู่สินค้าตรงกับ `applicableCategory`
  - คำนวณส่วนลดเอง:
    - PERCENT: `Math.round(price * discountValue / 100)` เคารพ `maxDiscount`
    - FIXED: `Math.min(discountValue, price)`
    - `finalPrice = Math.max(0, price - discountAmount)`
  - ป้องกัน Concurrency: ทำ Atomic Hold ด้วย `prisma.userVoucher.updateMany` ตรวจ `status: "CLAIMED"` และ `usedOrderId: null หรือ orderId เดิม` หากอัปเดตไม่สำเร็จ (count == 0) ตอบกลับ HTTP `409 Conflict` ทันที
- **Public API Closure:**
  - ปิด Public API ใน `campaignRoutes.js`: ลบ `POST /campaigns/:id/hold`, `POST /campaigns/:id/release`, `POST /campaigns/:id/complete` (เหลือเฉพาะ Internal API ส่วน `POST /campaigns/:id/claim` ยังคงเปิดเป็น Public ให้ผู้ซื้อกดรับสิทธิ์)
- **Order-Service Checkout Hardening:**
  - Pre-generate `orderId` (`crypto.randomUUID()`) ล่วงหน้าก่อนเรียก `quoteAndHold`
  - บันทึก Order ด้วยราคาและส่วนลดที่ Backend คำนวณเท่านั้น
  - หากพบ Order เดิมจาก reservation ให้คืน Order เดิมทันที ห้ามอัปเดตราคาจาก Client
  - ระบบคืนสิทธิ์ (Compensation): หากการสร้าง Order ล้มเหลว จะปลดล็อกทั้ง Voucher hold (`releaseVoucher`) และ Product reservation (`releaseProductReservation`) ทันที
  - รองรับ Idempotent retry (`P2002`)
- **Admin Decoupling Completion:**
  - ปรับปรุง `uploadRoutes.js`: เปลี่ยนเป็น `requireRole("SELLER", "MARKETING")` ปลด `ADMIN` ออกจาก Route อัปโหลดไฟล์อย่างสมบูรณ์
- **Testing & Verification:**
  - Unit Tests ใน `order-service/src/features/checkout/checkoutService.test.js`:
    - เพิกเฉยต่อราคาปลอมแปลงจาก Client (`discountAmount: 99999`, `finalPrice: 0`)
    - ทดสอบ Compensation: Order write ล้มเหลวจะปลดทั้ง Voucher hold และ Product reservation
    - ทดสอบ Existing reservation ไม่ปรับราคา และ Idempotent retry (`P2002`)
  - Integration Tests ใน `product-service/test/campaign.integration.test.js`:
    - ทดสอบ Internal Token Guard (403 Forbidden เมื่อไม่มี Token)
    - ทดสอบ 10 เงื่อนไขการตรวจ Product และ Voucher จากฐานข้อมูล
    - ทดสอบ Concurrency: คำขอสองคำขอพร้อมกันด้วย Order ต่างกัน คำขอแรกสำเร็จ คำขอที่สองได้ 409 Conflict
    - ตรวจสอบว่า Public hold/release/complete ตอบ 404 (ปิดสมบูรณ์) ขณะที่ claim ตอบ 201
    - ตรวจสอบ `POST /uploads` ปฏิเสธ ADMIN ด้วย 403 Forbidden
  - รัน Jest Tests ฝั่ง Frontend: ผ่าน 29/29 Suites (138/138 tests passing)
  - รัน Next.js Production Build: สำเร็จสมบูรณ์ 26/26 Static Pages

## 2026-09-18 — Campaign System Hardening, Buyer Segmentation, Attribution Engine & Dashboard UI (Tasks 1–11)

- **Requirement:** `MKT-003`, `MKT-004 Part B`, `MKT-007`, `MKT-DEC-016`–`MKT-DEC-019`, `WF-11`
- **Task 1: Count Semantics (Claimed vs Redeemed):**
  - แยกนิยามตัวนับอย่างชัดเจน:
    - `claimedCount`: จำนวนครั้งที่ผู้ซื้อกดเก็บคูปอง (map จาก `usedCount` ในโมเดล `Campaign`)
    - `redeemedCount`: จำนวนคำสั่งซื้อที่ใช้คูปองนี้และชำระเงินสำเร็จจริง (นับจาก `UserVoucher` ที่สถานะ `USED` หรือตาราง `campaign_attributions`)
  - อัปเดต `campaignRepository.js` ให้แสดงผลทั้ง `claimedCount` และ `redeemedCount` ในทุก API response
- **Task 2: Usage Limit & Atomic Claim Concurrency:**
  - เพิ่มฟังก์ชัน `claimVoucherAtomic` ใน `campaignRepository.js` ทำงานผ่าน `$transaction`:
    - ใช้คำสั่ง Atomic conditional update:
      `prisma.campaign.updateMany({ where: { id, usedCount: { lt: usageLimit } }, data: { usedCount: { increment: 1 } } })`
    - หากสิทธิ์เต็ม (`count === 0`) โยน `AppError("Campaign usage limit reached", 409)`
    - บันทึก `UserVoucher` ภายใน transaction เดียวกัน หากผู้ซื้อเคยกดเก็บแล้ว จะเกิด P2002 Unique Violation และแปลงเป็น 409 Conflict
- **Task 3: Campaign Validation & Normalization:**
  - ปรับปรุง `campaignService.js`:
    - Normalization: บังคับตัดขอบช่องว่างและแปลงเป็นตัวพิมพ์ใหญ่ `code.trim().toUpperCase()` ทั้งใน `createDraft` และ `updateDraft`
    - Bound Checks: บังคับ `discountValue <= 100` เมื่อ `discountType === "PERCENT"` ทั้งตอนสร้างและ partial update
    - Date Bounds: ตรวจสอบ `startsAt < endsAt` (ปฏิเสธหาก `startsAt >= endsAt`)
    - Numeric Bounds: บังคับค่าบวกสำหรับ `minOrderPrice >= 0`, `maxDiscount > 0`, `budget > 0`, `usageLimit > 0`
- **Task 4: Non-Published Campaign Gating:**
  - เพิ่ม `optionalAuth` middleware ใน `campaignRoutes.js`
  - ปรับปรุง `campaignService.getCampaignById`:
    - หากแคมเปญไม่อยู่ในสถานะ `published` (เช่น `draft`, `pending_approval`, `rejected`, `ended`) ผู้ใช้ที่เป็น Guest หรือผู้ใช้ที่มีบทบาท `BUYER` จะได้รับ HTTP `404 Not Found` เสมือนแคมเปญไม่มีอยู่จริง
    - อนุญาตให้เข้าดูได้เฉพาะผู้ใช้ที่มีบทบาท `MARKETING`
- **Task 5: Buyer Segmentation Engine:**
  - สร้าง `backend/services/product-service/src/features/segments/segmentRule.js`
  - ตรวจสอบความถูกต้องของกฎด้วย `validateSegmentRule(targetSegment)`
  - ฟังก์ชัน `matchesSegment(buyerProfile, targetSegment)`:
    - รองรับ `ALLOWED_FIELDS`: `favoriteCategory`, `preferredSize`, `sizePreference`, `styleTag`, `stylePreference`, `brandPreference`
    - รองรับ `ALLOWED_OPERATORS`: `eq`, `neq`, `in`, `nin`
    - รองรับ Case-insensitive matching และ Array evaluation
  - เชื่อมต่อเข้ากับ `listAvailablePublicCampaigns` และ `getApplicableVouchers` เพื่อคัดกรองแคมเปญที่ผู้ซื้อมีสิทธิ์เข้าถึงตามโปรไฟล์
- **Task 6 & 7: Attribution Snapshot & Order Completed Event (`order.completed.v1`):**
  - ใน `backend/services/order-service/src/services/productClient.js`: เพิ่ม `recordOrderCompleted(event)`
  - ใน `backend/services/order-service/src/controllers/orderController.js`: Dispatch event ทันทีที่ Order ถูกชำระเงิน (`pay()`) หรือปรับสถานะเป็น `completed` (`updateStatus`)
  - ใน `backend/services/product-service/src/features/campaigns/campaignMetrics.js`:
    - จัดเก็บ Fact ลงตาราง `campaign_attributions` (`event_id` PK, `order_id` UNIQUE, `campaign_id`, `discount_amount`, `final_price`, `completed_at`)
    - รองรับ In-memory storage อัตโนมัติในกรณี Test/Mock environment
    - รับประกัน Idempotency: เพิกเฉยต่อการส่ง Event ซ้ำด้วย `order_id` เดียวกัน
  - ใน `internalCampaignRoutes.js` & `campaignController.js`: เพิ่ม Endpoint ภายใน `POST /internal/campaigns/events/order-completed`
- **Task 8 & 9: Campaign Metrics Backend & Marketing Metrics API:**
  - คำนวณ Attribution Metrics:
    - `completedOrders`: จำนวนคำสั่งซื้อที่ใช้คูปองสำเร็จ
    - `grossRevenue`: ยอดขายรวมก่อนหักส่วนลด
    - `totalDiscount`: มูลค่าส่วนลดรวมที่ให้ลูกค้า
    - `netRevenue`: รายรับสุทธิ (`grossRevenue - totalDiscount`)
    - `conversionRate`: คำนวณเป็นร้อยละ `(redeemedCount / claimedCount) * 100` (หาก `claimedCount === 0` คืนค่า 0)
  - ตรวจสอบช่วงวันที่ด้วย `validateDateRange(from, to)` (ปฏิเสธหาก `from > to`)
  - เปิด REST API สำหรับบทบาท `MARKETING`:
    - `GET /metrics/overview`: สรุปภาพรวมยอดขาย คำสั่งซื้อ และส่วนลด
    - `GET /metrics/trends`: ข้อมูลแนวโน้มยอดขายและคำสั่งซื้อแบบ Time-series รายวัน
    - `GET /metrics/compare`: ตารางเปรียบเทียบผลลัพธ์ระหว่างแต่ละแคมเปญ
    - `GET /:id/metrics`: สถิติเฉพาะของแคมเปญที่ระบุ
- **Task 10: Automated Tests Verification:**
  - สร้างชุดทดสอบ Unit Tests:
    - `backend/services/product-service/test/campaignValidation.test.js` (12 tests)
    - `backend/services/product-service/src/features/segments/segmentRule.test.js` (7 tests)
    - `backend/services/product-service/test/campaignMetrics.test.js` (7 tests)
  - อัปเดต Integration Tests: `backend/services/product-service/test/campaign.integration.test.js`
  - สร้าง `scripts/test-shim.js` และ `scripts/dummyPrisma.js` สำหรับการทดสอบบน Host Environment
  - ผลการทดสอบ: ผ่าน 29/29 tests ใน Node test runner และผ่าน 29/29 suites (138/138 tests) ใน Jest ฝั่ง Frontend
- **Task 11: Marketing Dashboard UI:**
  - ปรับปรุง `frontend/components/marketing/sections/DashboardSection.js`:
    - เพิ่มการ์ดสรุป KPI 6 ใบ: คำสั่งซื้อที่สำเร็จ, ยอดขายรวม, ส่วนลดที่มอบให้, ยอดขายสุทธิ, อัตรา Conversion Rate, และสัดส่วนสิทธิ์ที่ใช้จริงเทียบกับที่ถูกเก็บ
    - เพิ่มตัวกรองช่วงเวลา (7 วัน, 30 วัน, 90 วัน, ทั้งหมด) พร้อมดึงข้อมูลแบบ Real-time จาก Metrics API
    - เพิ่มกราฟแท่งแนวโน้มยอดขายรายวัน (`TrendBarChart`)
    - เพิ่มตารางเปรียบเทียบแคมเปญ (Campaign Comparison Table)
    - คงการแสดงผลท่อสินค้าประมูล (Auction Pipeline Overview) เดิมไว้ครบถ้วน
    - คอมไพล์ Next.js Static Build ผ่าน 26/26 หน้า ปราศจาก Warning/Error

## 2026-09-19 — Marketing Part 2: Auction Integration Testing, Safe Idempotency Scoping & Teardown Refinements

- **Safe Idempotency Key Scoping (`auctionService.js`):**
  - เพิ่มฟังก์ชัน `validateIdempotentBid(existing, { auctionId, userId, bidAmount })` ตรวจสอบความถูกต้องของพารามิเตอร์: `existing.auctionId === auctionId && existing.bidderId === userId && existing.amount === bidAmount`
  - หากพารามิเตอร์ไม่ตรงกัน โยน HTTP `409 Conflict` (`"idempotency key reused with different bid parameters"`)
  - คืนค่า Bid เดิมเฉพาะกรณี Retry ด้วยพารามิเตอร์เดียวกันทุกประการ
  - ตรวจสอบ `idempotencyKey` ก่อนการตรวจสอบสถานะ `open` และ `scheduledEndAt` เพื่อให้การ Retry บนการประมูลที่ปิดแล้วสามารถดึง Bid เดิมกลับมาได้ถูกต้อง
  - นำการตรวจสอบพารามิเตอร์นี้ไปใช้ใน `P2002` race condition recovery path ด้วย
- **Strict Teardown Ordering & Error Aggregation (`auction.integration.test.js`):**
  - จัดระเบียบการ Cleanup ใน `t.after()`:
    1. ปิด Worker (`stopWorker`)
    2. ยกเลิก Delayed Job ใน Redis (`cancelClose`)
    3. ลบข้อมูลใน PostgreSQL ตามลำดับ Reverse-Dependency (`Bid` -> `AuctionItem` -> `Product` -> `AuctionRound`)
    4. ปิด Queue (`closeQueue`) และตัดการเชื่อมต่อ Prisma (`$disconnect`)
  - รวบรวม Error ทั้งหมดลงใน `cleanupErrors = []` และ throw รายงานผลรวมหากมีข้อผิดพลาด ไม่ swallow error ด้วย `.catch(() => {})`
- **Strengthened Anti-Sniping Soft Close Assertion (`auction.integration.test.js`):**
  - ยกระดับการ Assert BullMQ Delayed Job ใน Redis ให้ตรวจสอบว่า `(rescheduledJob.timestamp + rescheduledJob.opts.delay)` ตรงกับเวลา `updatedAuction.scheduledEndAt.getTime()` ภายในระยะคลาดเคลื่อนไม่เกิน 2 วินาที ($\Delta < 2000\text{ms}$)
- **Dynamic Supertest Fallback (`scripts/test-shim.js`):**
  - ปรับปรุงให้พยายาม `require("supertest")` จากระบบปกติก่อน หากไม่พบจึง fallback ไปยัง `supertest-shim.js` เพื่อรองรับทั้ง CI ที่มี package และ Local Host ที่ไม่มี devDependencies
- **Automated Verification:**
  - Unit Tests: `backend/services/product-service/src/features/auctions/auctionService.test.js` ผ่าน 39/39 tests (เพิ่ม 7 unit tests ใหม่)
  - Integration Tests: `backend/services/product-service/test/auction.integration.test.js` ผ่าน 10/10 tests (1 suite, 9 subtests) บน PostgreSQL และ Redis จริง 100%
  - รวม Marketing Unit Tests ทั้งหมด 68/68 tests ผ่าน 100%

## 2026-09-19 — Feature: Auction Round Overlap Protection, Concurrency Serialization & Deterministic Selection (MKT-DEC-020)

- **Problem:**
  - เดิมตาราง `AuctionRound` อนุญาตให้สร้างหลายรอบได้ แต่ `createRound` ขาดการตรวจสอบช่วงเวลาที่ซ้อนทับกัน (Overlap)
  - `findCurrentRound` เลือกจากแถวที่สร้างล่าสุด (`createdAt: "desc"`) แทนที่จะเลือกตามเวลาจริง (`now`)
  - หากมีการสร้างรอบที่ช่วงเวลาชนกัน การส่งสินค้าของผู้ขายจะถูกผูกเข้ากับรอบที่สร้างใหม่สุดโดยไม่คำนึงถึงความเป็นจริง
  - หน้าแดชบอร์ด Marketing แสดงเฉพาะรอบปัจจุบันที่ `/rounds/current` โดยไม่สามารถดูประวัติรอบทั้งหมดหรือสถานะรอบอื่นได้
- **Architectural Solutions & Implementation:**
  - **Strict Half-Open Time Boundaries Everywhere (`[Start, End)`):**
    - กำหนดช่วงเวลาของรอบทั้งหมดเป็น Half-open interval $[S, E)$ โดยที่ $S = \text{submissionStartsAt}$ และ $E = \text{auctionEndsAt}$
    - เงื่อนไข Overlap: สองรอบ $A [S_A, E_A)$ และ $B [S_B, E_B)$ ซ้อนทับกันเมื่อ $S_A < E_B \land S_B < E_A$
    - อนุญาต Back-to-back rounds เมื่อรอบใหม่เริ่มตรงกับเวลาที่รอบก่อนหน้าจบพอดี ($E_A = S_B$)
    - สถานะของรอบ 5 สถานะอิงเวลาจริง:
      - `upcoming`: `now < submissionStartsAt`
      - `submission`: `submissionStartsAt <= now && now < submissionEndsAt`
      - `waiting`: `submissionEndsAt <= now && now < auctionStartsAt`
      - `auction`: `auctionStartsAt <= now && now < auctionEndsAt`
      - `ended`: `now >= auctionEndsAt`
    - ปรับทุกจุดให้ใช้ `now < submissionEndsAt` อย่างสม่ำเสมอทั้งใน `auctionRepository.js` และ `auctionService.js`
  - **PostgreSQL Advisory Lock Serialization (`pg_advisory_xact_lock(1001, 1)`):**
    - ป้องกัน Concurrency Race Condition ระหว่างการตรวจหาการซ้อนทับ (`findConflictingRound`) และการสร้างรอบ (`createRound`)
    - ใช้สองพารามิเตอร์ integer `(1001, 1)` เพื่อแยก Namespace ออกจาก Transaction อื่นๆ (เช่น Auction Lock ที่ใช้ Single 64-bit hashtext)
    - ส่ง Transaction Client `tx` ผ่าน `withRoundLock(fn)` ไปยัง `findConflictingRound(..., tx)` และ `createRound(..., tx)` เพื่อให้ทำงานภายใต้ Lock เดียวกันอย่างแท้จริง
    - หากพบการซ้อนทับ โยน HTTP `409 Conflict` พร้อมข้อความ Bilingual Thai/English ระบุ ID และ Title ของรอบที่ขัดแย้งอย่างชัดเจน
  - **Deterministic Current-Round Selection (`findCurrentRound`):**
    - เลือกรอบที่ Active อยู่ ณ เวลา `now` ก่อน (`submissionStartsAt <= now && now < auctionEndsAt`)
    - หากไม่มีรอบที่ Active ให้เลือกรอบที่ใกล้จะมาถึงที่สุดเป็นอันดับแรก (`submissionStartsAt > now` เรียงตาม `submissionStartsAt ASC`)
    - หากทุกรอบสิ้นสุดลงแล้ว (`now >= auctionEndsAt`) ให้คืนค่า `null`
  - **Marketing UI All-Rounds History & Deterministic Card:**
    - ปรับปรุง `frontend/components/marketing/sections/AuctionScheduleSection.js`:
      - ดึงข้อมูลรอบทั้งหมดจาก `GET /api/products/auctions/rounds`
      - แสดงตารางประวัติรอบการประมูลทั้งหมด (All Auction Rounds) พร้อมป้ายสถานะ (Phase Badge)
      - การ์ดรอบการประมูลปัจจุบันแสดงข้อมูลรอบที่ Active หรือรอบถัดไปที่จะมาถึงพร้อมแถบกำกับ
      - แสดงแบนเนอร์แจ้งเตือนสีแดงกรณีเกิด HTTP 409 Conflict
      - กำหนด `htmlFor` และ `id` ให้กับฟอร์มสร้างรอบเพื่อความสมบูรณ์ด้าน Accessibility
- **Automated Verification:**
  - **Unit Tests:** `backend/services/product-service/src/features/auctions/auctionService.test.js` ผ่าน 48/48 tests (เพิ่ม 9 unit tests ครอบคลุม `deriveRoundPhase`, `createRound` validations/conflict/tx, `getCurrentRound` with fakeNow, and `listRounds`)
  - **Frontend Jest Tests:** `frontend/components/marketing/sections/AuctionScheduleSection.test.js` ผ่าน 7/7 tests ครอบคลุมการทดสอบ `RoundManagementSection` named export (Current round, Upcoming round, All-rounds table, Empty state, 409 Conflict banner, Refresh after creation) และ Parent `AuctionScheduleSection` component พร้อม mock API ครบถ้วน
  - **Auction Integration Tests (Real DB & Redis):** `backend/services/product-service/test/auction.integration.test.js` เพิ่ม Step 10: ผ่านครบ 11/11 tests across 10 steps บน PostgreSQL และ Redis จริง 100%
  - ผลรวม Unit Tests ของ Product-Service ทั้งหมด 77/77 tests ผ่าน 100%

## 2026-10-03 — Feature: Marketing Task 1 — Durable Campaign Attribution Engine, Outbox Pattern & PostgreSQL Persistence Hardening (MKT-003, MKT-007, UR-09, UR-12)

- **Problem & Requirements:**
  - เดิม Campaign Attribution (`MKT-003`, `MKT-007`) ขาดการบันทึกสถานะลงฐานข้อมูลแบบถาวร โดยอาศัย Dynamic SQL `CREATE TABLE` ชั่วคราว และไม่มีการรับประกันความน่าเชื่อถือหาก Product Service ขัดข้องขณะ Order เสร็จสิ้น
  - การส่ง Event `order.completed` เป็นแบบ Fire-and-forget ขาด Retry Mechanism และ Exponential Backoff หากเกิด Network Failure ข้อมูล Attribution จะสูญหายทันที
  - ขาดการทดสอบ Integration Test ครอบคลุมการทำงานร่วมกับ PostgreSQL จริงทั้งสองฐานข้อมูล (`reloop_order` และ `reloop_product`) โดยแยกเขตความรับผิดชอบ (Service Boundary) อย่างเคร่งครัด
- **Architectural Solutions & Implementation:**
  - **Reloop Order Schema & Transactional Outbox Pattern (`order-service`):**
    - เพิ่มโมเดล `AttributionOutboxEvent` ใน `backend/services/order-service/prisma/schema.prisma` (`id`, `orderId` @unique, `campaignId`, `grossAmount`, `discountAmount`, `netAmount`, `completedAt`, `attempts`, `nextAttemptAt`, `processedAt`, `lastError`)
    - สร้างแถว Outbox ใน Transaction เดียวกันกับ `Order.status = "completed"` อย่าง Atomic ใน `orderModel.transitionStatusWithProductSync`
    - กำจัด Silent Feature-detection: ปรับปรุง `orderModel.js` และ `attributionOutboxService.js` ให้ fail loudly หาก Prisma model ขาดหาย เพื่อป้องกันไม่ให้ออเดอร์ที่มี campaign สำเร็จได้โดยปราศจาก outbox durability record
    - สร้าง `attributionOutboxService.js`: รองรับการส่ง Event พร้อม Payload มาตรฐานและ Flat compatibility fields, บันทึกสถานะ `processedAt` เมื่อสำเร็จ หรือบันทึกข้อผิดพลาดและคำนวณ `nextAttemptAt` ด้วย Exponential Backoff เมื่อล้มเหลว
    - ระบบ Batch Worker (`processPendingEvents`, `startWorker`) กวาดส่งงานที่ค้างอย่างสม่ำเสมอ
    - ปรับปรุง `productClient.js` ให้ประเมิน `PRODUCT_SERVICE_URL` และ `INTERNAL_SERVICE_TOKEN` แบบ Dynamic ต่อ Request เพื่อรองรับทั้ง Live Stack และ Isolated Integration Testing
  - **Reloop Product Schema & Campaign Attribution Fact Model (`product-service`):**
    - เพิ่มโมเดล `CampaignAttribution` ใน `backend/services/product-service/prisma/schema.prisma` (`eventId` @id, `orderId` @unique, `campaignId` index, `completedAt` index, `grossAmount`, `discountAmount`, `netAmount`)
    - Refactor `campaignMetrics.js`: ลบ Dynamic raw SQL ออกอย่างสิ้นเชิง และใช้ Prisma Client บันทึกลงในตาราง `campaign_attributions`
    - กำจัด Silent In-memory Fallback ใน Production: บังคับให้ `campaignMetrics.js` ในเส้นทาง Production ทำการ Fail loudly (`throw new Error(...)`) หาก Prisma client ขาดโมเดล `campaignAttribution` โดยสงวน In-memory store ไว้เฉพาะ Unit Test Adapter ที่ถูก Inject เข้ามาอย่างชัดเจนเท่านั้น
    - เสริมความปลอดภัย Idempotency และ Identity Conflict:
      - การใช้ `eventId` เดิมซ้ำกับ `orderId` ใหม่ที่มีข้อมูลตรงกันทั้งหมดจะถูกปฏิเสธด้วย HTTP 409 Conflict ทันที เพื่อป้องกัน Identity Spoofing / Event ID reuse
      - คำสั่งซื้อเดิม (`orderId` เดิม) ที่ส่งมาด้วย `eventId` ใหม่พร้อมข้อมูลที่ตรงกันทั้งหมด จะถือเป็น Valid Deduplicated Retry และคืนสถานะสำเร็จแบบ deduplicated (HTTP 200)
      - ครอบคลุมทั้งขั้นตอน Pre-check ก่อนบันทึก และขั้นตอนฟื้นฟู `P2002` Unique Constraint Race Recovery
    - ส่งต่อ Error ในโหมด DB จริง ไม่ swallow error เพื่อเปิดทางให้ Outbox Retry
  - **Strict Cross-Service Boundary & Reproducible Testing:**
    - ไม่มีการ Query ข้าม Database ใน Production Code: Order Service จัดการเฉพาะ `reloop_order` และ Product Service จัดการเฉพาะ `reloop_product`
    - การส่งผ่านข้อมูลกระทำผ่าน REST Contract `POST /internal/campaigns/events/order-completed` พร้อม Header `x-internal-token` (ป้องกันด้วย 403 Forbidden เมื่อ Token ไม่ถูกต้อง)
    - รัน Cross-service integration test ได้อย่าง Reproducible จาก Repository Test Environment โดยใช้ Generated Prisma Client ทั้งสองตัวจากโปรเจกต์ (`backend/services/order-service/src/generated/prisma-client` และ `backend/services/product-service/src/generated/prisma-client`) ปราศจากการพึ่งพาการก็อปปี้ไฟล์ไปยัง Production Container และเมื่อ Fallback รัน Express app ในเครื่องจะผูกกับ `DATABASE_URL_PRODUCT` แยกจาก Order DB อย่างถูกต้อง
- **Automated Verification Evidence:**
  - **Genuine Cross-Service PostgreSQL Integration Suite (`order-service/test/cross-service-attribution.integration.test.js`):** ผ่านครบ 9/9 subtests (10/10 tests passing 100%) บน Repository Test Environment ด้วย `REQUIRE_INTEGRATION=1` ทดสอบ Full Lifecycle ข้าม 2 Database จริง:
    1. Order completion ใน `reloop_order` สร้าง `AttributionOutboxEvent` แบบ Atomic
    2. ส่งผ่าน HTTP ไปยัง Product Service และอัปเดต `processedAt` ใน `reloop_order`
    3. ตรวจสอบใน `reloop_product`: บันทึก `CampaignAttribution` ลงตารางจริง
    4. Idempotent Retry: ส่งซ้ำได้ผล deduplicated และไม่สร้างแถวซ้ำ
    5. Conflicting Payload: ข้อมูลตัวเลขขัดแย้งคืน 409 Conflict
    6. Identity Conflict: นำ `eventId` เดิมไปใช้กับ `orderId` อื่นคืน 409 Conflict แม้ตัวเลขจะตรงกันทั้งหมด
    7. Failure Backoff: ปลายทางล้มเหลว (503) บันทึก `lastError` และ `nextAttemptAt` ใน `reloop_order` โดยคง `processedAt = null`
    8. Worker Sweep: `processPendingEvents` กวาดส่งงานที่ค้างผ่าน HTTP ไปบันทึกใน `reloop_product` สำเร็จ
    9. Non-campaign Orders: คำสั่งซื้อที่ไม่มีแคมเปญไม่สร้าง Outbox event ใน `reloop_order`
  - **Product Service PostgreSQL Integration Suite (`product-service/test/campaign-attribution.integration.test.js`):** ผ่านครบ 12/12 subtests (13/13 tests passing 100%) บน PostgreSQL `reloop_product` จริงด้วย `REQUIRE_INTEGRATION=1` (ทดสอบความปลอดภัย 403, การบันทึกลงตารางจริง, Idempotency ซ้ำ, 409 Conflict on payload mismatch, 409 Conflict on eventId reuse, No-campaign bypass, และการคำนวณ KPIs: Gross/Net Revenue, Discounts, Conversion Rate, Trends, และ Date Range Validation)
  - **Order Service Outbox PostgreSQL Integration Suite (`order-service/test/campaign-attribution.integration.test.js`):** ผ่านครบ 6/6 subtests (7/7 tests passing 100%) บน PostgreSQL `reloop_order` จริงด้วย `REQUIRE_INTEGRATION=1` (ทดสอบ Atomic Outbox row creation, No-campaign bypass, Outbox delivery พร้อม `x-internal-token`, Retry backoff on failure 503, Sweep recovery of pending events, และ Idempotent acknowledgment)
  - **Unit Tests:**
    - `product-service/test/campaignMetrics.test.js`: ผ่านครบ Campaign Metrics 13 test cases โดยไม่รวม parent suite ของ node:test (passing 100% ครอบคลุม Fail-loud in production path, Identity Conflict, และ `P2002` Race Recovery)
    - `order-service/src/services/attributionOutboxService.test.js`: ผ่านครบ 7/7 subtests (8/8 tests passing 100% ครอบคลุม Fail-loud durability)
    - `order-service` Unit Tests รวมทั้งหมด: ผ่านครบ 53/53 tests 100% ปราศจาก Regression
    - รวม Marketing Unit Tests ทั้งหมด: 84 total tests passing 100% (Auction Service 48 + Campaign Validation 12 + Segment Rule 7 + Campaign Metrics 13 + Product Payload 4 = 84; historical baseline: 71 tests)

## 2026-10-04 — Feature: UR-11 Swipe-to-Choose Hardening (Buyer Authorization, Persistence, User Isolation & Identity Spoof Prevention)

- **Problem & Requirements:**
  - เดิม `UR-11` (Swipe-to-Choose) ขาดการตรวจสอบสิทธิ์เฉพาะผู้ซื้อ (Buyer-only Authorization) โดยเปิดให้บทบาทอื่นเรียก API choose/unchoose ได้
  - ฟีดสินค้าสาธารณะ (`GET /api/products/videos/feed`) ไม่ได้เชื่อมโยงกับสถานะ `chosen` ของผู้ซื้อในฐานข้อมูล ทำให้สถานะการ Bookmark หายไปเมื่อ Refresh หรือเปลี่ยนอุปกรณ์
  - การพึ่งพา Header `x-user-id` บน Public Endpoint โดยไม่มี Bearer Token เปิดช่องโหว่ Identity Spoofing ทำให้ผู้ไม่หวังดีสามารถส่ง `x-user-id` ของผู้ใช้อื่นมาเพื่อแอบดู Bookmark ได้
  - ชุดทดสอบเดิมขาดการครอบคลุมกรณี Unchoose รายการที่ไม่ได้เลือก, การป้องกัน N+1 query, และการ Rollback สถานะฝั่งฟรอนต์เอนด์เมื่อเกิด Network Failure
- **Implementation & Security Hardening:**
  - **Buyer-Only Authorization:**
    - กำหนด Route Middleware `requireBuyerRole` บน `POST /:id/choose`, `DELETE /:id/choose`, และ `POST /:id/unchoose` ตรวจสอบทั้ง `req.userRole === "BUYER"` และ `req.userRoles.includes("BUYER")` หากเป็นบทบาทอื่น (`SELLER`, `MARKETING`, `ADMIN`) จะถูกปฏิเสธด้วย HTTP `403 Forbidden` และหากไม่มี Token จะถูกปฏิเสธด้วย HTTP `401 Unauthorized`
    - เพิ่มการตรวจสอบระดับ Service Layer ใน `productVideoService.js` (`isBuyer(user)`) เพื่อป้องกันการเรียกใช้งานฟังก์ชันข้ามช่องทาง
  - **Server-Side Persistence & Batch Query (No N+1):**
    - ปรับปรุง `productVideoRepository.listAvailable` ให้รับ `userId` และใช้ Prisma relation include `choices: { where: { userId }, select: { id: true } }` ดึงข้อมูลสถานะการเลือกของผู้ใช้ใน Query เดียว
    - แมปฟิลด์ `chosen: Boolean(...)` และตัดความสัมพันธ์ `choices` ออกจาก Response สาธารณะทั้งหมด เพื่อรักษาความเป็นส่วนตัวของข้อมูล
  - **User Isolation & Guest Handling:**
    - แยกสถานะ `chosen` เด็ดขาดระหว่างผู้ซื้อแต่ละคน (การเลือกของ Buyer A ไม่ปรากฏเป็น true ในฟีดของ Buyer B)
    - สำหรับผู้ใช้งานทั่วไป (Guest) ฟีดจะส่งคืน `chosen: false` เสมอทุกรายการ
  - **Anti-Spoofing & Optional Authentication:**
    - ปรับปรุง `optionalAuth` ใน `productVideoRoutes.js`: หากไม่มี `Authorization: Bearer` Token จะกำหนด `userId = null` เสมอ โดยไม่เชื่อถือ Header `x-user-id` หรือ `x-user-role` ที่ส่งมากับ Request สาธารณะ
    - หากมี Bearer Token จะส่งต่อให้ Trusted Auth Middleware (`requireAuth`) ตรวจสอบ JWT Signature และความถูกต้องของ Session
    - ปรับปรุง API Gateway (`backend/gateway/src/app.js`): ลบ Header ที่ขึ้นต้นด้วย `x-user-` ทั้งหมดจาก Inbound Client ก่อนเริ่ม Route Request เพื่อให้มั่นใจว่า Trusted Identity Headers จะถูกสร้างขึ้นโดย Gateway หลังตรวจ Token สำเร็จเท่านั้น (ผ่านการตรวจสอบ Implementation review และ Lint แล้ว โดยยังไม่มี Dedicated automated test สำหรับ Gateway header stripping)
  - **Idempotency & Safe Unchoose:**
    - `productVideoRepository.upsertChoice`: ใช้ Prisma `upsert` บน Composite Unique `@@unique([productVideoId, userId])` รับประกันการเลือกซ้ำไม่สร้างแถวซ้ำใน `swipe_choices`
    - `productVideoRepository.deleteChoice`: ใช้ Prisma `deleteMany` จัดการการยกเลิกเลือกรายการที่ยังไม่ได้เลือกอย่างปลอดภัย ส่งคืน `{ chosen: false }` โดยไม่เกิดข้อผิดพลาด HTTP 500
  - **Frontend Persistence & Optimistic Rollback:**
    - `SwipeVideoCard.js`: กำหนดค่าเริ่มต้นจาก `video.chosen` และเพิ่ม `useEffect` ซิงค์สถานะเมื่อ `video.chosen` อัปเดตหลัง Refetch
    - ดำเนินการ Optimistic Update ทันทีเมื่อผู้ใช้คลิก และหาก API ปลายทางล้มเหลว (Network Error / 403 / 500) จะทำการ Rollback กลับสู่สถานะก่อนหน้าทันที
  - **Requirement Boundary:** ยืนยันตาม `MKT-DEC-006` และ `MKT-DEC-021` ว่า `SwipeChoice` ทำหน้าที่เป็นเพียง Bookmark ความสนใจของผู้ซื้อเท่านั้น ไม่มีความสัมพันธ์กับการประมูลสินค้า (Auction) และไม่ใช่การเสนอราคา (Bid)
- **Automated Verification Evidence:**
  - **Backend & Gateway Targeted Tests:** ผ่านครบ 29/29 tests 100%
    - Gateway App Tests (`backend/gateway/src/app.test.js`): ผ่าน 5/5 tests (ครอบคลุม Gateway auth routing และ Public routes; สำหรับ header stripping ผ่าน implementation review/lint แต่ยังไม่มี dedicated automated test)
    - Product Service App Tests (`backend/services/product-service/src/app.test.js`): ผ่าน 10/10 tests
    - Product Video Repository Tests (`backend/services/product-service/src/features/product-videos/productVideoRepository.test.js`): ผ่าน 2/2 tests (ครอบคลุม Guest chosen: false, User-specific chosen, และยืนยันไม่รั่วไหล choices relation)
    - Product Video Service Tests (`backend/services/product-service/src/features/product-videos/productVideoService.test.js`): ผ่าน 12/12 tests (ครอบคลุม 403 ทุก Role ที่ไม่ใช่ BUYER, Multi-role BUYER, และ Pagination forwarding)
    - รวม Backend & Gateway Targeted Tests: 5 + 10 + 2 + 12 = 29 tests
  - **Frontend Swipe Component Tests:** ผ่านครบ 3/3 suites (42/42 tests passing 100%)
    - `frontend/components/swipe/SwipeVideoCard.test.js`: ผ่านครบ 28/28 tests (รวมการทดสอบ Initial render จาก `video.chosen`, Refetch sync, และ Rollback เมื่อเกิดข้อผิดพลาดทั้งฝั่ง Choose และ Unchoose)
    - `frontend/components/swipe/SwipeFeedViewer.test.js`: ผ่านครบ 8/8 tests (ครอบคลุมการเลื่อนดูคลิป, Touch swipe, Desktop controls, และ Query synchronization)
    - `frontend/app/swipe/page.test.js`: ผ่านครบ 6/6 tests
  - **PostgreSQL Integration Test (`REQUIRE_INTEGRATION=1`):**
    - `backend/services/product-service/test/swipe-choose.integration.test.js`: ผ่าน 1/1 suite (10 verification assertions) บน PostgreSQL `reloop_product` จริง ปราศจากการ Skip:
      1. 401 Unauthorized บน `POST /choose`, `DELETE /choose`, `POST /unchoose` เมื่อไม่มี Token
      2. 403 Forbidden สำหรับ `SELLER`, `MARKETING`, `ADMIN` ทุกคำสั่ง
      3. 200 OK และบันทึกลงตาราง `swipe_choices` จริงสำหรับ `BUYER`
      4. Idempotency: การเลือกซ้ำไม่สร้างแถวซ้ำในฐานข้อมูล (`count === 1`)
      5. Guest Feed: ทุกรายการได้รับ `chosen: false`
      6. Buyer A Feed: รายการที่เลือกได้รับ `chosen: true`
      7. User Isolation: Buyer B เห็นรายการที่ Buyer A เลือกเป็น `chosen: false`
      8. Identity Anti-Spoofing: ส่ง Header `x-user-id: ur11-buyer-a` โดยไม่มี Bearer Token ได้รับ `chosen: false` ไม่สามารถอ่านข้อมูลผู้อื่นได้
      9. Safe Unchoose: Unchoose รายการที่ไม่ได้เลือกไม่เกิด HTTP 500
      10. Unchoose สำเร็จ: ลบแถวออกจากฐานข้อมูลและฟีดอัปเดตเป็น `chosen: false`
  - **Quality Gates & Formatting:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100% (All matched files use Prettier code style!)
    - `git diff --check`: ผ่าน 100% (ไม่มีข้อผิดพลาด whitespace)
- **Pending Acceptance Note:** ชุดทดสอบอัตโนมัติระดับ Backend, Frontend Component, และ PostgreSQL Integration ผ่านการตรวจสอบครบถ้วนแล้ว แต่ Browser E2E / Responsive UI verification บนเบราว์เซอร์จริงยังไม่ได้ดำเนินการและคงสถานะเป็น Final Acceptance ที่รอดำเนินการต่อไป

## 2026-10-05 — Feature: UR-08 Marketing User & Peak-Usage Analytics Dashboard (Code Review Resolved)

- **Problem & Requirements:**
  - Marketing Dashboard (`/marketing`) ต้องการแสดงผลข้อมูลจริงเกี่ยวกับสถิติผู้ใช้งานและช่วงเวลาการใช้งานสูงสุด (Peak Usage Hour) ตามช่วงวันที่เลือก เพื่อใช้ประกอบการวางแผนแคมเปญ
  - ตัวชี้วัดสำคัญ 4 รายการ: Active Users, New Users, Hourly Usage Aggregation, และ Peak Usage Hour พร้อม Date-range filtering
  - ต้องรักษา Service Boundary: ข้อมูลผู้ใช้และกิจกรรมเป็นของ Auth Service ห้าม Product Service หรือบริการอื่น Query ข้ามฐานข้อมูลโดยตรง
  - Response ต้องเป็น Aggregate เท่านั้น ปราศจาก PII (ไม่มี email, phone, displayName, userId หรือ payload กิจกรรมส่วนบุคคล)
  - ห้ามใช้ In-memory fallback ใน Production และ Database Error ต้องไม่ถูกกลืนเป็นเลขศูนย์
- **Code Review Resolutions:**
  - **1. Timezone & Date Range:**
    - กำหนด Business Timezone ของ UR-08 เป็น `Asia/Bangkok` (+07:00) อย่างเคร่งครัด
    - ปฏิเสธ Timezone อื่นด้วย HTTP 400 Bad Request
    - แปลง UTC `timestamp without time zone` ของ Prisma ผ่าน `(activity_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'` ใน SQL ก่อนทำ `date_trunc('hour', ...)` เพื่อให้ได้ชั่วโมงและ Peak Hour ตามเวลาไทยที่ถูกต้อง
    - ตัวแปลงวันที่ใน Frontend (`convertThaiDateFilterToRange`) กำหนดให้ `from` เป็น 00:00:00+07:00 และ `to` เป็น 00:00:00+07:00 ของวันถัดไป (`[from, to)` exclusive boundary) รองรับขอบเขตสิ้นเดือน สิ้นปี และ Leap Year อย่างถูกต้อง
    - ป้องกันการส่ง Partial request ระหว่างผู้ใช้กรอกวันที่
    - ลบข้อความ "UTC" ทั้งหมดออกจาก UI Dashboard
  - **2. Gateway Cross-Service Integration Test:**
    - ปรับปรุง `backend/gateway/src/marketing-analytics.cross-service.test.js` ไม่ยอมรับ HTTP 500 เป็นผลสำเร็จ
    - Success path ทำงานร่วมกับ PostgreSQL จริงผ่าน Gateway -> Auth Service -> PostgreSQL ได้รับ HTTP 200 OK
    - ตรวจสอบ `activeUsers`, `newUsers`, `peakHour`, `hourlyUsage` (24 buckets พร้อมรูปแบบ `+07:00`), `range.timezone = "Asia/Bangkok"`, และยืนยันว่าไม่มี PII
    - แยก Test "DB error propagates" เป็นอีก Subtest หนึ่งที่ยืนยันว่า HTTP 500 ส่งต่อออกมาอย่างถูกต้อง
    - Fail loud เมื่อ `REQUIRE_INTEGRATION=1` และ DB ไม่พร้อม (ไม่มีการ skip)
  - **3. Dashboard Honest Error State:**
    - ปรับปรุง `frontend/components/marketing/sections/DashboardSection.js`
    - เมื่อ API ล้มเหลว แสดง Error Banner พร้อมปุ่ม Retry, การ์ด KPI แสดง `—` และ `ไม่พร้อมใช้งาน` (ห้ามแสดง 0 หลอก), และกราฟไม่แสดง Empty State
    - เมื่อกด Retry สำเร็จ สามารถล้าง Error และกลับมาแสดงข้อมูลจริงได้
    - เมื่อข้อมูลว่างจริง (Empty State) ยังคงแสดงเลข 0 และ Empty State Banner ได้ตามปกติ
- **Automated Verification Evidence:**
  - **Backend Unit Tests:** `backend/services/auth-service/src/features/metrics/activityMetrics.test.js` ผ่าน 7/7 tests 100%
  - **Gateway Cross-Service Tests:** `backend/gateway/src/marketing-analytics.cross-service.test.js` ผ่าน 2/2 tests 100% บน PostgreSQL จริงด้วย `$env:REQUIRE_INTEGRATION="1"`
  - **PostgreSQL Integration Test:** `backend/services/auth-service/test/user-analytics.integration.test.js` ผ่าน 1/1 suite 100% (0 skips) บน PostgreSQL จริง
  - **Frontend Client & UI Tests:** ผ่าน 30/30 tests 100% (`DashboardSection.test.js` 20/20 tests, `api.test.js` 10/10 tests)
  - **Quality Gates:** `npm run lint` ผ่าน (0 errors, 0 warnings), `npm run format:check` ผ่าน (All matched files use Prettier code style!), `git diff --check` ผ่าน (ไม่มีข้อผิดพลาด whitespace)

## 2026-10-05 — Feature: Marketing Audit Trail (Append-Only Audit Log for Campaigns, Auctions, and Articles — Code Review Resolved)

- **Problem & Requirements:**
  - ฝ่ายการตลาดต้องการระบบบันทึกประวัติการดำเนินงาน (Marketing Audit Trail) ที่โปร่งใสและตรวจสอบย้อนหลังได้ สำหรับการเปลี่ยนแปลงสถานะและการจัดการแคมเปญการตลาด, สินค้าและรอบประมูล, และบทความให้ความรู้
  - ต้องเป็นระบบ Append-Only อย่างแท้จริง: ห้ามเปิด Client Write/Update/Delete API และไม่มี Business API ให้ผู้ใช้แก้ไขหรือลบบันทึกได้
  - ต้องผูกการบันทึก Audit Log เข้ากับ Business Mutations ใน Database Transaction เดียวกัน (Atomic Transaction): หาก Audit บันทึกล้มเหลว Business Mutation ต้องถูก Rollback ทั้งหมด; หาก Business Mutation ล้มเหลว จะต้องไม่มี Audit Log ถูกบันทึก
  - สำหรับเหตุการณ์อัตโนมัติ (Automatic Actions เช่น Auto-expiry, Worker Auction Close) ต้องใช้ Actor `SYSTEM` (`actorId: "SYSTEM"`, `actorRole: "SYSTEM"`) และมี `idempotencyKey` แบบ Deterministic เพื่อป้องกันการบันทึก Audit Log ซ้ำซ้อนกรณีเกิด Worker Retry
  - ข้อมูล `metadata`, `previousState`, และ `newState` ต้องผ่านการ Sanitize ตัดข้อมูลละเอียดอ่อน (Passwords, Tokens, Secrets, Cookies, API Keys, Credentials) ทั้งหมดอย่างปลอดภัย
  - ฝั่งฟรอนต์เอนด์ต้องมีแท็บ "ประวัติการดำเนินงาน" ในแดชบอร์ด `/marketing` พร้อมการกรอง, การแบ่งหน้า, การแสดงรายละเอียด, และสถานะการโหลด/ข้อผิดพลาดที่ชัดเจน
- **Code Review Resolutions:**
  - **1. Marketing-only Authorization & Admin Decoupling:**
    - กำหนดสิทธิ์การอ่าน Audit Log (`GET /marketing/audit-logs` และ `/api/products/marketing/audit-logs`) ให้จำกัดเฉพาะบทบาท `MARKETING` เท่านั้น (`requireMarketingAccess`)
    - บทบาท `BUYER`, `SELLER` และ `ADMIN` ได้รับ HTTP `403 Forbidden` ตามหลักการ Least Privilege และ `MKT-DEC-014`
    - ป้องกันการ Bypass: Permission `analytics:read:marketing` หรือ `audit:read:marketing` ไม่สามารถทำให้ผู้ใช้บทบาทอื่นเข้าถึงได้
    - ป้องกัน Identity Spoofing: ผู้ใช้ที่ไม่ผ่านการล็อกอินได้รับ HTTP 401 Unauthorized และการส่ง header `x-user-role` ปลอมแปลงโดยไม่มี Token ได้รับ 403
    - อัปเดตเอกสารทั้งหมดจาก Marketing/Admin เป็น Marketing-only
  - **2. SYSTEM Idempotency in PostgreSQL Transactions (No 25P02 Transaction Abort):**
    - แก้ไขปัญหาการดักจับ Prisma Error `P2002` ภายใน Transaction บล็อก ซึ่งทำให้ PostgreSQL abort transaction ทั้งหมด (`25P02: current transaction is aborted, commands ignored until end of transaction block`) จนไม่สามารถสั่ง `findUnique` ต่อใน Transaction เดิมได้
    - โซลูชัน: ใช้ `createMany({ data: [{ id: crypto.randomUUID(), ...data }], skipDuplicates: true })` ซึ่งแปลงเป็น SQL `INSERT ... ON CONFLICT DO NOTHING` บน PostgreSQL ทำให้ Transaction ไม่ถูก Abort และสามารถเรียก `findUnique` ดึงเรคอร์ดเดิมกลับมาได้อย่างปลอดภัย 100%
    - การบันทึก Audit ปกติที่ไม่มี `idempotencyKey` ยังคงใช้ `create` และ Fail Loud ตามปกติ
  - **3. Bangkok Date Filter & Boundary Contract:**
    - กำหนด Business Timezone สำหรับ Audit Trail เป็น `Asia/Bangkok` (+07:00)
    - ฟรอนต์เอนด์ (`convertAuditDateFilter`) แปลงวันที่จากช่องเลือกแบบ inclusive ให้กลายเป็น Half-Open Interval `[from, to)` ในเวลาไทย: `from` คือ 00:00:00+07:00 และ `to` คือ 00:00:00+07:00 ของวันถัดไป (เช่น วันที่เดียวกันครอบคลุม 24 ชม. เต็มวัน)
    - ฝั่ง Backend ตรวจสอบช่วงวันที่ `from <= to` หากไม่ถูกต้องคืนค่า HTTP 400 Bad Request
    - คิวรีฐานข้อมูลใช้ `createdAt >= fromDate` และ `createdAt < toDate` (`lt: toDate`) ตรงตามหลัก Half-Open Interval
  - **4. Duplicate Declarations Removal & Lint Cleanup:**
    - ลบฟังก์ชันซ้ำซ้อน `deleteCampaign` ใน `campaignRepository.js` และ `getById` ใน `articleModel.js` โดยคงการทำงานเวอร์ชันที่รองรับ `{ tx }` ไว้
    - แทนที่ตัวแปร Token ให้ถูกต้องในชุดทดสอบ และผ่านการตรวจ `npm run lint` 0 errors, 0 warnings
  - **5. Integration Test Isolation & Full Lifecycle Coverage:**
    - กำจัด Fixed +500 days offset ในการสร้าง Test Fixture โดยใช้ `Math.max(Date.now(), maxExistingRoundEnd) + 1h` ป้องกันการชนกับรอบประมูลที่มีอยู่เดิมเมื่อรันซ้ำ
    - ครอบคลุมการทดสอบครบทุก Domain Action: `CAMPAIGN_REJECT`, automatic `CAMPAIGN_END` by `SYSTEM`, `AUCTION_ITEM_REJECT`, `AUCTION_ITEM_SCHEDULE`, `AUCTION_ITEM_CLOSE`, Atomic Rollback on Audit Failure, Zero Audit on Failed Mutation, Concurrent Retry Deduplication via `Promise.all`, และ Marketing-only RBAC
- **Automated Verification Evidence:**
  - **Node.js Environment:** Host Node version `v22.16.0` (รายงานตามสภาพแวดล้อมจริง)
  - **Audit Unit Tests:** `backend/services/product-service/src/features/audit/marketingAuditService.test.js` ผ่าน 6/6 tests 100% (createMany skipDuplicates idempotency, same-day Bangkok parsing, month boundary, invalid range, pagination bounds, secret sanitizer)
  - **Audit PostgreSQL Integration Suite:** `backend/services/product-service/test/marketing-audit.integration.test.js` ผ่าน 11/11 tests (1 parent suite + 10 subtests) 100% บน PostgreSQL จริง (`reloop_product`) ด้วย `$env:REQUIRE_INTEGRATION="1"` ปราศจากการ Skip:
    1. RBAC: Marketing-only authorization, 401 unauth, 403 for Buyer, Seller, Admin, permission bypass prevention, anti-spoofing
    2. Read-only contract: Client write/update/delete endpoints do not exist (404/405)
    3. Campaign lifecycle: Atomic mutations for CREATE, UPDATE, SUBMIT, APPROVE, REJECT, PUBLISH, END
    4. Automatic SYSTEM actions: CAMPAIGN_END and AUCTION_ITEM_CLOSE with deterministic idempotencyKey
    5. Concurrent retry deduplication: Promise.all creates no duplicate audit and zero 25P02 error
    6. Transaction atomicity: Audit failure rolls back business mutation, failed mutation creates no audit
    7. Auction lifecycle: AUCTION_ROUND_CREATE, ITEM_APPROVE, ITEM_REJECT, ITEM_SCHEDULE, ITEM_CANCEL, ITEM_CLOSE
    8. Article lifecycle: CREATE, UPDATE, PUBLISH, ARCHIVE, DELETE audit
    9. API Filtering and date range semantics: [from, to) interval, same-day, month boundary, invalid range, pagination
    10. Sanitizer verification: No secrets present in audit logs or API output
  - **Regression Integration Tests:**
    - Campaign Suite (`campaign.integration.test.js`): ผ่าน 11/11 tests 100%
    - Auction Suite (`auction.integration.test.js`): ผ่าน 11/11 tests 100%
    - Article Suite (`article.integration.test.js`): ผ่าน 1/1 test 100%
  - **Frontend UI & Component Tests:**
    - `frontend/components/marketing/sections/AuditTrailSection.test.js`: ผ่าน 13/13 tests 100% (Render audit log rows, Action badge styles, Filter submissions, Details modal view, Empty state, Error state with retry, Accessible form labels, `convertAuditDateFilter` same-day and multi-day, Date validation error)
    - `frontend/app/marketing/page.test.js`: ผ่าน 6/6 tests 100%
    - รวม Frontend Tests: ผ่าน 19/19 tests 100%
  - **Quality Gates:**
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `npm run format:check`: ผ่าน 100% (All matched files use Prettier code style!)
    - `git diff --check`: ผ่าน 100% (ไม่มีข้อผิดพลาด whitespace)

## 2026-10-08 — Feature: Campaign Date Validation and Budget Tracking with Auto-End (MKT-DEC-023)

- **Problem & Requirements:**
  - เดิมแคมเปญสามารถตั้งวันเวลาเริ่มต้นและสิ้นสุดย้อนหลังในอดีตได้ทั้งตอนสร้าง Draft และแก้ไข Draft ทำให้เกิดแคมเปญที่หมดอายุตั้งแต่ยังไม่ได้เผยแพร่ หรือเผยแพร่แคมเปญที่หมดอายุแล้วได้
  - งบประมาณแคมเปญ (Budget) ไม่มีการนับและควบคุมการใช้งานจริง ทำให้ยอดส่วนลดสะสมเกินเพดานงบประมาณโดยไม่มีการปิดแคมเปญอัตโนมัติ
  - เมื่อแคมเปญสิ้นสุดลง โค้ดส่วนลดยังคงถูก Claim หรือนำไปใช้งานในคำสั่งซื้อได้ และคูปองสถานะ `CLAIMED` ที่ค้างอยู่ไม่ได้ถูกยกเลิกสิทธิ์
  - ข้อความแจ้งเตือนทางฝั่งฟรอนต์เอนด์และแบ็กเอนด์ไม่ชัดเจน ขาดการตรวจสอบ min attribute บนช่องเลือกวันเวลา
- **Implementation Details (MKT-DEC-023):**
  - **1. Server-Side Date Boundary Validation:**
    - ตรวจสอบ `endsAt <= now`: ปฏิเสธด้วยข้อความ "ไม่สามารถกำหนดช่วงเวลาที่สิ้นสุดไปแล้วได้ วันเวลาสิ้นสุดต้องอยู่ในอนาคต"
    - ตรวจสอบ `startsAt < now - 60s`: ปฏิเสธด้วยข้อความ "ไม่สามารถกำหนดวันเวลาเริ่มต้นย้อนหลังในอดีตได้" (อนุญาต clock skew เล็กน้อย 60 วินาที)
    - ตรวจสอบ `endsAt <= startsAt`: ปฏิเสธด้วยข้อความ "วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น"
    - ใน `updateDraft`: ตรวจสอบการเปลี่ยนวันเวลารวมถึงค่าเดิมและค่าใหม่ โดยตรวจ `endsAt <= now` ก่อน `endsAt <= startsAt` เพื่อแจ้งเตือนการหมดอายุในอดีตอย่างถูกต้อง
    - ใน `publishCampaign`: ปฏิเสธแคมเปญที่ `endsAt <= now` ด้วยข้อความ "ไม่สามารถเผยแพร่แคมเปญได้เนื่องจากแคมเปญหมดอายุแล้ว" และปฏิเสธหากงบประมาณเต็มแล้ว หาก `startsAt <= now < endsAt` อนุญาตให้แคมเปญมีผลใช้งานได้ทันทีตาม Workflow ที่ Reviewer ยืนยัน (`draft → pending_approval → approved → published → ended/rejected`) โดยไม่เพิ่มสถานะ Scheduled หรือ Live
  - **2. Budget Tracking from Outbox & Auto-End after Completed Attribution Processing:**
    - เพิ่มคอลัมน์ `spent_budget` (`spentBudget Int @default(0)`) ใน Prisma Schema สำหรับโมเดล `Campaign`
    - นิยาม Budget: งบประมาณถูกนับเมื่อ Product Service ประมวลผล completed attribution event (`order.completed.v1`) จาก Transactional Outbox ของ Order Service (ขอบเขตความเป็นจริง: เป็นการ auto-end after completed attribution processing ไม่ใช่ strict real-time hard cap หรือป้องกันยอดเกินงบ 100% เพราะคำสั่งซื้อสุดท้ายอาจดันให้ยอดรวม `spentBudget` เกิน `budget` ได้เล็กน้อยก่อนปิดแคมเปญ)
    - ใน `recordOrderCompletedEvent`: ดำเนินการภายใน Database Transaction เดียวกันอย่างเป็น Atomic:
      1. ตรวจสอบ Idempotency ของ Attribution Event ผ่าน Unique Constraint (ไม่นับงบซ้ำเมื่อเกิด Event Retry)
      2. บันทึก Attribution และเพิ่มยอด `spentBudget` ผ่าน `{ increment: discountAmount }`
      3. ตรวจสอบเงื่อนไขเพดานงบประมาณ: หาก `spentBudget >= budget` สั่ง auto-end after completed attribution processing เปลี่ยนสถานะ Campaign เป็น `ended` ทันที
      4. ยกเลิกสิทธิ์ Voucher ค้างใช้: ปรับสถานะ Voucher ที่เป็น `CLAIMED` ทั้งหมดของแคมเปญให้กลายเป็น `EXPIRED`
      5. บันทึก SYSTEM Audit Log สำหรับการปิดแคมเปญอัตโนมัติ (`action: "CAMPAIGN_END"`, `metadata: { reason: "BUDGET_REACHED" }`) พร้อม Deterministic `idempotencyKey` เพื่อความปลอดภัย
    - ป้องกันการใช้งานหลัง Budget เต็มหรือแคมเปญ Ended: ปฏิเสธ `claimVoucher` (409), `getApplicableVouchers` (คืน []), `validateDiscount` (400) และ `quoteAndHold` (400) ทันที
  - **3. Frontend Date & Budget Experience:**
    - เพิ่ม `min` attribute บนช่องระบุ `startsAt` (เวลาปัจจุบัน) และ `endsAt` (เวลาเริ่มต้นหรือเวลาปัจจุบัน)
    - เพิ่ม Accessible labels (`aria-label="วันเวลาเริ่มต้น"`, `aria-label="วันเวลาสิ้นสุด"`)
    - Client-side validation ก่อนส่งข้อมูล พร้อมแสดง Error Alert ภาษาไทยที่ชัดเจน
    - แสดงสถานะการใช้งบประมาณในแดชบอร์ดแคมเปญ: "ใช้แล้ว ฿{spentBudget} / ฿{budget}" พร้อม Progress Bar แสดงสัดส่วนการใช้งบ
- **Automated Verification Evidence:**
  - **Campaign Validation & Budget Unit Tests:** `node --test backend/services/product-service/test/campaignValidation.test.js` ผ่าน 23/23 tests 100%
  - **Attribution & Budget Metrics Tests:** `node --test backend/services/product-service/test/campaignMetrics.test.js` ผ่าน 14/14 tests 100% (รวม idempotency, retry deduplication, budget exceeded threshold, atomic counter)
  - **PostgreSQL Integration Tests (`REQUIRE_INTEGRATION=1`):**
    - `campaign-budget.integration.test.js`: ผ่าน 6/6 tests (1 suite + 5 subtests) 100% (0 skips)
    - `campaign.integration.test.js`: ผ่าน 11/11 tests 100% (0 skips)
    - `campaign-attribution.integration.test.js` (product-service): ผ่าน 13/13 tests 100% (0 skips)
    - `campaign-attribution.integration.test.js` (order-service): ผ่าน 7/7 tests 100% (0 skips)
  - **Auction Regression Tests:**
    - `auctionService.test.js`: ผ่าน 53/53 tests 100%
    - `AuctionScheduleSection.test.js`: ผ่าน 8/8 tests 100%
  - **Frontend UI Tests:**
    - `frontend/components/marketing/sections/CampaignsSection.test.js`: ผ่าน 16/16 tests 100% (รวม date min attributes, client-side validation alerts, budget progress rendering)
  - **Environment & Quality Gates:**
    - Node.js Runtime: `v22.16.0` (Host)
    - `npm run lint`: ผ่าน 100% (0 errors, 0 warnings)
    - `git diff --check`: ผ่าน 100%
  - **Schema/ER Status:** เพิ่มคอลัมน์ `spent_budget` ในตาราง `campaigns` เรียบร้อยแล้ว แต่ **ER Diagram update pending** (รออัปเดตไฟล์ภาพ/เอกสารสถาปัตยกรรมระดับภาพรวม `docs/erdatabase.png` / `docs/S2G5_RE-LOOP_ISE.md`) ห้ามถือว่าปิดเอกสารครบ 100% จนกว่าจะอัปเดตแผนภาพ ER
