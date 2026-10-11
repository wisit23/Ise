# Local dataset พร้อมใช้งาน — 11 ตุลาคม 2026

ระบบที่ `http://localhost:3000` ใช้ schema หลัง merge และฐานข้อมูลใหม่แล้ว
Gateway อยู่ที่ `http://localhost:8080` และ backend ทั้ง 5 services ผ่าน health checks
เป็นระบบ demo ในเครื่อง ไม่มีการชำระหรือคืนเงินจริง

## วิธีที่เลือก

สร้างฐานข้อมูลชุดใหม่ชื่อ `reloop_demo_20261011_auth`, `_product`, `_order`,
`_support` และ MongoDB `reloop_demo_20261011_chat` แล้วเปลี่ยน `.env` ให้ชี้ชุดนี้
ฐานเดิมทุกฐานและทุก volume ยังอยู่ ไม่มี reset หรือลบข้อมูลเก่า

ข้อมูลเดิมมี 93 orders, 24 disputes, 37 tickets และ 32 users แต่ Order ยังไม่มี
Payment แบบ schema ใหม่ จึงไม่สร้าง payment/address/dispute history สมมติให้ records เก่า
ตรวจจำนวนข้อมูลเดิมก่อนและหลังแล้วตรงกันทุกตารางที่ตรวจ

Config ก่อนเปลี่ยนเก็บใน `.env.pre-dataset-20261011.local` ซึ่ง Git ignore ไว้
หากกลับไปรันกับฐานเดิม ต้องใช้โค้ด/image ชุดก่อน merge ที่ตรงกับ schema นั้นด้วย
รายละเอียด snapshot ของโค้ดเดิมยังอยู่ใน named stash ของรอบ merge

## บัญชี demo

ใช้ password `password123` ทุกบัญชีในตารางนี้

| Role            | Email                    | หน้าที่ที่ทดลองได้                                                       |
| --------------- | ------------------------ | ------------------------------------------------------------------------ |
| Buyer           | buyer.demo@example.com   | ซื้อสินค้า, checkout, payment, รับสินค้า, review, dispute, ticket, Swipe |
| Seller          | shop.denim@example.com   | ลงสินค้า, ดูที่อยู่, จัดส่ง, แชท, ส่งสินค้าเข้าประมูล, ลงคลิป            |
| Seller อีกบัญชี | shop.sneaker@example.com | ซื้อ/กดสนใจสินค้าในฐานะลูกค้าได้                                         |
| CS              | cs.nan@example.com       | รับ ticket/case, ตอบลูกค้า, deadline รายหลักฐาน, ส่งต่อ Admin            |
| CS อีกบัญชี     | cs.beam@example.com      | ตรวจสิทธิ์เคสที่ไม่ได้เป็นผู้รับผิดชอบ                                   |
| T&S             | trust.demo@example.com   | Report, safety hold, takeover ticket, อ่าน chat แบบ oversight            |
| Admin           | admin@example.com        | รับข้อพิพาทที่ส่งต่อและตัดสินคืนเงิน                                     |
| Marketing       | marketing@example.com    | แคมเปญ, metric, รอบประมูลและการอนุมัติตามสิทธิ์ปัจจุบัน                  |
| Executive       | ceo@example.com          | ภาพรวมธุรกิจและรายงาน OPEN/REVIEWED/ACTIONED                             |

## ชุดตั้งต้นและ flow ที่สร้าง

- 9 orders เชื่อม 9 checkouts, 9 shipping/address snapshots และ 8 payments
- ลำดับซื้อจริง: Seller ลงสินค้า → Buyer/Seller คุยใน PRODUCT chat → Buyer สั่งซื้อ
  → เลือก address จาก Auth → confirm payment → Seller ใส่ carrier/tracking → Buyer รับสินค้า
- 1 completed order ใช้ voucher ของแคมเปญจริง: ราคา 890 บาท, ส่วนลด 89 บาท,
  payment/attribution สุทธิ 801 บาท และ review 5 ดาว
- 4 disputes มีหลักฐานภาพครบ: รอ CS, CS รับแล้วพร้อม manual deadline,
  ส่งต่อ Admin และ Admin รับ/อนุมัติ refund ผ่าน API
- 1 รายการถูก T&S hold แยกจาก dispute case และมี OrderLog/Hold ที่เกิดจริง
- 5 tickets: NEW, IN_PROGRESS, PENDING_USER, ESCALATED/T&S takeover และ CLOSED
  มี customer chat, CS replies และ internal notes ที่แยก visibility
- 3 Reports ผ่านขั้นตอน OPEN → REVIEWED → WARN_USER ตามสถานการณ์
- 2 FAQ ผ่าน draft/publish และ 1 รอบประมูลที่เปิดรับสินค้า พร้อม 2 auction items
  (รออนุมัติและผ่านอนุมัติแล้ว)
- 2 clips เกิดจากภาพประกอบสินค้า demo สี่มุมเดียวกับ listing แล้ว upload ผ่าน API
  มี 2 Swipe choices ของ Buyer/Seller และตรวจว่า staff choose ถูกปฏิเสธ
- 16 conversations และ 74 messages เชื่อม order/ticket จริง

บัญชี, catalog, categories และ role/reference data เป็นข้อมูลตั้งต้นสำหรับ demo
ส่วน transactions และการเปลี่ยนสถานะข้างต้นสร้างผ่าน API ที่แอปใช้งานจริง
หลักฐานเป็นข้อความสถานการณ์สาธิตที่อ้าง order/product จริงในชุดใหม่
ภาพ/คลิปเป็นภาพประกอบที่ระบุ DEMO ชัดเจน ไม่ใช่ข้อมูลลูกค้าเดิม

วันที่เกิดเหตุการณ์เป็นเวลาที่รัน flow จริง ไม่มีการย้อนหลัง payment, SLA หรือ audit
รายการรอชำระและรอบประมูลเดินตามเวลาจริง จึงอาจหมดอายุหรือเปลี่ยนสถานะตามระบบ

## Seed ครบทุก service

`npm run seed:local` เรียก `scripts/seed-all-services.cjs` ซึ่ง resume ชุดตั้งต้น
แล้วเพิ่มสถานการณ์ด้านล่างผ่าน API จริงของระบบ ทุก account และไฟล์เป็น DEMO

| ระบบ              | สถานการณ์เพิ่มเติม                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth              | KYC pending/verified/rejected, เอกสารส่วนตัวและสิทธิ์อ่าน, BUYER+SELLER หลัง KYC, แก้ profile/address/default/delete                                  |
| Seller profile    | คำขอแก้ร้าน APPROVED/REJECTED/PENDING พร้อม field-change items                                                                                        |
| Account safety    | จำกัด BUYER/SELLER/ALL_COMMERCE, คืนสิทธิ์, suspend/restore, session refresh/logout, bulk preview/action/idempotency                                  |
| Product           | แก้ประกาศ/ซ่อน/แสดง, gallery video, Report → REVIEWED → REMOVE_PRODUCT, restore พร้อม audit                                                           |
| Review/Swipe      | รีวิวหลังรับสินค้า ทั้งภาพและวิดีโอ, Buyer/Seller สนใจคลิป, staff/บัญชีจำกัดสิทธิ์ถูกปฏิเสธ                                                           |
| Marketing         | บทความ draft/publish/search, campaign draft/pending/approved/rejected/published/ended, wallet/ส่วนลด/ยอดขาย/งบจริง                                    |
| Auction           | pending/approved/rejected/cancelled, รอบเปิดให้ bid, bid ซ้ำไม่เพิ่มแถว, ปิดตามเวลาจริงและสร้าง order ผู้ชนะ, ปิดแบบไม่มี bid                         |
| Order             | Seller ซื้อสินค้า, checkout รวมสองร้าน, เปลี่ยนที่อยู่, confirm payment ซ้ำ, ยกเลิกและคืนคูปอง, T&S hold/release, Admin refund/release escrow         |
| Dispute/Chat      | หลักฐานสัมพันธ์กับ order/product, safety verification, private attachment, mark-read/unread, ห้อง Buyer/Seller แยกกัน, ปฏิเสธคนอื่นและ internal notes |
| Support           | ticket ทั้ง 5 categories, CS สองคน, SLA อัตโนมัติ, status history, T&S takeover โดย CS ตอบลูกค้า, FAQ draft/publish/revise/unpublish                  |
| Executive/Gateway | reports ทุกสถานะ, operations audit, metrics Auth/Product/Order และ proxy ที่ใช้สิทธิ์จริง                                                             |

ข้อมูล demo master preferences ของ Buyer ระบุที่มาชัดเจน; style quiz เป็นงานที่ยังไม่ implement
และไม่มีการอ้างว่าผ่าน flow quiz แล้ว ระบบ Review ปัจจุบันอยู่ใน Product service
ตาม gateway/compose; ไม่เปิด Review service เดิมซ้ำ

ตาราง `support.ticket_messages` เป็น legacy archive ตาม schema ปัจจุบัน จึงปล่อยว่าง
ข้อความ ticket ที่ใช้งานจริงอยู่ใน Chat MongoDB และตรวจ privacy/sync จากระบบนั้น
ไม่มีการเติมประวัติ legacy สมมติลง archive หรือ reset ฐานเดิม

จำนวนล่าสุดและ coverage รายสถานการณ์ดูใน `verification.json` และ
`all-service-coverage.json` ในโฟลเดอร์ local dataset (จำนวน login/audit อาจเพิ่มตามการเข้าใช้)
ผลตรวจล่าสุด: 24 users, 46 products, 18 orders, 15 checkouts/payments,
5 disputes, 9 tickets, 5 reports, 7 campaigns, 8 auction items/3 bids,
3 reviews และ 34 conversations/131 messages ครบ 17 กลุ่มงาน
ตรวจ 64 schema models ที่ใช้งานจริงว่ามีข้อมูล พร้อมตรวจความสัมพันธ์ข้าม service
รัน seed ซ้ำแล้วจำนวนข้อมูลธุรกิจเท่าเดิม; login/session และ audit การเข้าดูเป็นเหตุการณ์ใหม่
บันทึกผลเปรียบเทียบที่ `repeatability.json` และ tests ประมูลผ่าน 107 tests
รายการ pending/auction เปลี่ยนตามเวลาจริง รวมถึงกติกา anti-sniping ที่ต่อเวลาปิดเมื่อ bid ใกล้หมดเวลา

บัญชีเสริมใช้รูปแบบ `demo.20261011.<scenario>@example.com` กับ password เดิม
เช่น `kyc-pending`, `kyc-verified`, `kyc-rejected`, `restricted-buyer`,
`restricted-seller`, `restricted-all_commerce`, `restored-permission`,
`suspended`, `restored-account`, `bulk-a`, `bulk-b`, `session` และ `profile-address`
บัญชี `suspended` ตั้งใจให้เข้าใช้งานไม่ได้สำหรับตรวจ flow ระงับบัญชี

## การตรวจ

`scripts/verify-local-dataset.cjs` ตรวจ address ownership/snapshot, seller/product,
ยอด order/payment, single paid notification, dispute evidence, hold/release,
Admin verdict, ticket chat/responder และ campaign attribution/budget จากฐานจริง
รวมทั้ง schema models ทุก service ที่ใช้งานจริง, multi-seller checkout, voucher release,
safety evidence และ auction winner การ rerun ไม่สร้าง transactions ซ้ำ แต่ login/audit
และเวลา mark-read เป็นเหตุการณ์ใหม่ตามการตรวจจริง

เปิดเว็บ Buyer และตรวจรายการ order, review, voucher และภาพสินค้าแล้ว
แก้การแสดง T&S-only hold ให้ไม่แสดงลิงก์ dispute ที่ไม่มี case
API regression tests ที่เกี่ยวข้องผ่าน 12 tests

ผลตรวจและ IDs อยู่ที่ `tmp/local-dataset-20261011/verification.json`
และ `workflow-checkpoints.json` (local files ที่ Git ignore)
ไม่บันทึก access/refresh tokens ลง checkpoints

## รันซ้ำ

```powershell
# ตรวจข้อมูลเดิมโดยใช้ config สำรอง (read-only)
node scripts/local-dataset-inventory.cjs .env.pre-dataset-20261011.local

# ตัวสร้างคลิปใช้ ffmpeg สำหรับ Windows ในโฟลเดอร์ชั่วคราว
npm install --prefix tmp/local-dataset-tools @ffmpeg-installer/win32-x64 --no-audit --no-fund

# สร้าง schema ใหม่/reference data แล้วเปิด services
npm run seed:local:prepare
docker compose up -d --build auth-service product-service order-service chat-service support-service gateway frontend

# เติม transactions ผ่าน API และตรวจความสัมพันธ์
npm run seed:local
npm run seed:local:verify
```

Seeder จะ resume จาก checkpoint เดิม; เก็บ checkpoints ไว้ถ้าต้องการรันต่อ
ชุดนี้ไม่ย้ายประวัติจากฐานเก่า และไม่ทำให้ legacy migration mappings สมบูรณ์โดยอัตโนมัติ

Auth/Product reference seed สร้างเฉพาะข้อมูลที่ยังไม่มีเป็นค่าเริ่มต้น เพื่อไม่เขียนทับ
ชื่อร้าน, roles, สถานะสินค้าหรือบทความที่เปลี่ยนผ่าน flow แล้ว
`RELOOP_RESEED_DEMO=1` เป็นตัวเลือก reset fixtures โดยเจตนา ไม่ต้องใช้สำหรับ rerun ปกติ
หากต้องการชุดใหม่อีกชุด ให้กำหนด `LOCAL_DATASET_LABEL=YYYYMMDD_suffix`
แล้ว prepare → start services → seed → verify โดยเก็บ checkpoint แยกตาม label
