# Buyer Feature Progress

> Owner: วิศิษฏ์ เจียมสันต์ · Reviewer: เอกตระการ บุญญกาศ · Updated: 2026-10-17

**Status:** มี implementation รองรับ `ST-BUY-01`–`ST-BUY-05` แล้ว แต่ overall Buyer acceptance ยังเปิด
รอบนี้เป็นการเทียบ source code กับ User Stories แบบ read-only ไม่ได้รัน tests, browser E2E หรือยืนยัน deployment
คำว่า “มีแล้ว” ในเอกสารนี้หมายถึงพบ implementation ไม่ใช่ผ่าน acceptance

**Acceptance scope:** ใช้ test simulation ของผู้ซื้อผ่านบัญชีทดสอบและสถานการณ์ที่กำหนด
ไม่ได้ติดต่อหรือเก็บผลจากผู้ซื้อจริง การผ่าน simulation ต้องเทียบกับผลคาดหวังที่ตรวจได้
เช่น สินค้าตรงตัวกรอง ลำดับคำแนะนำ ความหลากหลายของ feed และสถานะคำสั่งซื้อ
ไม่ใช้ความพึงพอใจหรือความรู้สึก “ไม่น่าเบื่อ” ของผู้ซื้อจริงเป็น acceptance gate

## User Story coverage

| Story | Implementation ที่พบ | งานที่เหลือ / สิ่งที่ต้องยืนยัน |
| --- | --- | --- |
| `ST-BUY-01` ค้นพบสินค้าตรงสไตล์และไม่น่าเบื่อ | Style Profile, recommendation จากความชอบ/คำค้น/หัวใจ Swipe/ประวัติซื้อ, ผสม personal/new/discovery และ Swipe feed | ทดสอบด้วย buyer simulation ที่กำหนดความชอบและผลคาดหวัง รวมถึงความหลากหลายเมื่อสินค้าน้อยหรือกรองแคบ; ไม่อ้างผลความพึงพอใจของผู้ซื้อจริง |
| `ST-BUY-02` ค้นหาด้วยตัวกรองละเอียด | Category, style, brand, size, condition, min/max price และ text search บน catalog | ทดสอบหลายตัวกรองร่วมกัน, pagination และ performance กับ dataset ใหญ่บนโค้ดปัจจุบัน |
| `ST-BUY-03` ข้อมูลสินค้าและความน่าเชื่อถือก่อนซื้อ | รายละเอียด/สภาพและสื่อสินค้า, seller rating/review, Contact Seller เพื่อเปิดหรือกลับเข้าแชตเดิม | ยืนยันความครบถ้วนของข้อมูล/ภาพสภาพจริงและตำหนิ; ทดสอบ Product → Chat และ review ownership/persistence แบบ end-to-end |
| `ST-BUY-04` ไม่พลาดสินค้าชิ้นเดียวระหว่างตัดสินใจ | Reservation 10 นาทีผ่านตะกร้า พร้อม countdown และ expiry handling | ทดสอบ concurrent purchase, expiry และ recovery บนโค้ดปัจจุบัน; ยังไม่พบ Wishlist สินค้าโดยตรง หากต้องการเก็บไว้ตัดสินใจระยะยาวต้องตกลง scope เพิ่ม; หัวใจ Swipe ไม่ใช่ reservation |
| `ST-BUY-05` ติดตามหลังซื้อ | Orders แสดงสถานะ, seller flow รับบริษัทขนส่ง/เลขพัสดุ และมี Shipping persistence; การจัดส่งใช้ test simulation ตาม scope | Buyer detail แสดงบริษัทขนส่ง/เลขพัสดุแล้วและผ่าน focused component tests; ยังต้องทดสอบ simulated shipping journey ทั้งระบบ โดยไม่ต้องเชื่อมขนส่งจริง |

## Slice status

| Slice | สถานะจาก source review | Evidence ปัจจุบัน | สิ่งที่ยังขาด |
| --- | --- | --- | --- |
| `BUY-001` Catalog Search and Filters | Implemented; มี historical local verification | Catalog filters/text search และ catalog consumer ของ recommendations | Current-code acceptance, reviewer acceptance และ large-dataset performance |
| `BUY-002` Reservation and Cart | Implemented; มี historical local verification | Reservation flow และ Cart expiry/countdown | Current-code concurrency/expiry/restart acceptance และยืนยัน schema ใน target deployment |
| `BUY-003` Checkout and Fulfillment Tracking | Partial; acceptance ยังไม่ยืนยัน | Order status UI, participant transition table, Payment/Shipping persistence และ seller shipping entry | ตรวจ payment retry/idempotency/restart contract และ full checkout-to-receipt acceptance |
| `BUY-004` Seller Trust, Review and Contact Entry | Implemented บางส่วน; acceptance ยังไม่ยืนยัน | Product seller rating/reviews/media และ Contact Seller/create-or-open chat | Cross-service chat/review authorization/persistence acceptance และตรวจความครบถ้วนข้อมูลสินค้า |
| `BUY-005` Extended Discovery | Implemented บางส่วน; acceptance ยังไม่ยืนยัน | Swipe choose/unchoose/read-back, Style Profile และ behavioral recommendations | Current-code persistence/account-isolation acceptance; Wishlist สินค้าโดยตรงยังไม่พบ; ทบทวน choose role contract |

## Confirmed source locations

### Catalog and discovery — ST-BUY-01 / ST-BUY-02

- `frontend/app/products/page.js`: filter controls, search-event recording และเรียก `/api/products/recommendations` พร้อม filter/pagination parameters
- `frontend/app/profile/page.js` และ `frontend/components/profile/StyleProfileForm.js`: Style Profile entry/form
- `backend/services/product-service/src/features/recommendations/`: profile/activity/purchase signals, ranking และ mixed discovery pools
- `frontend/components/swipe/SwipeVideoCard.js` และ `backend/services/product-service/src/features/product-videos/`: choose/unchoose และอ่าน chosen state กลับ
- รายละเอียด ranking/fallback/deployment dependencies: [`recommendation.md`](recommendation.md)

Style Profile และ recommendations ไม่ใช่งานที่ยังไม่มีแล้วตาม snapshot เดือนกันยายน
Recommendation เป็น rule-based matching ไม่ใช่การฝึก ML และการพบ implementation ไม่พิสูจน์ความพึงพอใจของผู้ใช้

### Product trust and contact — ST-BUY-03

- `frontend/app/products/[id]/page.js`: รายละเอียด/สภาพสินค้า, seller rating/review list และ `ContactSellerButton`
- `frontend/components/chat/ContactSellerButton.js` และ `frontend/lib/chat.js`: ติดต่อผู้ขายแล้วเปิด `/chat/:id`
- `backend/services/chat-service/src/features/conversations/conversationService.js`: create-or-open conversation flow

Contact Seller มีแล้ว ไม่ควรลงเป็น missing implementation อีกต่อไป
ส่วนคุณภาพรูป/รายละเอียด/ตำหนิจริงยังต้องตรวจข้อมูลและ seller input rules ไม่ใช่สรุปจากการมี UI เพียงอย่างเดียว

### Reservation — ST-BUY-04

- `backend/services/product-service/src/features/reservations/`: reservation service/routes
- `frontend/app/cart/page.js`: reservation deadline/countdown และตัดรายการที่หมดอายุออกจาก checkout
- หัวใจ Swipe เป็น bookmark ของวิดีโอ ไม่สร้าง Order และไม่กันสินค้าให้ผู้ซื้อ

### Fulfillment tracking — ST-BUY-05

- `frontend/app/orders/page.js`: แสดงสถานะและกรองรายการคำสั่งซื้อ
- `frontend/components/orders/OrderShippingModal.js`: ผู้ขายกรอกบริษัทขนส่งและเลขพัสดุเมื่อส่งสินค้า
- `backend/services/order-service/prisma/schema.prisma`: `Payment`, `Shipping` และ `OrderLog` persistence models
- `backend/services/order-service/src/services/orderLifecycle.js`: `PARTICIPANT_TRANSITIONS` มี role/state rules แล้ว จึงไม่ควรระบุว่าไม่มี explicit transition table
- `frontend/components/orders/BuyerOrderDetailModal.js`: แสดงรูปสินค้าและชื่อร้านผ่าน existing Product/Auth loaders พร้อมข้อมูลคำสั่งซื้อ/สถานะ/ที่อยู่ บริษัทขนส่งและเลขพัสดุจาก `order.shipping`; ก่อนส่งแสดงข้อความรอผู้ขายระบุข้อมูล หากไม่พบสินค้า/ร้านยังเปิดรายละเอียดคำสั่งซื้อได้

Delivery เป็น test simulation ของผู้จัดส่งตาม scope ที่ผู้ใช้ยืนยัน ไม่ต้องติดต่อหรือเชื่อมสถานะจากขนส่งจริง
`ORDER_DELIVERY_DELAY_MS` มี fallback 10,000 ms; ค่าที่ deploy จริงอาจ override ผ่าน environment
การไม่เชื่อม real carrier ไม่ใช่งานค้างหรือ acceptance blocker
Buyer detail ต้องแสดงบริษัทขนส่งและเลขพัสดุที่ผู้ขายกรอกใน simulation พร้อมสถานะคำสั่งซื้อ
ข้อมูลสองรายการนี้เป็นข้อมูลทดสอบ ไม่ใช่หลักฐานว่ามีการจัดส่งจริง

## Product/shop UI implementation verification — 2026-10-17

- เพิ่มรูปสินค้าและชื่อร้านใน Buyer order detail โดยใช้ `fetchProduct`, `fetchSellerSummary` และ `ProductThumb` เดิม; เลือกรูปภาพไม่ใช้ video เป็น thumbnail
- รองรับสินค้าถูกลบ/โหลดไม่สำเร็จ/ไม่มีรูป และชื่อร้านไม่พร้อม โดยคงข้อมูลขนส่งและที่อยู่เดิม
- Frontend focused Jest: `BuyerOrderDetailModal.test.js` + `OrderShippingModal.test.js` ผ่าน 17/17
- Targeted ESLint และ `git diff --check` ผ่าน; ไม่ได้รัน browser E2E หรือ deployment

## Shipping UI implementation verification — 2026-10-17

- Buyer order detail เพิ่มบริษัทขนส่ง/เลขพัสดุ พร้อมรองรับข้อมูลที่โหลดใหม่จาก API และเลขพัสดุยาว
- คง seller requirement เดิม: ต้องกรอกทั้ง company และ trackingNumber จึงส่งได้; backend reject ค่าว่าง/ช่องว่าง/ไม่มีค่าโดยไม่เขียนข้อมูล
- Frontend focused Jest: `BuyerOrderDetailModal.test.js` + `OrderShippingModal.test.js` ผ่าน 14/14
- Backend focused unit tests: `shippingService.test.js` ผ่าน 14/14 รวม mandatory shipping fields
- Targeted ESLint และ `git diff --check` ผ่าน; มี Next.js workspace-root warning ใน Jest
- ไม่ได้รัน browser E2E, PostgreSQL integration หรือ deployment; ผลนี้ไม่ปิด overall Buyer acceptance

## Verification boundary

### Current documentation refresh — 2026-10-17

- ตรวจ source locations ข้างต้นและเทียบกับ `ST-BUY-01`–`ST-BUY-05`
- ไม่ได้รัน application tests, PostgreSQL acceptance, browser E2E, build หรือ deployment ในรอบนี้
- ยังไม่ยืนยัน runtime data, migrations ใน target environment หรือผล acceptance ของโค้ดปัจจุบัน
- ไม่ยก slice หรือ overall Buyer เป็น Done จาก source review

### Historical evidence — not revalidated

Snapshot ก่อนหน้าใน [`changelog.md`](changelog.md) บันทึกว่า:

- `BUY-001`: forced PostgreSQL catalog integration ผ่าน 1/1 เมื่อ 2026-09-05
- `BUY-002`: เคยมี PostgreSQL concurrency/expiry/recovery evidence
- 2026-09-07: review/gateway focused tests 15/15, frontend 47/47 และ build/lint/Compose/Docker focused checks ผ่าน
- Root backend run ใน snapshot เดิม: 98 pass, 2 fail จาก `PrismaClientInitializationError` เมื่อ database ไม่ได้รัน

ตัวเลขข้างต้นเป็นประวัติ ไม่ใช่ผลตรวจล่าสุดของโค้ดปัจจุบัน และไม่ได้ยืนยัน service layout/media contract เดิมว่ายังเหมือนเดิม

## Remaining work and next action

1. Buyer shipping display implemented และผ่าน focused tests แล้ว; ยืนยัน simulated shipping journey ผ่าน UI/API จริงต่อ โดยผู้ขายต้องกรอกทั้งบริษัทขนส่งและเลขพัสดุก่อนส่ง
2. ทดสอบ journey ค้นหา → รายละเอียด → แชต → จอง → ชำระเงิน → จัดส่ง → รับสินค้า ผ่าน UI/API และฐานข้อมูลจริงแบบ isolated
3. ยืนยัน reservation concurrency/expiry/restart, payment retry/idempotency, review ownership/duplicate/media และ recommendation account isolation
4. ทดสอบ discovery ด้วย buyer simulation: กำหนด profile/พฤติกรรมและผล ranking ที่คาดหวัง ตรวจการผสม personal/new/discovery การไม่ซ้ำในชุดข้อมูลคงที่ และ fallback; ทดสอบความเร็วเมื่อสินค้าจำนวนมากและยืนยัน migrations/schema ใน target deployment
5. ทบทวน choose role contract: source ปัจจุบันรองรับ customer roles `BUYER`/`SELLER` ไม่ใช่ Buyer-only; ต้องตกลง requirement ก่อนนับเป็น defect
6. Wishlist ระยะยาวต้องตกลง scope หากจะเพิ่ม; real-carrier integration อยู่นอก scope เพราะการจัดส่งใช้ test simulation ไม่ต้องทำเพื่อปิด `ST-BUY-05`
7. Reviewer ตรวจ evidence ก่อนเปลี่ยนสถานะ acceptance

Security hardening ที่เคย deferred ไม่ได้ถูกตรวจหรือเปลี่ยน scope ในรอบเอกสารนี้
