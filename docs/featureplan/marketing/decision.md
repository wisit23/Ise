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
