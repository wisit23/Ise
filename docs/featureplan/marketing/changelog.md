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
