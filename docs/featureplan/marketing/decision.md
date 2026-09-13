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



