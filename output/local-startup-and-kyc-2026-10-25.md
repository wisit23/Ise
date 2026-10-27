# งานเปิดระบบในเครื่องและแก้สิทธิ์ผู้ขาย — 25 ตุลาคม 2026

## ผลตรวจล่าสุด

- เปิดเว็บได้ที่ http://localhost:3000
- Containers ที่มี health check ขึ้น healthy; frontend และ pgAdmin ทำงานอยู่
- mongo-init จบด้วย exit code 0 ตามหน้าที่ของ one-shot container
- หน้าแรก, /seller/onboarding, Gateway /health, /api/products/feed?limit=1, /api/products/categories และ /api/products/auctions ตอบ HTTP 200
- Auth, Product, Order และ Support: Prisma migrate status ระบุ Database schema is up to date
- ตรวจรหัสอ้างอิงครบ 25 ประเภท: missing = 0 หลัง backfill
- เทสต์ที่เกี่ยวข้อง 5 suites / 61 tests ผ่าน และ scoped ESLint กับ git diff --check ผ่าน
- ยังไม่ได้ทดสอบการอนุมัติ KYC จริงด้วยบัญชีผู้ซื้อและแอดมินผ่าน browser; พฤติกรรมการอัปเดตสิทธิ์ตรวจด้วย component/API unit tests

## การตั้งค่าและ Docker

- สร้าง .env จาก .env.example เพราะไม่มีไฟล์ .env ทำให้ Compose อ่านค่าตัวแปรไม่ได้
- .env ถูก Git ignore; ไม่แสดงค่าความลับในรายงานนี้
- รัน docker compose up -d --build สำเร็จ
- หลัง migrations restart auth-service, product-service, order-service และ support-service เพื่อให้ background jobs เริ่มด้วย schema ที่อัปเดตแล้ว
- ไม่ reset ฐานข้อมูลและไม่ลบ Docker volumes

## ฐานข้อมูล

สำรอง PostgreSQL ก่อน migrations:

`C:\Users\user\AppData\Local\Temp\ise-before-migrations-20261025-131213.sql`

สำรอง MongoDB reloop_chat ก่อน backfill:

`C:\Users\user\AppData\Local\Temp\ise-chat-before-backfill-20261025-131521.archive`

ใช้ไฟล์ migrations ที่มีอยู่ในโปรเจกต์ ไม่ได้เขียน migration ใหม่:

| บริการ | migrations ที่นำไปใช้ |
| --- | --- |
| Auth | 20261021000000_add_password_reset_tokens; 20261023000000_add_email_verification; 20261024000000_add_reference_codes_and_verification_purpose; 20261024100000_executive_time_indexes; 20261024150000_add_reference_codes |
| Product | 20261023000000_product_favorites; 20261024150000_add_reference_codes |
| Order | 20261023000000_order_pending_to_inbasket; 20261024000000_order_payment_and_expiry_states; 20261024100000_executive_order_time_index; 20261024150000_add_reference_codes; 20261025000000_compact_pickup_transit |
| Support | 20261024100000_executive_ticket_time_index; 20261024150000_add_reference_codes |

รวม 14 migrations มีทั้งเพิ่ม schema/index และปรับข้อมูลตาม migrations เดิม เช่น บัญชีเดิมได้รับ email_verified_at และสถานะออเดอร์ pending/inbasket แปลงเป็น pending_payment, shipped แปลงเป็น in_transit รวม pre_dispute_status ที่เกี่ยวข้อง

ใช้ scripts/reference-codes.cjs ที่มีอยู่ โดยปรับ path/DNS เฉพาะตอนส่งสคริปต์ผ่าน stdin เข้า containers ไม่ได้แก้ไฟล์สคริปต์ต้นฉบับ เติมรหัสเฉพาะ records ที่ยังไม่มี:

| บริการ | จำนวนที่เติม |
| --- | ---: |
| Auth | 20 |
| Product | 86 |
| Order | 169 |
| Support | 12 |
| Chat | 9 |
| รวม | 296 |

Chat สร้าง partial unique index สำหรับรหัสอ้างอิงตามสคริปต์เดิม การเติม metadata อาจอัปเดต updatedAt ของ Conversation

## โค้ดที่แก้ในงานก่อนหน้าและยังอยู่ใน working tree

| ไฟล์ | สิ่งที่เปลี่ยน |
| --- | --- |
| frontend/components/seller/onboarding/ThaiIdQrStep.js | เอาอีโมจิออกจากข้อความปุ่มจำลองสแกน QR |
| frontend/components/auth/SellerSessionSync.js | ไฟล์ใหม่ ติดตามสถานะ KYC ระดับแอปและขอ token ใหม่เมื่อสิทธิ์เปลี่ยน ใช้ notification, focus, reconnect และ fallback ทุก 30 วินาที |
| frontend/app/layout.js | เปิดใช้ SellerSessionSync ภายใต้ ChatSocketProvider |
| frontend/app/seller/onboarding/page.js | เปิด live refresh ให้ผู้ซื้อที่กำลังสมัครด้วย จากเดิมเปิดเฉพาะ stored role SELLER |
| frontend/components/NavBar.js | รับ auth/storage events เพื่ออัปเดตข้อมูลบัญชีและเมนูตาม token ใหม่ |
| frontend/lib/api.js | export refreshAccessToken ที่ใช้ promise ร่วมกัน และป้องกัน refresh เก่ากู้ session หลัง logout/เปลี่ยนบัญชี |
| frontend/lib/auth.js | อัปเดต stored role ตาม signed token ใหม่ของผู้ใช้เดียวกัน |
| frontend/components/auth/SellerSessionSync.test.js | ไฟล์ใหม่ ทดสอบสิทธิ์ผู้ขาย, KYC notification, focus/poll fallback และกรณีไม่ควร refresh |
| frontend/components/NavBar.test.js | ทดสอบเมนูผู้ขายปรากฏเมื่อ session อัปเดต |
| frontend/lib/api.test.js | ทดสอบ background refresh ไม่กู้ session หลัง logout |

ไม่มีการแก้ source ของ Backend หรือ docker-compose.yml ในงานนี้ ยังไม่ได้ commit หรือ push

## Dependencies และข้อกำหนดล่าสุด

ก่อนผู้ใช้กำหนดให้ถามก่อนติดตั้ง: ติดตั้ง dependencies ตาม lockfile ด้วย npm ci --ignore-scripts เพื่อรันทดสอบ; Docker build/start เรียก npm install ตาม Dockerfiles/คำสั่งเดิมของโปรเจกต์

หลังข้อกำหนดล่าสุด: ไม่ได้ติดตั้งเพิ่ม ใช้ Node/Jest/ESLint/Prisma/mongodump ที่มีอยู่แล้ว การตรวจ Prisma รอบสุดท้ายใช้ npx --no-install

หากจำเป็นต้องติดตั้งอะไรเพิ่มเติม ต้องถามผู้ใช้ก่อน
