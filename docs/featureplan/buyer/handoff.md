# Buyer Feature Handoff

> อัปเดตล่าสุด: 2026-10-17

## Ownership and status

- Owner: วิศิษฏ์ เจียมสันต์
- Reviewer: เอกตระการ บุญญกาศ
- Existing requirement scope: `UR-01`–`UR-07`; Buyer เป็น consumer ของ Swipe `UR-11` ภายใต้ Marketing contract
- รอบนี้เทียบเพิ่มเติมกับ `ST-BUY-01`–`ST-BUY-05` ที่ผู้ใช้ให้มา ไม่ได้กำหนดว่า ST และ UR เป็น mapping แบบหนึ่งต่อหนึ่ง
- Current status: มี implementation รองรับทั้ง 5 Stories แต่ overall Buyer acceptance ยังเปิด
- แหล่งสถานะปัจจุบันและ source evidence: [`progress.md`](progress.md)

## Scope to hand off

| Slice | มี implementation แล้ว | งานที่ต้องยืนยัน/ทำต่อ |
| --- | --- | --- |
| `BUY-001` Catalog | Category/style/brand/size/condition/price filters และ text search | Current-code acceptance และ large-dataset performance |
| `BUY-002` Reservation | Reservation 10 นาที, Cart countdown และ expiry handling | Concurrent purchase, expiry, retry/compensation, restart recovery และ target schema |
| `BUY-003` Checkout/Tracking | Order status UI, participant transition table, Payment/Shipping models และ seller shipping entry | Buyer เห็นบริษัทขนส่ง/เลขพัสดุแล้วและผ่าน focused tests; ตรวจ payment retry/idempotency/restart และ checkout-to-receipt journey |
| `BUY-004` Trust/Contact | Product details/media, seller rating/reviews และ Contact Seller/create-or-open chat | ข้อมูลสภาพจริง/ตำหนิและ cross-service chat/review authorization/persistence acceptance |
| `BUY-005` Discovery | Swipe choose/unchoose/read-back, Style Profile และ behavioral recommendations | Current-code persistence/account-isolation acceptance, choose role contract และ Wishlist หากตกลงเพิ่ม scope |

## Important corrections to the September snapshot

- Contact Seller มีแล้ว: `frontend/components/chat/ContactSellerButton.js` ใช้ `frontend/lib/chat.js` และเปิด `/chat/:id`
- Style Profile และ recommendation มีแล้ว: ดู [`recommendation.md`](recommendation.md) สำหรับ ranking, fallback และ deployment dependencies
- Swipe มี choose/unchoose/read-back แล้ว ไม่ควรสั่ง implement ซ้ำโดยอาศัย snapshot เดิม
- Choose service ปัจจุบันรองรับ customer roles `BUYER`/`SELLER`; Buyer-only เป็นประเด็น contract ที่ต้องตกลง ไม่ใช่ข้อสรุปว่า implementation ขาด ownership check
- `backend/services/order-service/src/services/orderLifecycle.js` มี `PARTICIPANT_TRANSITIONS` แล้ว
- Order schema ปัจจุบันมี `Payment`/`Shipping`; ยังไม่ยืนยัน payment acceptance และไม่ควรสรุปว่าไม่มี payment persistence จากการไม่พบชื่อ `PaymentAttempt`
- รายละเอียด service layout/media contract ใน historical snapshot ต้องตรวจใหม่ก่อนใช้เป็น migration หรือ implementation brief

## Dependencies and contracts

- Product/ProductVideo เป็น provider ของ catalog, reservation, product media และ Swipe feed
- Auth เป็น provider ของ Style Profile; Order เป็น provider ของ paid purchase history สำหรับ recommendations
- Chat เป็น provider ของ Product-context buyer/seller conversation
- Buyer/Order journey ส่ง Order data ให้ Seller, Customer Service, Admin และ Executive
- Swipe heart ไม่ใช่ Bid, ไม่สร้าง Order และไม่จองสินค้า
- Fulfillment ใช้ test simulation ของผู้จัดส่งตาม scope ที่ผู้ใช้ยืนยัน: `ORDER_DELIVERY_DELAY_MS` fallback 10 วินาที ไม่ใช่ carrier delivery event
- ไม่ต้องติดต่อผู้จัดส่งหรือเชื่อมสถานะขนส่งจริง; real-carrier integration อยู่นอก scope และไม่ใช่ acceptance blocker
- Buyer detail ต้องแสดงบริษัทขนส่งและเลขพัสดุจากข้อมูล simulation ที่ผู้ขายกรอก ไม่ใช่แสดงเฉพาะสถานะคำสั่งซื้อ
- Wishlist สินค้าโดยตรงยังไม่ได้ถูกอนุมัติให้ implement ในรอบเอกสารนี้
- ตรวจ API/state/merge expectations กับ [`../integration.md`](../integration.md) ก่อนทำงานต่อ; เอกสารแผนเก่าไม่ใช่หลักฐาน runtime

## Resume from here

1. Shipping display ใน `BuyerOrderDetailModal.js` implemented แล้ว; ยืนยัน simulated shipping journey ผ่าน UI/API จริง โดยคง mandatory company/trackingNumber ของผู้ขาย
2. ตรวจ current payment/state contracts แล้วทดสอบค้นหา → แชต → จอง → ชำระเงิน → จัดส่ง → รับสินค้า แบบ isolated UI/API/PostgreSQL
3. ยืนยัน reservation concurrency/expiry/restart, payment retry/idempotency, review authorization/duplicate/media และ chat persistence
4. ยืนยัน recommendation filters/pagination/account isolation ด้วย buyer simulation ที่กำหนด profile/พฤติกรรม/ผลคาดหวัง และทดสอบ discovery diversity/performance กับ dataset ที่เหมาะสม ไม่อ้างความพึงพอใจของผู้ซื้อจริง
5. ตรวจ migrations/schema ใน target environment และตกลง choose role contract ก่อนแก้ role behavior
6. Reviewer ตรวจ acceptance evidence แยกแต่ละ slice; อย่าทำ Contact Seller/Style Profile/recommendation ใหม่เพราะเอกสารเดือนกันยายนระบุว่ายังขาด

รายการนี้เป็น handoff ของงานที่เหลือ ไม่ใช่การอนุมัติแก้ application code หรือ deployment

## Shipping UI delivery evidence — 2026-10-17

- Buyer detail แสดง company/trackingNumber จาก shipping; ก่อนส่งแสดงข้อความรอผู้ขาย ไม่สร้างข้อมูลพัสดุขึ้นเอง
- Seller mandatory-field rules เดิมไม่เปลี่ยน; เพิ่ม backend regression tests สำหรับ missing/empty/whitespace company/trackingNumber
- Frontend focused tests 14/14, backend shipping unit tests 14/14, targeted ESLint และ diff check ผ่าน
- ไม่ได้ทดสอบ browser E2E/PostgreSQL integration หรือ deploy; documentation-refresh boundary ด้านล่างอ้างถึงรอบเอกสารก่อน implementation นี้

## Evidence boundary

- 2026-10-17: source review และ documentation refresh เท่านั้น ไม่ได้รัน tests/build/browser E2E/PostgreSQL acceptance หรือ deployment
- ผลทดสอบเดือนกันยายนเป็น historical evidence ใน [`changelog.md`](changelog.md) ไม่ใช่ผลปัจจุบัน
- ไม่ยืนยัน runtime data, deployed migrations หรือความครบถ้วนของข้อมูลสินค้า
- Required acceptance evidence: commit/file scope, Story/task coverage, คำสั่งและวันที่ทดสอบ, pass/fail/skip, isolation details, schema/migration changes และ remaining blockers
