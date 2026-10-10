# Marketing Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## MKT-DEC-001 — Vertical Marketing ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Marketing Owner รับผิดชอบ `UR-08`–`UR-16` แบบ vertical ตั้งแต่ UI, API, Campaign rules, PostgreSQL tests และเอกสาร
- Reason: ทำให้ campaign lifecycle และผลลัพธ์มี Owner เดียว
- Consequence: Product, Order และ Executive contracts ยังต้อง review ร่วมกับ Seller, Buyer และ Executive

## MKT-DEC-002 — Marketing owns Campaign data

- Date: 2026-08-10
- Status: Accepted
- Decision: Marketing/Campaign เป็น provider ของ campaign lifecycle และ publish state
- Reason: ป้องกัน Buyer หรือ Executive เปลี่ยน Campaign state ข้าม ownership
- Consequence: Consumer ใช้ API/event contract และห้ามอ่าน Campaign database โดยตรง

## MKT-DEC-003 — Attribution uses provider contracts

- Date: 2026-08-10
- Status: Accepted
- Decision: Conversion/attribution อ่าน Product และ completed Order ผ่าน provider endpoint/event ไม่ query database ของ service อื่น
- Reason: รักษา service ownership และทำให้ metric trace กลับไปยัง source ได้
- Consequence: ต้องมี contract test, idempotent event handling และ unavailable state ที่ชัดเจน

## MKT-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Security/consent/abuse hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้

## MKT-DEC-005 — `UR-11` ownership across pulled source

- Date: 2026-08-10
- Status: Needs decision
- Decision: คง Marketing เป็น requirement owner ของ `UR-11`, Seller/Product เป็น provider และ Buyer เป็น consumer จนกว่า Gate 0 จะยืนยัน contract
- Reason: โค้ดที่ pull มาแบ่งอยู่ใน Product service, seller upload UI และ public Buyer-facing Swipe UI แต่ยังไม่มี choose behavior
- Consequence: ห้าม Feature ใดอ้าง `UR-11` Done จากการมี feed อย่างเดียว และการแก้ contract ต้อง review ร่วมสาม Owner

## MKT-DEC-006 — Swipe "choose" is a bookmark, not a bid

- Date: 2026-08-25
- Status: Accepted
- Decision: `SwipeChoice` (the persisted `UR-11` choose action) records buyer interest in a `ProductVideo` card only; it has no auction relationship and does not place a bid
- Reason: Product owner requested the two stay decoupled — a buyer should be able to bookmark a card with no open auction, and bidding requires its own amount/idempotency contract that a swipe gesture can't carry
- Consequence: `MKT-005` auction bidding is a separate authenticated `POST /api/products/auctions/:id/bids` call; the Buyer swipe UI's choose button never calls it directly

## MKT-DEC-007 — Auction close auto-creates the winner's Order

- Date: 2026-08-25
- Status: Accepted
- Decision: When an auction transitions `open -> closed` with a winning bid, product-service calls order-service's internal `POST /internal/from-auction` to create the Order immediately, instead of requiring the winner to manually check out
- Reason: Product owner confirmed automatic order creation over a manual "claim your win" step
- Consequence: The created Order still goes through the existing pay()/status flow for payment; order-service remains the only writer of Order state, product-service only supplies the initial fields via the internal contract; product status flips to `reserved` the same way a normal "buy now" checkout does

## MKT-DEC-008 — Auction products use status 'auction' to isolate from general store and feeds

- Date: 2026-09-05
- Status: Accepted
- Decision: When a product is submitted for auction (or created via `/seller/auctions`), its status is set to `auction` instead of remaining `available`. If the auction is rejected, cancelled, or closed with no winning bids, its status reverts to `available`. While in `auction`, editing and deletion are blocked, and it cannot be purchased through regular cart/checkout.
- Reason: Solves the bug where auction products leaked into the general product feed (`/feed`), search (`/search`), and seller's storefront (`/store/:sellerId`). Auction items must only be browsed and bid on via `/auctions`.
- Consequence: Existing catalog endpoints filter `status = 'available'` and therefore automatically exclude auction items. Product detail page `/products/:id` displays an informational banner directing users to the auction page with regular buy actions disabled.

## MKT-DEC-009 — Auction Rounds and Marketing-owned Approval

- Date: 2026-09-05
- Status: Accepted
- Decision:
  1. เพิ่ม Entity `AuctionRound` เพื่อให้ทีม Marketing เป็นผู้กำหนดรอบการประมูล โดยระบุทั้ง Submission Window (`submissionStartsAt` ถึง `submissionEndsAt`) และ Auction Window (`auctionStartsAt` ถึง `auctionEndsAt`) ตั้งแต่เริ่มสร้างรอบ
  2. กำหนดให้ Seller สามารถส่งสินค้าเข้าประมูลได้เฉพาะเมื่อมีรอบที่กำลังเปิดรับสมัครอยู่เท่านั้น (`submissionStartsAt <= now <= submissionEndsAt`) หากไม่มีรอบหรืออยู่นอกเวลา ระบบจะล็อกทั้งฝั่ง UI และ Backend API
  3. โอนสิทธิ์การอนุมัติ (`approve`) และปฏิเสธ (`reject`) สินค้าประมูลให้เป็นของทีม Marketing โดยตรง เมื่อ Marketing กดอนุมัติ สินค้าจะได้รับวันเวลาประมูลตามรอบนั้นโดยอัตโนมัติ และเปลี่ยนสถานะเป็น `scheduled` พร้อมเข้าสู่การเปิดเคาะราคาตามรอบ
- Reason: ตอบสนองต่อการเปลี่ยนแปลง Requirement จากเดิมที่ให้ผู้ขายส่งสินค้าเมื่อไหร่ก็ได้ตามใจชอบ และต้องรอ Admin อนุมัติ ปรับเป็นให้ Marketing เป็นผู้คุมรอบการจัดอีเวนต์ประมูลและมีอำนาจคัดเลือกสินค้าเข้าประมูลแบบเบ็ดเสร็จ
- Consequence: Schema ใน `reloop_product` เพิ่มตาราง `auction_rounds` และฟิลด์ `round_id` ใน `auction_items`; ในหน้า `/seller/auctions` เพิ่มการ์ดแสดงสถานะรอบและเดดไลน์; ในหน้า `/marketing` เพิ่มแผงจัดการรอบประมูลและปุ่มอนุมัติ/ปฏิเสธสินค้า

## MKT-DEC-010 — Anti-Sniping Soft Close (5-Minute Overtime Extension)

- Date: 2026-09-05
- Status: Accepted
- Decision: เปลี่ยนกลไกการปิดประมูลจากเดิมที่เป็นแบบตัดจบเป๊ะตามเวลา (`scheduledEndAt` Hard Close) เป็นแบบต่อเวลาอัตโนมัติ (Soft Close): หากมีผู้ใช้งานเคาะราคา (Bid) เข้ามาในช่วง 5 นาทีสุดท้ายก่อนเวลาปิดประมูล (`now >= scheduledEndAt - 5m`) ระบบจะทำการเลื่อนขยายเวลาปิดประมูลออกไปอีก 5 นาที (`scheduledEndAt = scheduledEndAt + 5m`) และอัปเดตงานคิวปิดประมูลใน BullMQ ใหม่ทันที โดยสามารถต่อเวลาทบต่อไปได้เรื่อยๆ แบบไม่จำกัดจำนวนครั้ง หากยังมีคนเคาะราคาแข่งใน 5 นาทีสุดท้าย
- Reason: ป้องกันปัญหา Auction Sniping (การแอบยิงราคาในวินาทีสุดท้ายเพื่อตัดหน้าผู้ซื้อคนอื่น) เพิ่มการแข่งขันด้านราคาและเพิ่มโอกาสให้ผู้ขายได้มูลค่าสินค้าสูงสุดตามกลไกตลาด
- Consequence: ใน `auctionService.placeBid` เพิ่ม logic ตรวจจับช่วง 5 นาทีสุดท้ายและเลื่อนเวลา `scheduledEndAt` พร้อมเรียก `auctionCloseQueue.scheduleClose` ซ้ำ; ในหน้าแสดงรายละเอียดสินค้าประมูล (`/auctions/:id`) เพิ่มข้อความแจ้งเตือนกติกานี้แก่ผู้เข้าร่วมประมูล

## MKT-DEC-011 — Knowledge Base & Educational Articles System (ST-MKT-05 / UR-14 / FR-5.2.3)

- Date: 2026-09-06
- Status: Accepted
- Decision:
  1. **สิทธิ์การจัดการบทความ (Marketing Ownership):** ฝ่ายการตลาด (`MARKETING` / `ADMIN`) เป็นผู้สร้าง แก้ไข เผยแพร่ (`published`) เก็บเป็นฉบับร่าง (`draft`) หรือเก็บถาวร (`archived`) บทความให้ความรู้ โดยมีแท็บ "จัดการบทความ" ในแดชบอร์ด `/marketing` พร้อมการ์ดสรุป KPI (บทความทั้งหมด, เผยแพร่แล้ว, ฉบับร่าง)
  2. **ช่องทางการเข้าถึงของผู้ใช้งานทั่วไป (Public Discovery):** เพิ่มเมนู "บทความ" บนแถบ Navigation Bar ด้านบนของเว็บไซต์ เพื่อให้ผู้ซื้อและผู้เข้าชมทุกคนเข้าถึงศูนย์ความรู้ second-hand fashion, การดูแลรักษาเสื้อผ้า (Care), สไตล์และการมิกซ์แอนด์แมตช์ (Styling), และความยั่งยืน (Sustainability) ได้ทันทีที่เส้นทาง `/articles` และเปิดอ่านรายบทความที่ `/articles/:id`
  3. **อัลกอริทึมการค้นหา (Baseline Search Algorithm):** กำหนดให้ระบบค้นหาบทความใช้อัลกอริทึมตั้งต้นเดียวกันกับระบบค้นหาสินค้า (`pg_trgm` PostgreSQL Trigram Index ร่วมกับ `GREATEST(word_similarity(q, search_text), similarity(q, search_text))` และ Substring Fallback `ILIKE`) ตามมาตรฐานเดิมของโปรเจกต์ก่อนเริ่มงาน เพื่อให้ผลลัพธ์การค้นหาภาษาไทยและคำใกล้เคียงแม่นยำและสอดคล้องกันทั่วทั้งระบบ
- Reason: ตอบสนอง Requirement `ST-MKT-05` / `UR-14` / `FR-5.2.3` ในการสร้างศูนย์ความรู้เพื่อส่งเสริมความยั่งยืนและการใช้งานสินค้ามือสอง โดยคง ownership ไว้ที่ฝ่ายการตลาด และคงอัลกอริทึมการค้นหาของระบบตาม baseline เดิมที่ตกลงกันไว้
- Consequence: เพิ่มโมเดล `Article` ใน `reloop_product` พร้อม Trigger อัปเดต `search_text` อัตโนมัติ, สร้าง API สำหรับ Guest (`GET /api/products/articles`) และสำหรับ Marketing (`/marketing/all`, `POST`, `PUT`, `DELETE`), อนุญาตสิทธิ์ `MARKETING` ในการอัปโหลดภาพปกบทความผ่าน `uploadRoutes.js` และเปิดเส้นทาง Public ใน API Gateway

## MKT-DEC-012 — Auction Winner Order Idempotency and Race Condition Guard

- Date: 2026-09-07
- Status: Accepted
- Decision:
  1. **Order Service Idempotency (`POST /internal/from-auction`):** ก่อนที่จะสร้างเรคอร์ดคำสั่งซื้อ (`Order`) จากการประมูล ให้ตรวจสอบก่อนว่ามีคำสั่งซื้อที่ผูกกับ `auctionId` นั้นอยู่แล้วหรือไม่ (`orderModel.findByAuctionId`) หากพบคำสั่งซื้อเดิม ให้ส่งคืนคำสั่งซื้อเดิมทันที (HTTP 200) ไม่สร้างใหม่
  2. **Database Unique Constraint (`Order.auctionId`):** กำหนด `@unique` ให้กับฟิลด์ `auctionId` ใน Prisma Schema ของ `order-service` เพื่อรับประกันในระดับฐานข้อมูล PostgreSQL ว่าหนึ่งการประมูลจะสามารถสร้างคำสั่งซื้อได้เพียงคำสั่งซื้อเดียวเท่านั้น และดักจับ Prisma Error `P2002` เพื่อคืนคำสั่งซื้อที่มีอยู่เดิมกรณีเกิด Race Condition
  3. **Product Service Close Guard:** ใน `closeAuction` ของ `auctionService.js` ให้ตรวจสอบสถานะการประมูลล่าสุด (`findById`) ซ้ำอีกครั้งก่อนเริ่มประมวลผล หากพบว่าการประมูลถูกปิดไปแล้วโดย Worker หรือ Process อื่น ให้คืนค่าทันที
- Reason: ป้องกันปัญหา Race Condition เมื่อเวลาปิดประมูลมาถึงพร้อมกับการเรียกดูข้อมูล ทำให้ BullMQ Worker และ Lazy advance (`maybeAdvance`) ทำงานพร้อมกันในระดับมิลลิวินาที และส่งผลให้มีการสร้างคำสั่งซื้อรอชำระเงินซ้ำซ้อนกัน 2 รายการในตะกร้าของผู้ซื้อ
- Consequence: รับประกันความถูกต้อง 100% ว่าผู้ชนะประมูลจะมีรายการรอชำระเงินในตะกร้าเพียง 1 รายการเสมอ แม้จะมีการเรียกปิดประมูลพร้อมกันหลาย Process

## MKT-DEC-013 — Campaign Lifecycle State Machine, Voucher Wallet & Smart Eligibility Filtering (MKT-001 / UR-15 / UR-16 / WF-11)

- Date: 2026-09-12
- Status: Accepted
- Decision:
  1. **สถาปัตยกรรมบริการและฐานข้อมูล (Domain Placement):** ฟีเจอร์ Campaign และ Voucher Wallet ทั้งหมดถูกจัดวางไว้ภายในโมดูล `backend/services/product-service/src/features/campaigns/` และใช้ฐานข้อมูล `reloop_product` ไม่มีการสร้างไมโครเซอร์วิสคอนเทนเนอร์ใหม่ เพื่อลดภาระการดูแลระบบและสอดคล้องกับ ADR-001
  2. **วงจรชีวิตสถานะแคมเปญ (State Machine):** แคมเปญเริ่มต้นจาก `draft` -> `pending_approval` -> `approved` -> `published` -> `ended` (หรือ `rejected` จาก pending_approval) โดยระบบป้องกันการเปลี่ยนสถานะข้ามขั้น (Invalid State Transition Guard) และอนุญาตให้แก้ไขฟิลด์ข้อมูลได้เฉพาะในสถานะ `draft` เท่านั้น
  3. **นโยบายการอนุมัติเพื่อการประเมิน (Option 2 — Self-Approval with Audit Traceability):** ผู้ใช้งานบทบาท `MARKETING` หรือ `ADMIN` สามารถอนุมัติแคมเปญได้ทันที (รวมถึงแคมเปญที่ตนเองสร้าง เพื่อความสะดวกรวดเร็วในการทดสอบและตรวจงาน) โดยระบบจะบันทึก `approvedById` และ `approvedAt` เป็นหลักฐาน Audit Log ไว้ในตาราง `campaigns` ทุกครั้ง
  4. **ระบบกระเป๋าคูปองและการจำกัดสิทธิ์ (Voucher Wallet & Claim Constraint):** ผู้ซื้อสามารถกดเก็บคูปองที่เผยแพร่อยู่เข้ากระเป๋าตนเอง (`POST /campaigns/:id/claim`) โดยมีข้อจำกัดระดับฐานข้อมูล `@@unique([userId, campaignId])` รับประกันว่า 1 บัญชีผู้ใช้จะเก็บคูปองเดิมได้เพียง 1 ครั้งเท่านั้น
  5. **ระบบคัดกรองคูปองอัจฉริยะ (Smart Compatibility Filtering - `POST /campaigns/applicable`):** เมื่อคำนวณราคาที่ขั้นตอนชำระเงิน ระบบจะคัดกรองเฉพาะคูปองในกระเป๋าของผู้ซื้อที่: สถานะแคมเปญเป็น `published`, วันเวลาอยู่ในช่วงที่กำหนด, ยอดซื้อถึงเกณฑ์ขั้นต่ำ (`minOrderPrice`), และตรงตามหมวดหมู่สินค้า (`applicableCategory`) พร้อมคำนวณส่วนลดโดยประมาณ (`estimatedDiscount`) และเรียงลำดับจากคูปองที่ลดราคาได้มากที่สุดขึ้นก่อนอัตโนมัติ
- Reason: ตอบโจทย์ข้อกำหนด `MKT-001`, `UR-15`, `UR-16`, และ `WF-11` อย่างสมบูรณ์ สร้างกลไกส่วนลดที่ปลอดภัยต่อการทุจริต (Fraud-resistant) และมอบประสบการณ์การใช้งานที่สะดวกสบายแก่ผู้ซื้อ
- Consequence: เพิ่มโมเดล `Campaign` และ `UserVoucher` ในฐานข้อมูล `reloop_product`, เพิ่ม API Endpoints สำหรับทั้งฝ่ายการตลาดและผู้ซื้อทั่วไป, ปรับแต่ง API Gateway Whitelist ให้เส้นทางค้นหาแคมเปญที่เปิดใช้งานเป็น Public และมีชุด Integration Test ทดสอบการทำงานครอบคลุม 100%

## MKT-DEC-014 — Complete Admin Role Decoupling in Marketing Domain

- Date: 2026-09-18
- Status: Accepted
- Decision: ปลดสิทธิ์บทบาท `ADMIN` ออกจากโดเมนของฝ่ายการตลาดทั้งหมด ได้แก่:
  1. Campaign Management (`campaignRoutes.js`, `campaignService.js`): บังคับสิทธิ์เฉพาะ `MARKETING`
  2. Auction Management (`auctionService.js`): อนุมัติ/ปฏิเสธ/จัดรอบ/ยกเลิกรอบ เป็นสิทธิ์เฉพาะของ `MARKETING` (ผู้ขายลงสินค้าเป็น `SELLER`)
  3. Article Management (`articleRoutes.js`, `articleController.js`): บังคับสิทธิ์เฉพาะ `MARKETING`
  4. Media Upload (`uploadRoutes.js`): อนุญาตเฉพาะ `SELLER` และ `MARKETING` โดยนำ `ADMIN` ออก
  5. Harmonization บน UI: เปลี่ยนข้อความ "รออนุมัติจาก Admin" เป็น "รออนุมัติจาก Marketing" และนำแท็บตกค้าง `auction_approvals` ออกจาก Admin Workspace
- Reason: ขจัดสิทธิ์ Superuser เกินความจำเป็น (Least Privilege Principle) และทำให้ความรับผิดชอบของโดเมนการตลาดขึ้นตรงกับบทบาท `MARKETING` 100% ตามข้อตกลง `ADM-DEC-017`
- Consequence: ผู้ใช้บทบาท `ADMIN` ที่พยายามเรียกใช้คำสั่งจัดการการตลาดจะได้รับ HTTP `403 Forbidden`

## MKT-DEC-015 — Server-Side Voucher Quote-and-Hold with Atomic Concurrency Guard & Public API Closure

- Date: 2026-09-18
- Status: Accepted
- Decision:
  1. **Internal Quote-and-Hold Contract:** เพิ่ม `POST /internal/campaigns/:id/quote-and-hold` รับ `{ userId, orderId, productId }` และให้ Product Service อ่านข้อมูล Product จากฐานข้อมูลของตัวเองเพื่อตรวจสอบ 10 ข้อ ก่อนคำนวณราคาส่วนลดและราคาสุทธิ
  2. **Atomic Concurrency Hold:** ใช้ `prisma.userVoucher.updateMany` ในการจองคูปอง หาก `count === 0` ตอบ `409 Conflict` ทันที
  3. **Closure of Public Lifecycle APIs:** ปิด `POST /campaigns/:id/hold`, `/release`, `/complete` จาก Public Routes ใน `campaignRoutes.js` ให้ใช้งานผ่าน Internal API ระหว่างเซอร์วิสเท่านั้น ส่วน `POST /campaigns/:id/claim` ยังคงเปิดให้ผู้ซื้อกดรับสิทธิ์
  4. **Pre-generated Order ID & Two-Way Compensation:** Order Service สร้าง UUID ของ `orderId` ล่วงหน้า และหากการบันทึก Order ล้มเหลว จะส่งคำขอยกเลิกทั้งการจองคูปองและการจองสินค้ากลับคืนทันที
  5. **ห้ามเพิ่ม `pricing_version` หรือ `pricingVersion`:** เนื่องจากแคมเปญไม่สามารถแก้ไขข้อมูลได้หลังพ้นสถานะ draft จึงไม่จำเป็นต้องมีฟิลด์นี้
- Reason: อุดช่องโหว่การปลอมแปลงราคาจากฝั่ง Client (Price Tampering) และป้องกัน Race Condition เมื่อมีการใช้คูปองพร้อมกัน
- Consequence: การคำนวณราคาสั่งซื้อได้รับการคุ้มครองด้วย Server-Side Source of Truth 100%

## MKT-DEC-016 — Claim Count vs Redemption Count Semantics

- Date: 2026-09-18
- Status: Accepted
- Decision: แยกความหมายของตัวนับในระบบแคมเปญออกเป็นสองมิติ:
  1. `claimedCount`: แสดงจำนวนครั้งที่ผู้ซื้อกดเก็บคูปองเข้าสู่กระเป๋าตนเอง (อ่านจาก `usedCount` ในโมเดล `Campaign`)
  2. `redeemedCount`: แสดงจำนวนคำสั่งซื้อที่ใช้คูปองนี้และชำระเงินจนสำเร็จจริง (นับจาก `UserVoucher` ที่สถานะ `USED` หรือเรคอร์ดใน `campaign_attributions`)
- Reason: ขจัดความสับสนระหว่างการเก็บสิทธิ์ (Voucher Collection) กับการใช้สิทธิ์ซื้อของจริง (Order Completion) ทำให้สามารถคำนวณ Conversion Funnel ได้อย่างถูกต้อง
- Consequence: ใน API responses (`GET /campaigns`, `GET /campaigns/:id`) และตารางเปรียบเทียบใน Dashboard จะแสดงทั้งสองฟิลด์อย่างชัดเจน

## MKT-DEC-017 — Buyer Segmentation Rule Engine & Safe Profile Matching

- Date: 2026-09-18
- Status: Accepted
- Decision:
  1. พัฒนาโมดูล `segmentRule.js` ภายใน Product Service เพื่อใช้ประเมินกฎของแคมเปญเป้าหมาย (`targetSegment`)
  2. กำหนด Whitelist ของฟิลด์ที่อนุญาต (`ALLOWED_FIELDS`): `favoriteCategory`, `preferredSize`, `sizePreference`, `styleTag`, `stylePreference`, `brandPreference`
  3. กำหนด Whitelist ของโอเปอเรเตอร์ที่อนุญาต (`ALLOWED_OPERATORS`): `eq`, `neq`, `in`, `nin`
  4. หากแคมเปญไม่มีการกำหนด `targetSegment` ถือว่าเป็น Universal Campaign ซึ่งตรงกับผู้ซื้อทุกคน
  5. หากแคมเปญมี `targetSegment` แต่ผู้ซื้อยังไม่ได้ระบุโปรไฟล์ หรือเป็น Guest จะไม่แสดงแคมเปญนั้นในรายการ
- Reason: รองรับฟังก์ชันการตลาดแบบเฉพาะเจาะจงกลุ่มเป้าหมาย (Personalized Promotion / Segmentation) โดยยังคงรักษา Data Privacy และไม่เปิดให้รันโค้ดหรือโอเปอเรเตอร์ที่ไม่ปลอดภัย (Anti-Injection)
- Consequence: แคมเปญที่กำหนดกลุ่มเป้าหมายจะถูกคัดกรองอัตโนมัติทั้งในหน้าแสดงคูปองสาธารณะ (`/campaigns/available`) และหน้าเช็คเอาต์ (`/campaigns/applicable`)

## MKT-DEC-018 — Idempotent Attribution Persistence in Product Service via Internal Order Completed Event

- Date: 2026-09-18
- Status: Accepted
- Decision:
  1. Product Service เป็นผู้ถือครองตารางข้อเท็จจริงด้าน Attribution (`campaign_attributions`) โดยมีฟิลด์ `order_id` เป็น Unique Constraint
  2. เมื่อ Order ถูกชำระเงินเสร็จสิ้น Order Service จะยิง Event `order.completed.v1` ผ่าน HTTP Internal Contract (`POST /internal/campaigns/events/order-completed`)
  3. ฝั่ง Product Service ทำการ Ingestion แบบ Idempotent: หากพบว่า `order_id` เคยถูกบันทึกแล้ว จะเพิกเฉยต่ออีเวนต์ซ้ำทันที (Deduplication)
  4. Product Service มี In-memory Storage Fallback อัตโนมัติสำหรับการรันเทสในสภาพแวดล้อมที่ไม่มีฐานข้อมูลจริง
- Reason: สอดคล้องกับหลักการ Data Ownership ที่ Marketing อ่านข้อมูล Aggregate จากตาราง Attribution ของตนเอง โดยไม่ต้องข้ามไป Query หรือ Join กับตาราง `orders` ใน Order Database โดยตรง
- Consequence: ทำให้การคำนวณยอดขายสุทธิและผลตอบแทนของแคมเปญ (ROI) มีความแม่นยำและทนทานต่อ Distributed Network Retries

## MKT-DEC-019 — Marketing Metrics Aggregation & Date Range Boundaries

- Date: 2026-09-18
- Status: Accepted
- Decision:
  1. ฟังก์ชันคำนวณ Metrics (`overview`, `trends`, `compare`, `:id/metrics`) จะต้องตรวจสอบความถูกต้องของช่วงวันที่ (`from <= to`) เสมอ หากส่งค่าวันที่ไม่ถูกต้อง (`from > to` หรือ Invalid ISO String) จะตอบกลับ HTTP `400 Bad Request`
  2. สูตรคำนวณ Conversion Rate คือ `(redeemedCount / claimedCount) * 100` หาก `claimedCount === 0` ให้คืนค่า `0` (ไม่ให้เกิดข้อผิดพลาด Division by Zero)
  3. รายรับสุทธิ (`netRevenue`) คำนวณจาก `grossRevenue - totalDiscount`
  4. ทุก Metrics Endpoint สงวนสิทธิ์เฉพาะบทบาท `MARKETING` เท่านั้น
- Reason: มอบข้อมูลเชิงลึก (Business Insights) ให้ฝ่ายการตลาดนำไปใช้วิเคราะห์ผลตอบแทนและวางแผนโปรโมชันถัดไปได้อย่างน่าเชื่อถือ
- Consequence: Marketing Dashboard (`DashboardSection.js`) มีข้อมูลพร้อมแสดงผลครบทั้งตัวเลขสรุป, กราฟแนวโน้มรายวัน, และตารางเปรียบเทียบ

## MKT-DEC-020 — Auction Round Overlap Protection, Concurrency Serialization & Deterministic Selection

- Date: 2026-09-19
- Status: Partially Superseded by MKT-DEC-025
- Note: ข้อกำหนดเรื่อง Cross-round Overlap Protection และการคืน 409 Conflict ถูกยกเลิกและแทนที่โดย MKT-DEC-025 เพื่อรองรับการเปิดหลายรอบคู่ขนาน ส่วนการตรวจสอบลำดับเวลาภายในรอบเดียว ($S_{\text{sub}} < E_{\text{sub}} \le S_{\text{auc}} < E_{\text{auc}}$) และการคำนวณ Derived Phases 5 สถานะยังคงมีผลบังคับใช้ (เป็น Historical Record — โดย `findConflictingRound`, `withRoundLock`, `findActiveSubmissionRound` และ `findCurrentRound` ถูกลบออกจาก Production Code แล้วใน MKT-DEC-025)
- Decision:
  1. **Strict Half-Open Time Boundaries $[S, E)$:** กำหนดช่วงเวลาของรอบประมูลทั้งหมดเป็น Half-Open Interval $[S, E)$ โดยที่ $S = \text{submissionStartsAt}$ และ $E = \text{auctionEndsAt}$ โดยเงื่อนไข Overlap คือ $S_A < E_B \land S_B < E_A$ และอนุญาต Back-to-back rounds ได้เมื่อ $E_A = S_B$ (ถูกยกเลิกใน MKT-DEC-025: อนุญาตให้สร้างรอบที่ทับซ้อนเวลากันได้ทุกกรณี)
  2. **PostgreSQL Advisory Lock Serialization:** ป้องกัน Concurrency Race Condition ในการตรวจหาและสร้างรอบประมูลที่ซ้อนทับกันด้วย `pg_advisory_xact_lock(1001, 1)` ร่วมกับ Transaction Client `tx` และตอบกลับด้วย HTTP `409 Conflict` (ถูกแทนที่ใน MKT-DEC-025 ด้วย Atomic Round Creation ร่วมกับ Marketing Audit Trail และ `withRoundLock` ถูกลบออกจาก Production Code แล้ว)
  3. **Deterministic Selection (`findCurrentRound`):** เลือกรอบที่ Active ตามเวลาจริง (`now`) ก่อน หากไม่มีให้เลือกรอบถัดไปที่ใกล้มาถึงที่สุด (Upcoming) และหากสิ้นสุดหมดแล้วคืนค่า `null` (เป็น Historical Record — ใน MKT-DEC-025 ฟังก์ชันนี้ถูกลบออกจาก Production Code แล้ว โดยเปลี่ยนเป็นการเลือกรอบแบบ Explicit และ Multi-Round Endpoints แทน)
  4. **Derived Phases:** คำนวณ Derived Phase 5 สถานะตามเวลาจริง: `upcoming`, `submission`, `waiting`, `auction`, `ended`
  5. **Marketing UI History & Alert:** แสดงประวัติรอบทั้งหมด (All-Rounds Table), Phase Badges, การ์ดแสดงรอบปัจจุบัน/ถัดไป บนแดชบอร์ด `/marketing`
- Reason: ขจัดปัญหาการสร้างรอบประมูลทับซ้อนกันและการผูกสินค้าประมูลกับรอบที่สร้างใหม่สุดโดยไม่คำนึงถึงช่วงเวลาจริง
- Consequence: ระบบจัดการรอบประมูลมีความสอดคล้องระดับฐานข้อมูล ทนทานต่อ Concurrency และแสดงผลประวัติรอบทั้งหมดในแดชบอร์ดอย่างถูกต้อง

## MKT-DEC-021 — UR-11 Swipe-to-Choose Hardening, Buyer Authorization, Persistence & Feed Isolation

- Date: 2026-10-04
- Status: Accepted
- Decision:
  1. **SwipeChoice Semantics:** `SwipeChoice` ทำหน้าที่เป็น Buyer bookmark / interest list บนการ์ด `ProductVideo` เท่านั้น ไม่มีความสัมพันธ์กับระบบประมูล (Auction) และไม่ใช่การเคาะราคา (Bid)
  2. **Buyer-only Authorization:** อนุญาตเฉพาะผู้ใช้ที่มีบทบาท `BUYER` (ทั้ง `req.userRole === "BUYER"` และ `req.userRoles.includes("BUYER")`) เท่านั้นในการเรียกใช้งาน `POST /:id/choose`, `DELETE /:id/choose`, และ `POST /:id/unchoose` โดยผู้ใช้บทบาท `SELLER`, `MARKETING`, `ADMIN` และอื่นๆ จะถูกปฏิเสธด้วย HTTP `403 Forbidden` และผู้ที่ยังไม่ได้เข้าสู่ระบบจะถูกปฏิเสธด้วย HTTP `401 Unauthorized` ทั้งในระดับ Route Middleware (`requireBuyerRole`) และ Service Layer (`isBuyer`)
  3. **Optional Authentication on Public Feed:** เส้นทาง `GET /api/products/videos/feed` เปิดให้สาธารณะเข้าชมได้ และรองรับ Optional Authentication:
     - หากไม่มี Bearer token ให้ถือเป็น Guest และส่งคืน `chosen: false` สำหรับทุกรายการ
     - หากมี Bearer token ให้ตรวจสอบผ่าน Trusted Auth Middleware (`requireAuth`) และดึงสถานะ `chosen` เฉพาะของผู้ใช้ปัจจุบันผ่าน Batch Query (Prisma relation include `choices: { where: { userId }, select: { id: true } }`) โดยไม่เกิด N+1 query
     - ป้องกันการรั่วไหลข้ามผู้ใช้ (User Isolation): ผู้ใช้ Buyer B จะไม่เห็นสถานะ chosen ของ Buyer A
  4. **Client-supplied `x-user-*` Anti-Spoofing:** ห้ามเชื่อถือ Header `x-user-*` ที่ไคลเอนต์ภายนอกส่งเข้ามาโดยไม่มี Bearer Token:
     - API Gateway ทำการลบ Header ที่ขึ้นต้นด้วย `x-user-` ทั้งหมดจาก Inbound Request ก่อนส่งต่อไปยัง Downstream Services
     - Product Service ใน `optionalAuth` ไม่ดึงข้อมูลผู้ใช้จาก Header `x-user-*` หากไม่มี `Authorization: Bearer` Token ที่ผ่านการตรวจสอบความถูกต้องแล้ว ทำให้การปลอมแปลง `x-user-id` ไม่สามารถเข้าถึงสถานะ chosen ของผู้ใช้อื่นได้
  5. **Data Privacy & Idempotency:** ตัดความสัมพันธ์ `choices` ออกจาก Response สาธารณะทั้งหมด (`chosen` เป็น Boolean เท่านั้น), การเลือกซ้ำเป็น Idempotent ไม่สร้าง Record ซ้ำซ้อน, และการยกเลิกเลือกรายการที่ไม่ได้เลือกไม่ก่อให้เกิด HTTP 500
  6. **Supersede Resolution:** มตินี้ทำการยืนยันความถูกต้องและแทนที่ (Supersede & Resolve) `MKT-DEC-005` ที่เคยมีสถานะเป็น Needs decision อย่างเป็นทางการ
- Reason: ยกระดับความปลอดภัย ขจัดช่องโหว่ Identity Spoofing และสร้างการรับประกันความสอดคล้องของข้อมูลระดับฐานข้อมูลตามข้อกำหนด UR-11
- Consequence: ผู้ซื้อสามารถบันทึกและซิงค์การ์ดสินค้าที่สนใจข้ามอุปกรณ์ได้อย่างปลอดภัย และระบบมีชุดทดสอบอัตโนมัติครบทั้ง Unit Tests, Frontend Component Tests, และ PostgreSQL Integration Test รองรับ

## MKT-DEC-022 — Marketing Audit Trail Architecture, Atomic Mutation Contracts & SYSTEM Idempotency

- Date: 2026-10-05
- Status: Accepted
- Decision:
  1. **Storage & Service Boundary:** กำหนดให้เก็บ Marketing Audit Log ใน PostgreSQL ของ `product-service` (`reloop_product`) ผ่าน Prisma Model `MarketingAuditLog` (`marketing_audit_logs`) เพื่อรองรับ Atomic Database Transaction เดียวกันกับการเปลี่ยนแปลงสถานะทางธุรกิจ (Business Mutations) ของ Campaign, Auction, และ Article
  2. **Append-Only Contract & Read-Only Exposure (Marketing-only Authorization):**
     - ตาราง `marketing_audit_logs` เป็น Append-Only ห้ามเปิด API ให้ Client สร้าง, แก้ไข (`PUT`/`PATCH`), หรือลบ (`DELETE`) Audit Log โดยตรง
     - เปิดเฉพาะ Read-Only Query Endpoint: `GET /api/products/marketing/audit-logs` (ผ่าน Gateway) และ `GET /marketing/audit-logs` (Direct Service) สงวนสิทธิ์เฉพาะบทบาท `MARKETING` เท่านั้น (`requireAuth` + `requireMarketingAccess`)
     - บทบาท `BUYER`, `SELLER` และ `ADMIN` ต้องได้รับ HTTP `403 Forbidden` ตามหลักการ Least Privilege และ `MKT-DEC-014` (Admin Decoupling)
     - Permission เช่น `analytics:read:marketing` หรือ `audit:read:marketing` ต้องไม่ทำให้บทบาทอื่นที่ไม่ใช่ `MARKETING` สามารถ bypass สิทธิ์เข้ามาดูได้
     - ป้องกัน Anti-Spoofing: ดึง Identity จาก Server-verified Token เท่านั้น ไม่เชื่อถือ Header `x-user-*` ที่ Client ส่งมา
     - รองรับการกรองตาม `action`, `entityType`, `actorId`, `from`, `to` (Half-open interval `[from, to)` ในเวลา `Asia/Bangkok` ตรวจสอบ `from <= to`) และ Pagination Clamping (สูงสุด 100 รายการต่อหน้า, ค่าเริ่มต้น 20)
  3. **Verified Actor Identity & SYSTEM Actor Idempotency in PostgreSQL Transactions:**
     - `actorId` และ `actorRole` ของผู้ใช้ต้องมาจาก Server Verified Token Identity (`req.user.id`, `req.user.role`) เท่านั้น ป้องกันการปลอมแปลงผ่าน Client Header
     - สำหรับ Automatic/Worker Actions (เช่น `autoExpireCampaigns`, `closeAuction`) กำหนดให้ใช้:
       - `actorId: "SYSTEM"`
       - `actorRole: "SYSTEM"`
       - กำหนด `idempotencyKey` แบบ Deterministic (เช่น `CAMPAIGN_END:${id}`, `AUCTION_ITEM_CLOSE:${id}`) เพื่อป้องกันการบันทึก Audit Log ซ้ำซ้อนกรณีเกิด Worker Retry
       - **Transaction-Safe Idempotency via `createMany({ skipDuplicates: true })`:** ใน PostgreSQL การดักจับ Prisma Error `P2002` ภายใน Transaction บล็อก จะทำให้สถานะ Transaction ถูก Abort ทันที (`25P02: current transaction is aborted, commands ignored until end of transaction block`) และไม่สามารถสั่ง `findUnique` ต่อใน Transaction เดิมได้ ดังนั้นการบันทึก Audit ที่มี `idempotencyKey` จึงต้องใช้ `createMany({ data: [{ id: crypto.randomUUID(), ...data }], skipDuplicates: true })` ซึ่งแปลงเป็น SQL `INSERT ... ON CONFLICT DO NOTHING` บน PostgreSQL ทำให้ Transaction ไม่ถูก Abort และสามารถเรียก `findUnique` ดึงเรคอร์ดที่มีอยู่เดิมกลับมาได้อย่างปลอดภัย 100% ส่วน Audit ปกติที่ไม่มี `idempotencyKey` ยังคงใช้ `create` และ Fail Loud ตามปกติ
  4. **Strict Atomic Transactions:**
     - การบันทึก Audit Log ต้องอยู่ใน Database Transaction เดียวกันกับการเปลี่ยนแปลงข้อมูลทางธุรกิจ หาก Audit ล้มเหลว Business Mutation ต้อง Rollback ทั้งหมด; หาก Business Mutation ล้มเหลว จะต้องไม่มี Audit Log ถูกบันทึก
  5. **Secret Sanitization:**
     - ฟังก์ชัน `sanitizeAuditData` ทำการ Redact ฟิลด์ที่ละเอียดอ่อน (`password`, `passwordHash`, `accessToken`, `refreshToken`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, `credential`) แบบ Recursive ทั้งใน Object และ Array, ป้องกัน Circular References, และแปลง `Date` เป็น ISO String ป้องกันข้อมูลหลุดรอดสู่ฐานข้อมูลและ API Response
  6. **UI Integration:**
     - เพิ่มแท็บ "ประวัติการดำเนินงาน" (`key: "audit"`, `label: "ประวัติการดำเนินงาน"`, `icon: "history"`) ในหน้า `/marketing` พร้อมการ์ดตัวกรอง, ตารางแสดงรายการ, Badge แยกการกระทำ, SYSTEM Actor Badge, กล่องข้อความแสดงรายละเอียด (Detail Modal) สำหรับ `previousState`, `newState`, และ `metadata`, พร้อม Loading, Empty, และ Error Retry States
     - Date Filter แปลงวันที่แบบเลือกวันเดียวกัน (Same-day) เป็นช่วงเวลาเต็มวันในเวลาไทย `[00:00:00+07:00, วันถัดไป 00:00:00+07:00)` และตรวจสอบ `from <= to`
- Reason: สร้างระบบตรวจสอบการดำเนินงานของฝ่ายการตลาดที่โปร่งใส ตรวจสอบย้อนกลับได้ มีความสอดคล้องระดับฐานข้อมูล ป้องกันข้อมูลรั่วไหล และทนทานต่อ Retry ภายใต้ Fixed Scope Baseline
- Consequence: Campaign, Auction, และ Article ทุกเหตุการณ์สำคัญถูกบันทึก Audit โดยอัตโนมัติ พร้อมชุดทดสอบอัตโนมัติ Unit Tests (6/6), PostgreSQL Integration Tests (11/11 tests: 1 suite + 10 subtests with `REQUIRE_INTEGRATION=1` without skips), และ Frontend Component Tests (19/19) ครบถ้วน

## MKT-DEC-023 — Campaign Workflow Confirmation, Server-Side Date Bounds & Budget Tracking with Auto-End

- Date: 2026-10-08
- Status: Accepted
- Context:
  - Reviewer ยืนยันการยอมรับ Workflow ปัจจุบันของ Campaign โดยไม่ต้องเพิ่มสถานะย่อยอย่าง Scheduled หรือ Live:
    `draft → pending_approval → approved → published → ended/rejected`
  - ช่วงเวลาการใช้งานของแคมเปญถูกควบคุมโดยตรงผ่าน `startsAt` และ `endsAt`
  - นิยามของงบประมาณ (Budget): งบประมาณถูกนับเมื่อ Product Service ประมวลผล completed attribution event (`order.completed.v1`) ที่ได้รับจาก Transactional Outbox ของ Order Service
  - ขอบเขตและความจริงของระบบ: การควบคุมงบประมาณเป็นการ auto-end after completed attribution processing ไม่ใช่ strict real-time hard cap และไม่ได้รับประกันการป้องกันยอดเกินงบ 100% เนื่องจากคำสั่งซื้อที่ถือสิทธิ์คูปองและชำระเงินสำเร็จตามลำดับเวลาอาจทำให้ออเดอร์สุดท้ายมียอดส่วนลดที่ดันให้ `spentBudget` สูงกว่า `budget` ได้เล็กน้อยก่อนที่แคมเปญจะถูก auto-end
- Decision:
  1. **Workflow Confirmation:** ยืนยัน Workflow เดิม 6 สถานะ (`draft`, `pending_approval`, `approved`, `published`, `ended`, `rejected`) โดยไม่มีสถานะ Scheduled/Live และไม่ขยายขอบเขตไปยัง UR-13
  2. **Server-Side Date Validation:**
     - การสร้างแคมเปญ (Create Draft): ปฏิเสธช่วงเวลาที่สิ้นสุดไปแล้ว (`endsAt <= now`), ปฏิเสธการตั้ง `startsAt` ย้อนหลังในอดีต (`startsAt < now - 60s` อนุญาต clock skew 60 วินาที), และต้องมี `endsAt > startsAt`
     - การแก้ไขแคมเปญ (Update Draft): ตรวจสอบช่วงเวลารวมทั้งค่าใหม่และค่าเดิม ปฏิเสธช่วงเวลาที่สิ้นสุดไปแล้ว และห้ามแก้ `startsAt` ย้อนหลัง
     - การเผยแพร่ (Publish): ปฏิเสธแคมเปญที่ `endsAt` หมดอายุแล้ว หากเผยแพร่หลัง `startsAt` แต่ยังไม่ถึง `endsAt` ให้เริ่มใช้งานได้ทันที (`published`)
     - ข้อความแจ้งเตือนทั้งหมดเป็นภาษาไทยที่อ่านเข้าใจง่าย
  3. **Atomic Budget Tracking & Auto-End after Completed Attribution Processing:**
     - เพิ่มคอลัมน์ `spent_budget` (`spentBudget Int @default(0)`) ในตาราง `campaigns`
     - เมื่อ Product Service ประมวลผล Attribution Event `order.completed.v1` จาก Outbox ให้เพิ่มยอด `spentBudget` แบบ Atomic Increment ด้วยยอด `discountAmount`
     - ตรวจสอบยอดสะสม หาก `spentBudget >= budget` ให้ดำเนินการ auto-end after completed attribution processing โดยเปลี่ยนสถานะ Campaign เป็น `ended` ทันทีภายใน Database Transaction เดียวกัน พร้อมบันทึก `MarketingAuditLog` ดำเนินการโดย `SYSTEM` ระบุ `metadata: { reason: "BUDGET_REACHED" }` และใช้ Deterministic Idempotency Key ป้องกัน Event Retry
     - เมื่อแคมเปญสิ้นสุด (`ended`) ไม่ว่าจะหมดอายุหรือ auto-end หลังประมวลผลงบประมาณ คูปองที่อยู่ในสถานะ `CLAIMED` ที่ยังไม่ได้ใช้จะถูกปรับเป็น `EXPIRED` ทันที
     - แคมเปญที่ `ended` หรือยอด `spentBudget >= budget` จะไม่สามารถ Claim, ไม่แสดงใน Applicable Vouchers, และปฏิเสธ Quote-and-Hold
  4. **Frontend UI & Validation:**
     - ฟอร์มสร้าง/แก้ไขแคมเปญเพิ่มคุณสมบัติ `min` ให้ช่อง `datetime-local` ตามเวลาปัจจุบัน
     - ตรวจสอบความถูกต้องของวันเวลาฝั่ง Frontend พร้อมข้อความเตือนภาษาไทยก่อนส่งข้อมูล
     - แดชบอร์ดแสดงข้อมูลงบประมาณในตารางเป็น `"ใช้แล้ว ฿X / ฿Budget"` พร้อมแถบความคืบหน้า (Budget Progress Bar)
- Reason: ป้องกันการสร้างแคมเปญย้อนหลังที่หมดอายุไปแล้ว ติดตามงบประมาณที่จ่ายจริงเมื่อคำสั่งซื้อสำเร็จ ปิดแคมเปญอัตโนมัติเมื่อถึงเพดานงบ และรับประกันความสอดคล้องของข้อมูลแบบ Transactional และ Idempotent
- Consequence:
  - ระบบโปรโมชันมีความรัดกุม ลดโอกาสการใช้งบประมาณบานปลาย (Financial Leakage) ผ่านการ auto-end after completed attribution processing, มี Audit Trail ตรวจสอบได้
  - ผ่านชุดทดสอบ Unit Tests (37/37), PostgreSQL Integration Tests สำหรับ Budget จริง (`campaign-budget.integration.test.js` 6/6 tests with `REQUIRE_INTEGRATION=1` without skips), PostgreSQL Attribution Integration Tests (12/12 subtests), และ Frontend Component Tests (16/16)
  - **Schema/ER Status:** เพิ่มคอลัมน์ `spent_budget` ใน Prisma Schema และฐานข้อมูล PostgreSQL จริงแล้ว แต่ **ER Diagram update pending** (รออัปเดตไฟล์ภาพ/เอกสารสถาปัตยกรรมระดับภาพรวม `docs/erdatabase.png` / `docs/S2G5_RE-LOOP_ISE.md`) ห้ามถือว่าเอกสารปิดสมบูรณ์ 100% จนกว่าจะอัปเดตแผนภาพ ER

## MKT-DEC-024 — Auction Round Allowed Categories & Atomic Product/AuctionItem Submission Flow

- Date: 2026-10-09
- Status: Accepted (Code Review Resolved)
- Context:
  - ฝ่ายการตลาดต้องการควบคุมประเภทสินค้าที่จะเปิดรับประมูลในแต่ละรอบเพื่อความสอดคล้องกับกลยุทธ์การตลาด โดยสามารถเปิดรับทุกหมวดหมู่หรือเลือกเฉพาะบางหมวดหมู่ได้
  - ผู้ขายต้องการความชัดเจนในการส่งสินค้าเข้าร่วมประมูลว่ารอบเปิดรับหมวดหมู่ใดบ้าง
  - การลงสินค้าใหม่เข้าประมูลต้องมีการตรวจสอบรอบ หมวดหมู่ สภาพสินค้า ราคา และสิทธิ์ KYC ก่อนสร้างสินค้า
  - กระบวนการสร้าง `Product` และ `AuctionItem` ต้องเกิดขึ้นแบบ Atomic ภายใน PostgreSQL Transaction เดียวกันเพื่อป้องกันสินค้าสถานะ auction ค้างในฐานข้อมูลหากขั้นตอนล้มเหลว
  - ต้องรักษา Flow สำหรับการนำสินค้าเดิม (`productId`) มาลงประมูลเพื่อความเข้ากันได้ย้อนหลัง (Backward Compatibility)
  - ต้องป้องกันกรณีรอบประมูลหมดเวลาระหว่างขั้นตอนการตรวจสอบ (Pre-validation) กับการเปิด Transaction ด้วยการตรวจสอบรอบซ้ำภายใน Database Transaction (`tx`)
- Decision:
  1. **Schema & Category Storage:**
     - เพิ่ม `categories String[] @default([])` ในโมเดล `AuctionRound` (`reloop_product`)
     - กำหนดให้ `categories: []` หมายถึง "รับทุกหมวดหมู่" เพื่อคง Backward Compatibility กับรอบประมูลเดิมทั้งหมด
     - รายการหมวดหมู่โหลดแบบ Dynamic จากตาราง `Category` เดิมของ Product Service (`GET /api/products/categories`) ห้าม Hardcode และห้ามสร้างตาราง Category ซ้ำ
     - Backend ตรวจสอบหมวดหมู่ที่ระบุว่ามีอยู่ในระบบจริงก่อนบันทึก
  2. **Pre-creation Validation & Shared Validation Service (Flow B):**
     - ย้ายฟังก์ชันการตรวจสอบความถูกต้องของสินค้า (`requireSellerRole`, `requireVerifiedSeller`, `validateCreateRequest`, `requireValidMediaCount`, `requireKnownCondition`) ไปยังโมดูลกลาง `src/services/productValidation.js` เพื่อให้ทั้ง `productController` และ `auctionService` เรียกใช้ร่วมกันโดยไม่มี Dependency ย้อนทิศทาง (Controller -> Service -> Repository)
     - Backend ตรวจสอบสิทธิ์ผู้ขายและ KYC (`requireVerifiedSeller`), ตรวจสอบรอบที่เปิดรับ, ตรวจสอบหมวดหมู่ว่ามีอยู่จริงและรอบเปิดรับ (`isCategoryAllowedInRound`), ตรวจสอบราคาเริ่มต้นและราคาเสนอเพิ่มขั้นต่ำ, ตรวจสอบข้อมูลสินค้า สภาพสินค้า (`requireKnownCondition`), และจำนวนรูปภาพ 4-8 รูป (`requireValidMediaCount`)
     - หากไม่ผ่านเงื่อนไข ปฏิเสธทันทีโดยไม่สร้าง Product และไม่สร้าง AuctionItem
  3. **Atomic Database Transaction & In-Transaction Round Re-check:**
     - สร้าง `Product` (`status: "auction"`) และ `AuctionItem` (`status: "pending_approval"`) ภายใน PostgreSQL `$transaction` เดียวกัน
     - ก่อนดำเนินการเขียนข้อมูลใน Transaction ให้โหลด `AuctionRound` ซ้ำผ่าน Transaction Client (`tx`) เพื่อตรวจสอบว่ารอบยังเปิดรับสินค้าอยู่จริงในขณะนั้น และยังเปิดรับหมวดหมู่นั้น
     - หากรอบหมดเวลาหรือเงื่อนไขเปลี่ยน ให้ Rollback Transaction ทันที ไม่สร้าง Product และไม่สร้าง AuctionItem
  4. **Existing Product Flow Preservation (Flow A):**
     - รักษา Endpoint สำหรับ `productId` เดิม
     - ตรวจสอบสิทธิ์และสถานะสินค้า (`available`/`auction`)
     - ตรวจสอบ `product.category` จากฐานข้อมูลจริงเทียบกับหมวดหมู่ที่รอบเปิดรับ โดยเพิกเฉยต่อ category ที่ Client ส่งมา
     - ตรวจสอบรอบซ้ำภายใน Transaction เช่นเดียวกัน
  5. **Test Fixture Isolation & Clean Cascade Deletion:**
     - Integration Tests จัดการเฉพาะ Fixture ที่ Test Suite ตัวเองสร้างขึ้น (`createdBidIds`, `createdAuctionIds`, `createdProductIds`, `createdRoundIds`) โดยไม่ใช้ `updateMany` กับรอบของระบบภายนอก
     - ตรวจสอบความสะอาดหลังการทดสอบ (Cleanup Verification Assertions) ให้คงเหลือ 0 รายการ
- Reason: ยกระดับความถูกต้องของข้อมูลรอบประมูล ป้องกันข้อผิดพลาดของข้อมูลขยะ (Orphaned Products) และเพิ่มประสิทธิภาพในการควบคุมหมวดหมู่สินค้าประมูลของฝ่ายการตลาด
- Consequence:
  - ฝ่ายการตลาดและผู้ขายเห็นหมวดหมู่ที่เปิดรับอย่างชัดเจน
  - ข้อมูล `Product` และ `AuctionItem` มีความสอดคล้องกันแบบ Atomic Transaction 100%
  - **Environment:** Node.js `v22.16.0` บนสภาพแวดล้อมจริง
  - **Evidence:** ผ่านชุดทดสอบ Unit Tests (68/68), PostgreSQL Integration Tests (`auction.integration.test.js` 17/17 รวม 16 subtests with `REQUIRE_INTEGRATION=1` without skips), และ Frontend Component Tests (16/16)
  - **Schema/ER Status:** เพิ่มคอลัมน์ `categories` ในตาราง `auction_rounds` แล้ว แต่ **ER Diagram update pending** (รออัปเดตไฟล์ภาพ/เอกสารสถาปัตยกรรมระดับภาพรวม `docs/erdatabase.png` / `docs/S2G5_RE-LOOP_ISE.md`)

## MKT-DEC-025 — Concurrent Auction Rounds & Explicit Round Selection

- Date: 2026-10-09
- Status: Accepted
- Context:
  - ฝ่ายการตลาดต้องการความยืดหยุ่นในการสร้างรอบประมูลหลายรอบที่ช่วงเวลาคาบเกี่ยวหรือทับซ้อนกันได้ เช่น รอบสินค้าแฟชั่นและรอบสินค้าเครื่องประดับที่เปิดรับสมัครหรือประมูลพร้อมกัน
  - ข้อจำกัดเดิมใน MKT-DEC-020 (Cross-round Overlap Protection และการคืน 409 Conflict) บล็อกไม่ให้มีรอบประมูลทับซ้อนเวลากัน จึงต้องยกเลิกกลไก Overlap Protection ดังกล่าว
  - เมื่อมีหลายรอบประมูลเกิดขึ้นพร้อมกัน ระบบต้องไม่ทำการเลือกเดาหรือผูกรอบอัตโนมัติ (No Implicit Round Binding) ผู้ขายต้องเป็นผู้เลือกรอบที่จะส่งสินค้าเข้าร่วมอย่างชัดแจ้ง (Explicit Selection) และผู้ซื้อต้องสามารถเลือกชมสินค้าตามรอบที่สนใจได้อย่างชัดเจน
- Decision:
  1. **Cross-round Overlap Protection Removal:**
     - ยกเลิกการตรวจสอบ Cross-round overlap conflict โดย `findConflictingRound`, `withRoundLock`, `findActiveSubmissionRound` และ `findCurrentRound` ถูกลบออกจาก Production Code แล้ว
     - อนุญาตให้สร้างรอบประมูลทับซ้อนเวลากันได้ทุกกรณี โดยยังคงบังคับการตรวจสอบลำดับเวลาภายในรอบเดียวกัน: $S_{\text{sub}} < E_{\text{sub}} \le S_{\text{auc}} < E_{\text{auc}}$
     - การสร้างรอบ `createRound` บันทึกรอบและ `MarketingAuditLog` (`AUCTION_ROUND_CREATE`) ร่วมกันแบบ Atomic Transaction
  2. **Explicit Round Submission Requirement (Backend & Seller Flow):**
     - บังคับ `input.roundId` ในการส่งสินค้าประมูล (`auctionService.submit`) หากขาด `roundId` ตอบ 400 Bad Request `"กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม"`
     - ตรวจสอบ `roundId` มีอยู่จริง, ยังไม่เริ่มเปิดรับ (400), หรือปิดรับแล้ว (400)
     - ตรวจสอบหมวดหมู่สินค้าตรงกับที่รอบเปิดรับ (`isCategoryAllowedInRound`) ทั้ง Flow A (สินค้าเดิม) และ Flow B (สินค้าใหม่สร้างพร้อมประมูล)
     - ตรวจสอบความถูกต้องของรอบซ้ำภายใน Database Transaction (`tx`) ก่อนบันทึกข้อมูล
  3. **Multi-Round Query Endpoints & Round Item Isolation:**
     - `GET /api/products/auctions/rounds/browse`: คืน `{ activeAuctionRounds, upcomingRounds }` สำหรับ Buyer ค้นหารอบที่กำลังประมูลและรอบที่กำลังจะมาถึง
     - `GET /api/products/auctions/rounds/:roundId`: คืนข้อมูลรายละเอียดรอบพร้อม Derived Phase
     - `GET /api/products/auctions/rounds/:roundId/items`: คืนสินค้าประมูลเฉพาะรอบที่ระบุ (กรอง status `open` และ `scheduled` พร้อม lifecycle reconciliation ผ่าน `maybeAdvance`) รับประกัน Item Isolation ระหว่างรอบอย่างสมบูรณ์
     - `GET /api/products/auctions/rounds/current`: คืน `{ round, phase, isSubmissionOpen, isAuctionActive, activeSubmissionRounds, activeAuctionRounds, nextRound }`
  4. **Seller UX Flow (Desktop Web):**
     - หน้า `/seller/auctions`: แสดง Round Cards สำหรับทุกรอบใน `activeSubmissionRounds` พร้อมปุ่ม "เลือกรอบนี้" ชี้ไปที่ `/seller/auctions/submit?roundId=${round.id}`
     - หากไม่มีรอบเปิดรับ แสดง Empty State ชัดเจนพร้อมคำอธิบายและปุ่มโหลดใหม่
     - หน้า `/seller/auctions/submit`: อ่าน `roundId` จาก Query Parameter (ห้าม Auto-select) หากไม่มี query หรือรอบปิดรับ แสดงแบนเนอร์แจ้งเตือนและปุ่ม "เปลี่ยนรอบประมูล" ชี้กลับไปหน้าเลือกรอบ และซ่อนแบบฟอร์มลงสินค้า
     - เมื่อเลือกรอบถูกต้อง แสดงแบนเนอร์สรุปข้อมูลรอบที่เลือก พร้อมปุ่ม "เปลี่ยนรอบประมูล" และส่ง `roundId` ใน Request Payload
  5. **Buyer UX Flow & Round Switcher (Desktop Web):**
     - หน้า `/auctions`: หน้ารวมรอบสำหรับผู้ซื้อ แสดงรอบที่กำลังประมูลและรอบเร็วๆ นี้อย่างชัดเจน ห้าม Auto-navigate ไปรอบใดรอบหนึ่งแม้มีเพียงรอบเดียว
     - หน้า `/auctions/rounds/[roundId]`: แสดงข้อมูลรอบ, รายการสินค้าเฉพาะรอบนี้แยกกลุ่ม "กำลังประมูล" และ "เร็วๆ นี้", ปุ่มกลับหน้ารวมรอบ, และปุ่ม "เปลี่ยนรอบประมูล" (Round Switcher Popover พร้อมปุ่ม "ลองใหม่" เมื่อโหลดล้มเหลว และข้อความแจ้งเตือนเมื่อไม่มีรอบอื่น) เพื่อสลับไปยังรอบอื่นได้อย่างสะดวกรวดเร็ว
     - หน้า `/auctions/[id]`: แสดงชื่อรอบที่สินค้าสังกัด พร้อมลิงก์ "← กลับไปดูสินค้าทั้งหมดในรอบนี้" ชี้ไปยัง `/auctions/rounds/${auction.roundId}`
  6. **Desktop-Only Scope & Anti-Hardcoding:**
     - รองรับเฉพาะ Desktop Web (ความกว้างตั้งแต่ 1024px ขึ้นไป ได้แก่ 1024×768, 1366×768, 1440×900, 1920×1080) ไม่ทำ Mobile UI หรือ Mobile Flow
     - ข้อมูลหมวดหมู่, สถานะ, และรอบทั้งหมดโหลดจาก API/Database ห้าม Hardcode Business Rules
- Reason: มอบความยืดหยุ่นทางธุรกิจสูงสุดให้ฝ่ายการตลาดในการจัดแคมเปญประมูลพร้อมกัน ขจัดความสับสนของผู้ขายและผู้ซื้อด้วยการเลือกรอบแบบ Explicit และรับประกันความแยกส่วนของสินค้าในแต่ละรอบอย่างแม่นยำ
- Consequence:
  - ฝ่ายการตลาดสามารถจัดอีเวนต์ประมูลคู่ขนานได้อย่างอิสระ
  - ผู้ขายเลือกส่งสินค้าเข้ารอบประมูลที่ต้องการได้อย่างโปร่งใส
  - ผู้ซื้อสามารถเลือกดูสินค้าและประมูลแยกตามรอบได้อย่างเป็นระเบียบ
  - **Environment:** Node.js `v22.16.0` บนสภาพแวดล้อมจริง (ห้ามอ้างว่ารัน Final Regression บน Node 24)
  - **Evidence:**
    - Backend Unit Tests: ผ่านครบ **77/77 tests 100%**
    - PostgreSQL + Redis Integration Tests (`auction.integration.test.js`): ผ่านครบ **18/18 tests (1 suite + 17 subtests)** บน PostgreSQL และ Redis จริง 100% ด้วย `REQUIRE_INTEGRATION=1` ปราศจากการ Skip
    - Frontend Component Tests ที่เกี่ยวข้อง: ผ่านครบ **6 suites, 52/52 tests 100%** (โดย `app/auctions/rounds/[roundId]/page.test.js` เป็น 7/7 ผ่าน)
    - Frontend ทั้งหมดในระบบ: ผ่านครบ **54 suites, 346/346 tests 100%**
    - Quality Gates: `npm run lint` ผ่าน, `npm run format:check` ผ่าน, Production Build (`next build`) ผ่าน, และ `git diff --check` ผ่าน

## MKT-DEC-026 — Auction Item & Round Cancellation, Seller Recovery Lifecycle & Round Filter in Marketing Approval

- Date: 2026-10-10
- Status: Accepted
- Context:
  - เดิมระบบยังไม่ได้แยกการกระทำ 3 รูปแบบออกจากกันอย่างชัดเจน ได้แก่: (A) ปฏิเสธสินค้า (`pending_approval`), (B) ยกเลิกรายการประมูลรายสินค้า (`approved`, `scheduled`, `open`), และ (C) ยกเลิกรอบประมูลทั้งรอบ
  - เดิม `AuctionRound` และ `AuctionItem` ยังไม่มีฟิลด์บันทึกเหตุผลและข้อมูลการยกเลิก (`cancellationReason`, `cancelledAt`, `cancelledBy`)
  - ตาราง `AuctionItem.productId` เดิมมีข้อจำกัด `@unique` ส่งผลให้ไม่สามารถเก็บประวัติสินค้าและ Bid ในรอบเดิมเมื่อผู้ขายนำสินค้าเดิมส่งประมูลในรอบใหม่ได้
  - สินค้าประมูลที่ถูกยกเลิกหรือปิดรอบโดยไม่มีผู้เสนอราคา (0 bids) เดิมกลับคืนสถานะเป็น `available` อัตโนมัติใน Marketplace ทันทีโดยไม่ผ่านการตัดสินใจของผู้ขาย
  - มีโอกาสเกิด Race Condition ระหว่างการยกเลิก (รายสินค้า/ทั้งรอบ) กับ `placeBid` และ `closeAuction` รวมถึงระหว่างการส่งประมูลรอบใหม่ (Resubmit) กับการนำกลับไปขายปกติ (`relist-available`)
  - ฝ่ายการตลาดยังไม่มีตัวกรองรอบประมูล (`roundFilter`) ที่แสดงสถานะผิดพลาดอย่างชัดเจนในหน้าจัดการและอนุมัติสินค้า
- Decision:
  1. **การแยก 3 การกระทำอย่างชัดเจน (Reject vs Cancel Item vs Cancel Round):**
     - **(A) ปฏิเสธสินค้า (`ปฏิเสธสินค้า` — Reject Auction Item):** ใช้เฉพาะสถานะ `pending_approval` ทำเป็นรายสินค้า บันทึก Audit `AUCTION_ITEM_REJECT` ห้ามเรียกว่า "ยกเลิก"
     - **(B) ยกเลิกเฉพาะรายการประมูล (`ยกเลิกรายการประมูล` — Cancel Auction Item):** ใช้กับรายการที่ผ่านการอนุมัติแล้ว (`approved`, `scheduled`, `open`) ผ่าน `PATCH /api/products/auctions/:id/cancel` ต้องระบุเหตุผล (`1–500` ตัวอักษร, trimmed) กระทบเฉพาะรายการที่เลือก รายการอื่นในรอบเดียวกันดำเนินต่อตามปกติ เปลี่ยน `AuctionItem` เป็น `cancelled` และ `Product` เป็น `auction_action_required` (ห้ามกลับเป็น `available` อัตโนมัติ) เก็บ `AuctionItem` และ `Bid` เดิมไว้ทั้งหมด ห้ามยกเลิกหากมี `winningOrderId` แล้ว และบันทึก Audit `AUCTION_ITEM_CANCEL` ใน Transaction เดียวกัน
     - **(C) ยกเลิกทั้งรอบประมูล (`ยกเลิกรอบประมูล` — Cancel Auction Round):** ผ่าน `PATCH /api/products/auctions/rounds/:roundId/cancel` ต้องระบุเหตุผล (`1–500` ตัวอักษร, trimmed) ยกเลิก `AuctionItem` ที่ยัง Active ทุกรายการในรอบ เปลี่ยน `Product` ที่เกี่ยวข้องเป็น `auction_action_required` ห้ามยกเลิกรอบที่สิ้นสุดแล้วหรือมีรายการที่สร้าง `winningOrderId` แล้ว และบันทึก Audit `AUCTION_ROUND_CANCEL` ใน Transaction เดียวกัน
  2. **Schema & Database Sync (`reloop_product`):**
     - เพิ่มฟิลด์ `cancellationReason String?`, `cancelledAt DateTime?`, `cancelledBy String?` ทั้งใน `AuctionRound` และ `AuctionItem`
     - นำ `@unique` ออกจาก `AuctionItem.productId` และเปลี่ยนเป็น index `@@index([productId])` พร้อมปรับ `Product.auctions AuctionItem[]` เพื่อเก็บประวัติ `AuctionItem` และ `Bid` เดิมทุกครั้งที่ส่งประมูลใหม่
     - เพิ่มสถานะ `auction_action_required` ใน `ProductStatus` โดยคัดออกจาก Marketplace Catalog
     - Derive phase ของรอบประมูลเป็น `"cancelled"` ผ่าน `deriveRoundPhase` เมื่อ `round.cancelledAt` มีค่า
  3. **Unified Lock Strategy ป้องกัน Race Condition (Submit / Cancel / Bid / Close):**
     - `submit` (ทั้ง Flow A สินค้าเดิม และ Flow B สินค้าใหม่) ใช้ `withRoundMutationLock(roundId, fn, { productId })` ซึ่งล็อก `hashtext(roundId)` เดียวกับ `withRoundLock(roundId)` โดยกรณี Flow A จะล็อกตามลำดับ `Round Lock -> Product Lock` เสมอ และอ่าน `AuctionRound` ใหม่ภายใน `tx` ก่อนสร้าง `Product` หรือ `AuctionItem` ป้องกันการสร้างรายการประมูลใหม่ในรอบที่เพิ่งถูกยกเลิก
     - `cancel` (รายสินค้า), `placeBid`, และ `closeAuction` ของ `AuctionItem` เดียวกันใช้ Transaction Advisory Lock เดียวกัน (`withAuctionLock(auctionId)` ซึ่งเรียก `pg_advisory_xact_lock(hashtext(auctionId))`)
     - `cancelRound` ใช้ `withRoundLock(roundId)` ซึ่งล็อกรอบก่อนแล้วล็อก `AuctionItem` ทุกตัวในรอบเรียงตาม `id ASC` (`orderBy: { id: "asc" }`) ด้วย `pg_advisory_xact_lock(hashtext(item.id))` เพื่อป้องกัน Deadlock และบล็อก `submit` / `placeBid` / `closeAuction` ไม่ให้แทรกระหว่างการยกเลิก
     - หลังได้ Lock ภายใน Transaction จะอ่าน `AuctionItem`, `AuctionRound`, `Bid` และ `winningOrderId` ใหม่จาก `tx` เสมอ และ `closeAuction` จะไม่สร้าง Winner Order หากรายการหรือรอบถูกยกเลิกแล้ว
  4. **Seller Recovery Lifecycle & Product-Scoped Lock:**
     - เมื่อรายการถูกยกเลิก รอบถูกยกเลิก หรือปิดประมูลโดยไม่มีผู้เสนอราคา (0 bids) `Product` จะเปลี่ยนเป็น `auction_action_required` (ไม่กลับเป็น `available` อัตโนมัติ)
     - ผู้ขายมี 2 ทางเลือกในหน้า `/seller/auctions` (Section "รอคุณดำเนินการ"):
       - **(A) ส่งเข้ารอบประมูลใหม่:** เลือกรอบใหม่อย่างชัดเจน สร้าง `AuctionItem` ใหม่ด้วย ID ใหม่ เก็บ `AuctionItem` และ `Bid` เดิมไว้เป็นประวัติ
       - **(B) นำกลับไปขายแบบปกติ:** กำหนดราคาขายใหม่ (จำนวนเต็มบวก `> 0`) ผ่าน `POST /api/products/:id/relist-available` จึงเปลี่ยนเป็น `available`
     - ทั้ง Flow A (`submit` สินค้าเดิม) และ Flow B (`relistAvailable`) ใช้ `withProductLock(productId)` (`pg_advisory_xact_lock(hashtext(productId))`) และตรวจสอบ `findActiveAuctionByProductId` ภายใน Lock ป้องกันการเกิด Active `AuctionItem` ซ้ำหรือการเปลี่ยนเป็น `available` ขณะมีประมูลที่ยัง Active
  5. **Auction Chat Notification (1-on-1 Read-Only, Atomic DB Idempotency & Retry):**
     - ส่งข้อความ `SYSTEM` ผ่าน Internal Chat API ในห้อง `AUCTION` แบบ 1-on-1 ต่อผู้ใช้ (`AUCTION:${roundId}:${userId}`) แสดงชื่อผู้ส่งและชื่อห้องว่า `"ระบบฝ่ายการตลาด"` (ไม่แสดงเป็น `"ผู้ใช้"`)
     - ห้อง `AUCTION` เป็นห้องแจ้งเตือนแบบอ่านอย่างเดียว (Read-Only): ซ่อนช่องพิมพ์ข้อความใน Frontend (`data-testid="auction-readonly-banner"`) และบล็อกการส่งข้อความ/ไฟล์แนบจากผู้ใช้ด้วย `403 Forbidden` ใน Chat Service
     - บังคับ Unique Constraint บน `Message.idempotencyKey` (`@unique`) ใน `backend/services/chat-service/prisma/schema.prisma` และเรียก `messageModel.createAndTouch` โดยตรงพร้อมดักจับ `P2002`/`P2034` คืนข้อความเดิม (`findByIdempotencyKey`, HTTP 200) แบบ Atomic
     - รองรับ `idempotencyKey` แบบ Deterministic (`AUCTION_ITEM_CANCEL:${auctionId}:${userId}`, `AUCTION_ROUND_CANCEL:${roundId}:${userId}`) และการกด `"ลองส่งแจ้งเตือนอีกครั้ง"` บนรายการหรือรอบที่ถูกยกเลิกไปแล้วโดยไม่เปลี่ยนสถานะซ้ำและไม่สร้าง `MarketingAuditLog` ซ้ำ
  6. **Public Auction Visibility & Marketing Round Filter:**
     - ยกเลิกรายสินค้า: หน้า `/auctions/rounds/[roundId]` ยังคงแสดงรายการนั้นพร้อม Badge `"ยกเลิกแล้ว"`, เหตุผลการยกเลิก และปุ่ม `"ไม่สามารถประมูลได้ (ยกเลิกแล้ว)"` ที่ถูกปิดไว้ โดยรายการอื่นในรอบยังประมูลต่อได้ตามปกติ
     - ยกเลิกทั้งรอบ: `browseRounds` ส่ง `{ includeCancelled: true }` ทั้งใน `findActiveAuctionRounds` และ `findUpcomingRounds` ทำให้หน้า `/auctions` แสดงทั้งรอบ Active และรอบ Upcoming ที่ถูกยกเลิกจนถึง `auctionEndsAt` เดิม พร้อม Badge `"ยกเลิกแล้ว"`, เหตุผลการยกเลิก และปุ่มที่ถูกปิดไว้ หลังจากพ้น `auctionEndsAt` จึงซ่อนจากรายการปัจจุบัน
     - หน้า Marketing (`AuctionScheduleSection.js`): มีตัวกรองรอบประมูลค่าเริ่มต้น `"ทุกรอบประมูล"`, แสดงข้อความผิดพลาดภาษาไทยเมื่อโหลดตัวกรองรอบไม่สำเร็จ, แยกชื่อปุ่ม `"ปฏิเสธสินค้า"`, `"ยกเลิกรายการประมูล"`, `"ยกเลิกรอบประมูล"` อย่างชัดเจน, ใช้ Confirmation Modal ทั้งการยกเลิกรายสินค้าและทั้งรอบ และแสดงแบนเนอร์เตือนพร้อมปุ่ม `"ลองส่งแจ้งเตือนอีกครั้ง"` เมื่อเกิด `chatWarnings`
- Reason: แยกความหมายและผลกระทบของ Reject, Cancel Item และ Cancel Round ให้ชัดเจน ปิดช่องโหว่ Race Condition ด้วย Advisory Lock ที่สอดคล้องกัน บังคับ Chat Idempotency ระดับฐานข้อมูล และให้ผู้ขายตัดสินใจจัดการสินค้าหลังจบหรือยกเลิกประมูลได้อย่างปลอดภัย
- Consequence:
  - **Environment:** Node.js `v22.16.0` บน Windows (ไม่ได้รันบน Node 24)
  - **Evidence:**
    - Backend Unit Tests (0 fail, 0 skip):
      - `backend/services/product-service/src/features/auctions/auctionService.test.js`: ผ่านครบ **102/102 tests**
      - `backend/services/product-service/src/controllers/productRelist.test.js`: ผ่านครบ **5/5 tests**
      - `backend/services/chat-service/src/features/conversations/contextKey.test.js`: ผ่านครบ **9/9 tests**
      - `backend/services/chat-service/src/features/internal/internalController.test.js`: ผ่านครบ **5/5 tests**
      - `backend/services/chat-service/src/features/messages/messageModel.test.js`: ผ่านครบ **4/4 tests**
      - `backend/services/chat-service/src/features/attachments/attachmentService.test.js`: ผ่านครบ **4/4 tests**
    - PostgreSQL & Redis Integration Tests (`REQUIRE_INTEGRATION=1`): `backend/services/product-service/test/auction.integration.test.js` ผ่านครบ **22/22 tests (1 suite + 21 steps, 0 fail, 0 skip)**
    - Chat MongoDB & Cross-Service Integration Tests (`REQUIRE_INTEGRATION=1`): `backend/services/chat-service/test/internal-api.integration.test.js` ผ่านครบ **17/17 tests (1 suite + 16 subtests, 0 fail, 0 skip)**
    - Frontend Component Tests (Jest): ผ่านครบ **54/54 suites, 359/359 tests (0 fail, 0 skip)**
    - Quality Gates: `npm --prefix frontend run build`, `npm run lint`, `npm run format:check`, `git diff --check` ผ่านครบ
    - Browser E2E: **Pending** (ยังไม่ได้รันบนเบราว์เซอร์จริง)
