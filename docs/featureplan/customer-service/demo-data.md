# ชุดข้อมูลทดสอบ Customer Service / Admin

ชุดนี้สร้างข้อมูลที่เชื่อมกันระหว่าง Auth, Order, Support และ Chat เพื่อกดทดสอบตามลำดับได้จริง แทน Ticket, Dispute และ Report ตัวอย่างเดิมที่ถูก seed แยกกันตอนเริ่ม container

## เตรียมและสร้างข้อมูล

1. เปิด Docker Desktop แล้วรัน `docker compose up -d --build` จากโฟลเดอร์โครงการ รอให้ Auth, Order, Support และ Chat healthy
2. ตรวจแผนล้างข้อมูลด้วย `node scripts/demo-cs-admin.js --reset-all-cs-admin`
3. ล้างเคส CS/Admin เดิมทั้งหมดและสร้างชุดใหม่ด้วย `node scripts/demo-cs-admin.js --reset-all-cs-admin --apply`
4. ตรวจ API และสิทธิ์จริงด้วย `node scripts/smoke-cs-admin-demo.js`
5. ตรวจ verdict, idempotency, System Notice และการล็อกห้องด้วย `node scripts/smoke-cs-admin-verdict.js` (สคริปต์คืน fixture ให้อัตโนมัติ)
6. คืนชุดข้อมูลเป็นจุดเริ่มต้นหลัง smoke test ด้วย `node scripts/demo-cs-admin.js --apply`

สคริปต์ตรวจว่า URL ของฐานข้อมูลชี้ไปยัง Compose บนเครื่องนี้และชื่อฐานข้อมูลตรง `reloop_auth`, `reloop_order`, `reloop_support`, `reloop_chat` ก่อนแก้ข้อมูล โหมด `--reset-all-cs-admin` สำรอง JSON ไว้ใน temp ของเครื่องก่อนล้าง Ticket, Dispute, Report, ประวัติ Admin และแชทเคสทั้งหมด พร้อม Order ที่ผูกกับ Dispute เหล่านั้น แล้วสร้าง fixture ใหม่ โหมด `--apply` เพียงอย่างเดียว reset เฉพาะ fixture ที่รู้ ID เพื่อกลับสู่จุดเริ่มต้น อย่ารันกับฐานข้อมูลที่ใช้ข้อมูลจริง

ตรวจบนเครื่องพัฒนา 2026-10-06 หลังล้างข้อมูลเก่า: เหลือ 4 Ticket, 4 Dispute, 3 Report และ 12 ห้องแชทเคสที่ผูกถูกต้อง (Ticket 4, Dispute Buyer/Seller 8); มี 4 Order ของ Dispute และ 7 บัญชี demo ไฟล์สำรองล่าสุดอยู่ที่ `C:\Users\Achir\AppData\Local\Temp\reloop-cs-admin-backup-1791266208408.json` และ smoke test ผ่าน gateway จริง

> รหัสผ่านของบัญชี demo ด้านล่างคือ `password123` ใช้เฉพาะเครื่องพัฒนา

| บัญชี | อีเมล | ใช้ทดสอบ |
| --- | --- | --- |
| ผู้ซื้อ | `buyer.demo@example.com` | เปิด Ticket/Dispute, ดูประวัติ |
| ผู้ขาย | `shop.denim@example.com` | ดูและตอบ Dispute 01–02 |
| ผู้ขายอีกคน | `shop.sneaker@example.com` | ดู Dispute ที่ตัดสินแล้ว |
| CS ผู้รับงาน | `cs.nan@example.com` | รับเคส ส่งข้อความ และส่งต่อ Admin |
| CS อีกคน | `cs.beam@example.com` | ทดสอบไม่เห็นแชทเคสที่คนอื่นรับ |
| Admin | `admin@example.com` | ดูประวัติ Ticket/Report และแชทเคสส่งต่อ |
| Trust & Safety | `trust.demo@example.com` | ทดสอบสิทธิ์เจ้าหน้าที่ระดับสูง |

## Flow ที่ควรกด

1. เข้า `/workspace` ด้วย `cs.nan@example.com` → Ticket `#CS-DEMO-01` ยังไม่มีผู้รับงาน กดรับงานแล้วเริ่มแชทกับผู้ซื้อ
2. เปิด `#CS-DEMO-02` → มีข้อความผู้ซื้อและ CS เดิม พร้อมบันทึกภายในที่ผู้ซื้อไม่ควรเห็น ลองตอบแล้วรีโหลดเพื่อยืนยันประวัติ
3. เข้า Admin Inbox ด้วย `admin@example.com` → Ticket `#CS-DEMO-03` อยู่สถานะ `ESCALATED` เปิดดูข้อความก่อนส่งต่อแบบอ่านอย่างเดียว; เข้าด้วย CS เดิมต้องไม่อ่านแชทเคสนี้ได้
4. กรอง Ticket เป็น `CLOSED` → `#CS-DEMO-04` ต้องอ่านประวัติได้ แต่ส่งข้อความไม่ได้
5. ใน Disputes ให้ CS รับเคส `01 รอ CS รับเคส`; เคส `02 CS รับเคสแล้ว` ใช้ทดสอบแท็บ Buyer/Seller ที่เป็นคนละห้อง; เคส `03 รอ Admin ตัดสินเงิน` อยู่ใน Admin Inbox; เคส `04 ตัดสินแล้ว` ใช้ทดสอบประวัติแบบอ่านอย่างเดียว
6. ใน Admin Inbox แท็บรายงานผู้ใช้ มี `01 รอตรวจ`, `02 ตรวจแล้ว`, `03 จัดการแล้ว` สำหรับตรวจตัวกรองและการดำเนินการ

ชุด Ticket ใช้เลข `#CS-DEMO-01` ถึง `#CS-DEMO-04`; เหตุผล Dispute และ Report ขึ้นต้นด้วย `DEMO` เช่นกัน

`#CS-DEMO-02` อ้างถึง Order/Dispute ชุดที่ 02 ซึ่งมีผู้ซื้อ ผู้ขาย และ CS คนเดียวกัน ข้อความ Chat ของ Ticket ถูกผูกกับ `TicketMessage` ใน Support ด้วย `chatMessageId` เพื่อให้หน้าประวัติทั้งสองทางสอดคล้องกัน

## ขอบเขตการ reset

- `--reset-all-cs-admin --apply` ล้าง Ticket, Dispute, Report, AdminAudit, ห้อง SUPPORT/DISPUTE/DISPUTE_BUYER/DISPUTE_SELLER และห้อง ORDER ของ Order ที่มี Dispute ในฐานข้อมูล local แล้วสร้าง fixture ข้างบนใหม่ โดยเขียนไฟล์สำรองก่อนล้าง
- `--apply` อย่างเดียวลบและสร้างเฉพาะ Ticket, Dispute, Report, Order และห้อง Chat ของ fixture ที่มี fixed ID ใน `scripts/demo-cs-admin.js`
- ลบ demo case เก่าจาก seed อัตโนมัติและสคริปต์เดิมที่เลิกใช้ เพื่อไม่ให้กลับมาปะปนหลัง restart
- เก็บบัญชีผู้ใช้เดิม, FAQ, KYC, สินค้า และ Order ที่ไม่มี Dispute ไว้; บัญชี demo ที่ระบุข้างบนจะถูกตั้งรหัสผ่านและ role ให้กลับเป็นค่าเริ่มต้นเมื่อรัน `--apply`
