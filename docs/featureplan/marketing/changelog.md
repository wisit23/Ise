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
  - เพิ่มกล่องข้อความแจ้งเตือนสีอำพันในหน้ารายละเอียดการประมูล: *"⏱️ หากมีผู้เสนอราคาใน 5 นาทีสุดท้าย ระบบจะต่อเวลาออกไปอีก 5 นาทีอัตโนมัติ"*
  - เนื่องจากหน้าเว็บมี polling ทุก 4 วินาทีอยู่แล้ว เมื่อเวลาถูกขยาย ผู้ใช้งานทุกคนในหน้านั้นจะเห็นเวลาปิดใหม่ที่ถูกอัปเดตทันที
- **Testing:**
## 2026-09-05 — UX Enhancement: Auto-Fill Minimum Next Bid on Buyer Auction Page

- **Requirement:** ในหน้ารายละเอียดการประมูลของผู้ซื้อ (`/auctions/:id`) ให้ช่องใส่ราคาประมูลกรอกราคาขั้นต่ำที่ถูกต้อง (Min Next Bid) ให้อัตโนมัติล่วงหน้า โดยที่ผู้ซื้อยังสามารถแก้ไขหรือเปลี่ยนเป็นตัวเลขที่ต้องการได้อย่างอิสระ
- **Implementation (`frontend/app/auctions/[id]/page.js`):**
  - เพิ่ม `useEffect` คอยคำนวณ `minNext` (`highest ? highest.amount + bidIncrement : startingPrice`) และใส่ค่าเริ่มต้นลงใน State `amount` ทันทีเมื่อเปิดหน้า
  - หากมีผู้ประมูลรายอื่นเคาะราคาตัดหน้าขณะเปิดหน้าเว็บอยู่ (`amount < minNext`) ระบบจะอัปเดตราคาในช่องให้เป็นราคาขั้นต่ำใหม่อัตโนมัติ ป้องกันการส่งราคาที่ไม่ผ่านเกณฑ์
  - ปรับปรุง UI ให้แสดงป้ายแจ้งราคาขั้นต่ำถัดไปอย่างเด่นชัด และมีข้อความกำกับ *"ใส่ราคาขั้นต่ำให้อัตโนมัติ สามารถพิมพ์เปลี่ยนเป็นจำนวนเงินที่ต้องการได้"*

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

- **Problem:** เมื่อการประมูลสิ้นสุดลง ระบบสร้างคำสั่งซื้อ (`Order`) ให้ผู้ชนะประมูลสถานะ `pending_payment` และล็อกสินค้าเป็น `reserved` แต่เมื่อผู้ชนะเปิดดูหน้ารายละเอียดสินค้า (`/products/:id`) ปุ่มกลับแสดงเป็นสีเทา *"สินค้าไม่พร้อมขาย"* (เนื่องจากสินค้าถูกล็อกไม่ให้ผู้ซื้อทั่วไปซื้อ) ทำให้ผู้ชนะสับสนว่าต้องไปชำระเงินที่ไหน
- **Fix & Enhancements:**
  - ใน `frontend/app/products/[id]/page.js`: ตรวจสอบว่าผู้ใช้งานปัจจุบันมีคำสั่งซื้อรอชำระเงิน (`myPendingOrder`) ของสินค้านี้อยู่หรือไม่ หากมี:
    - แสดงกล่องข้อความเด่นชัดสีเขียว: *"🎉 คุณเป็นผู้ชนะการประมูลสินค้านี้! รายการนี้ถูกล็อกไว้รอให้คุณชำระเงิน"*
    - เปลี่ยนปุ่มสีเทาเดิม ให้กลายเป็นปุ่มกดชำระเงินสีเขียว: *"💳 ไปชำระเงินที่ตะกร้าสินค้า (฿...)"* ซึ่งนำทางไปยัง `/cart` ได้ทันที
  - ใน `frontend/app/auctions/[id]/page.js`: เมื่อการประมูลปิดลง หากผู้ใช้งานที่เปิดดูอยู่คือผู้ชนะการประมูล (`isWinner`):
    - แสดงกล่องข้อความเฉลิมฉลอง: *"🎉 ยินดีด้วย! คุณเป็นผู้ชนะการประมูลสินค้านี้"*
    - แสดงปุ่มนำทางตรง: *"💳 ไปชำระเงินที่ตะกร้าสินค้า"*

## 2026-09-05 — Bug Fix: Auction Winner Order Missing from Cart & Orders List

- **Problem:** ผู้ชนะประมูลพบว่าเมื่อเข้าสู่หน้าตะกร้า (`/cart`) ระบบกลับแสดงเป็น *"ตะกร้าว่างเปล่า"* และไม่แสดงรายการสินค้าที่ชนะประมูลให้ชำระเงิน
  - **Root Cause 1 (Backend Query Filter):** ใน `backend/services/order-service/src/models/orderModel.js` ฟังก์ชัน `listByBuyer` เมื่อกรองคำสั่งซื้อสถานะ `pending_payment` มีการใส่เงื่อนไข SQL `WHERE reservation_expires_at > NOW()` แต่สำหรับคำสั่งซื้อที่สร้างขึ้นจากการชนะประมูล (`createFromAuction`) ฟิลด์ `reservation_expires_at` จะเป็น `NULL` ทำให้เงื่อนไขใน PostgreSQL ประเมินค่าเป็น `UNKNOWN/FALSE` ส่งผลให้ API `GET /api/orders/mine?status=pending_payment` คัดทิ้งคำสั่งซื้อประมูลทั้งหมด ไม่ส่งกลับไปยังหน้าตะกร้า
  - **Root Cause 2 (Frontend Reservation Timer):** ใน `frontend/app/cart/page.js` ฟังก์ชัน `reservationDeadline` มีการ fallback ไปที่ `createdAt + 10 นาที` สำหรับคำสั่งซื้อที่ไม่มี `reservationExpiresAt` ทำให้คำสั่งซื้อที่ชนะประมูลมาเกิน 10 นาทีถูกฟรอนต์เอนด์กรองว่าเป็นคำสั่งซื้อที่หมดเวลาจองและซ่อนออกจากหน้าตะกร้า
- **Fix & Enhancements:**
  - **Backend (`orderModel.js`):** ปรับเงื่อนไขใน `listByBuyer` ให้ครอบคลุมคำสั่งซื้อที่มาจากการประมูล (`auctionId != null`) หรือคำสั่งซื้อที่ไม่มีการกำหนดวันหมดอายุจองระยะสั้น (`reservationExpiresAt: null`) ร่วมกับเงื่อนไข `reservationExpiresAt > new Date()` เดิม
  - **Frontend (`cart/page.js`):**
    - ขยายระยะเวลาชำระเงินของสินค้าประมูลเป็น 24 ชั่วโมงนับจากเวลาสิ้นสุดการประมูล (`createdAt + 24 ชั่วโมง`) เพื่อให้ผู้ชนะมีเวลาในการชำระเงินอย่างเพียงพอ
    - แสดงป้ายกำกับพิเศษ *"🔨 ชนะการประมูล · รอชำระเงิน"* พร้อมเวลาถอยหลัง 24 ชั่วโมง
    - ปิดการแสดงปุ่ม *"ยกเลิก"* สำหรับสินค้าประมูล เพื่อป้องกันผู้ชนะประมูลกดยกเลิกสิทธิ์โดยไม่ตั้งใจ
  - **Frontend (`orders/page.js`):**
    - ในหน้าคำสั่งซื้อของฉัน (`/orders`) แสดงสถานะของสินค้าประมูลเป็น *"ชนะประมูล · รอชำระเงิน"*
    - เพิ่มปุ่มลัด *"💳 ไปชำระเงินที่ตะกร้า"* ให้ผู้ซื้อสามารถกดไปชำระเงินได้ทันทีจากหน้ารายการคำสั่งซื้อ
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
