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

| Role | Email | หน้าที่ที่ทดลองได้ |
|---|---|---|
| Buyer | buyer.demo@example.com | ซื้อสินค้า, checkout, payment, รับสินค้า, review, dispute, ticket, Swipe |
| Seller | shop.denim@example.com | ลงสินค้า, ดูที่อยู่, จัดส่ง, แชท, ส่งสินค้าเข้าประมูล, ลงคลิป |
| Seller อีกบัญชี | shop.sneaker@example.com | ซื้อ/กดสนใจสินค้าในฐานะลูกค้าได้ |
| CS | cs.nan@example.com | รับ ticket/case, ตอบลูกค้า, deadline รายหลักฐาน, ส่งต่อ Admin |
| CS อีกบัญชี | cs.beam@example.com | ตรวจสิทธิ์เคสที่ไม่ได้เป็นผู้รับผิดชอบ |
| T&S | trust.demo@example.com | Report, safety hold, takeover ticket, อ่าน chat แบบ oversight |
| Admin | admin@example.com | รับข้อพิพาทที่ส่งต่อและตัดสินคืนเงิน |
| Marketing | marketing@example.com | แคมเปญ, metric, รอบประมูลและการอนุมัติตามสิทธิ์ปัจจุบัน |
| Executive | ceo@example.com | ภาพรวมธุรกิจและรายงาน OPEN/REVIEWED/ACTIONED |

## ข้อมูลและ flow ที่สร้าง

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

## การตรวจ

`scripts/verify-local-dataset.cjs` ตรวจ address ownership/snapshot, seller/product,
ยอด order/payment, single paid notification, dispute evidence, hold/release,
Admin verdict, ticket chat/responder และ campaign attribution/budget จากฐานจริง
ผ่านทั้งหมด รวมถึง rerun seeder โดยไม่มีรายการเพิ่ม

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
node scripts/prepare-local-dataset.cjs
docker compose up -d --build auth-service product-service order-service chat-service support-service gateway frontend

# เติม transactions ผ่าน API และตรวจความสัมพันธ์
node scripts/seed-local-workflows.cjs
node scripts/verify-local-dataset.cjs
```

Seeder จะ resume จาก checkpoint เดิม; เก็บ checkpoints ไว้ถ้าต้องการรันต่อ
ชุดนี้ไม่ย้ายประวัติจากฐานเก่า และไม่ทำให้ legacy migration mappings สมบูรณ์โดยอัตโนมัติ
