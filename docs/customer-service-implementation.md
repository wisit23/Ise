# Customer Service: นำ ER เวอร์ชันคนมาใช้กับโค้ดจริง

> Update: ข้อความทั้งหมดเป็นของ Chat Service แล้ว ดู [ขั้นตอนเปลี่ยน ownership](customer-service-chat-ownership.md).
> รายงานเดิมด้านล่างเป็นประวัติ normalization ก่อนเปลี่ยน ownership; ขณะนี้มี 13 ตาราง domain ที่ใช้งาน
> และ `ticket_messages` เป็น legacy archive สำหรับย้ายข้อมูลเท่านั้น ไม่ใช่ตารางข้อความที่ runtime ใช้งาน.

อ้างอิงแบบเต็ม `customer-service-er-chen-readable-a4.drawio` (13 entities)
และ implementation ใน `backend/services/support-service/prisma/schema.prisma`.
ขอบเขตนี้คือ ER เต็มของ CS; ภาพ Major Change เรื่อง CS Supervisor เป็นข้อเสนอแยก
และยังไม่ได้เพิ่มระบบยศ/permission ใหม่ใน Auth Service.

## สิ่งที่นำมาใช้

- Setup: ticket_categories, ticket_priorities, ticket_statuses, sla_policies, help_categories
- Master: help_articles, help_article_revisions
- Transaction: support_tickets, ticket_assignments, ticket_status_history,
  ticket_sla_targets, ticket_messages, ticket_audit_events, ticket_chat_links

รวม 14 ตารางหลักของ schema ใหม่. `ticket_audit_logs` และคอลัมน์เดิมใน support_tickets/help_articles
ยังคงอยู่ใน SQL ช่วงเปลี่ยนผ่านสำหรับการย้อนกลับ แต่ Prisma และ API อ่านจากโครงสร้างใหม่.
Prisma delegate `ticketAuditLog` ถูก map ไป `ticket_audit_events` เพื่อไม่ให้ชื่อในผู้เรียกเปลี่ยนทั้งหมด.

## รายการเพิ่ม/แก้จาก ER

| การปรับ                            | เพิ่ม/แก้                | เหตุผลจากโค้ดจริง                                                                                                                                                     |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TICKET_MESSAGE                     | เพิ่มกลับ                | POST /tickets/:id/messages ยังเป็นช่องทางตอบ ticket และ /internal/chat-events ยังรับสำเนาจาก Chat; การลบตารางทันทีทำให้ flow เดิมและ internal note หาย                |
| Primary/soft-reference IDs         | แก้                      | เก็บ TEXT IDs เดิม รวม fixture ที่ไม่ใช่ UUID; แถวใหม่ยังสร้าง UUID string ได้ ไม่ cast ข้อมูลเก่าเป็น PostgreSQL uuid                                                |
| ชื่อ PK ใน SQL                     | แก้การ map               | support_tickets, help_articles, ticket_messages และ audit ใช้ id เดิม; ID ของตารางใหม่ใช้ชื่อตามแบบ การอ้าง FK ยึด schema จริง                                        |
| priority_score / risk_report_count | เพิ่มใน SUPPORT_TICKET   | คิว CS/Admin ใช้คะแนนและประวัติความเสี่ยงจาก Risk Service อยู่แล้ว                                                                                                    |
| PENDING_USER                       | เพิ่มใน setup status     | state machine จริงมีช่วงรอลูกค้าตอบ                                                                                                                                   |
| SLA cycle                          | เพิ่ม                    | unique(ticket_id, metric_type, cycle) แทน unique(ticket_id, metric_type); เมื่อ RESOLVED -> IN_PROGRESS สร้าง RESOLUTION รอบใหม่และเก็บผลรอบเดิม                      |
| SLA default durations              | กำหนดค่าเริ่มต้น         | First response ใช้เวลาเดิม LOW=72h/NORMAL=24h/HIGH=4h/URGENT=1h; resolution ใช้เวลาเดียวกันเพื่อรักษาความหมาย deadline เดิม ต้องตกลงระยะเวลาแยกจริงก่อนเปลี่ยน policy |
| SLA policy version                 | ใช้งานจริง               | เลือก policy ที่มีผล ณ เวลาเปิดเคส โดยหมวดเฉพาะมีสิทธิก่อน policy ทุกหมวด; target เก็บ policy_id และ due_at ของเคส ไม่คำนวณย้อนหลังจากค่าปัจจุบัน                     |
| published_at                       | คง/เพิ่มใน HELP_ARTICLE  | API เดิมคืนเวลาเผยแพร่; revision identity และ published_version ใช้ตามแบบ                                                                                             |
| Published revision FK              | แก้รายละเอียด constraint | composite FK (id,published_version) -> (article_id,version) แบบ DEFERRABLE INITIALLY DEFERRED รองรับ ownership และวงจร Article/Revision                               |
| Revision publication               | แก้ flow                 | เนื้อหาแต่ละ version แยกแถว; POST /help/:id/revisions สร้าง draft ใหม่โดยไม่ทับ public content; publish เลือก version ได้                                             |
| TICKET_CHAT_LINK                   | ใช้ตามไฟล์ล่าสุด         | บังคับหนึ่งเคสมีหนึ่ง link และ conversation ห้ามถูกผูกกับหลายเคส; linked_at เก็บเวลาที่เชื่อม                                                                         |
| Ticket Audit Event                 | แก้                      | event_type + JSONB payload แทน from_value/to_value/reason แยกคอลัมน์; status/assignment histories เป็นข้อมูลเฉพาะทางที่ใช้ตัดสินสถานะจริง                             |
| Ticket number                      | แก้                      | sequence + next_support_ticket_number() แทน random/retry; เริ่มถัดจากเลขสูงสุดเดิม และไม่ตัดตัวเลขเมื่อเกินหกหลัก                                                     |
| Timestamps                         | แก้                      | TIMESTAMPTZ(3); migration ตีความ TIMESTAMP เดิมเป็น UTC                                                                                                               |
| SQL-only constraints               | เพิ่ม                    | partial UNIQUE active assignment, SLA metric/cycle/เวลา policy, revision version, message role และ publication state                                                  |
| API compatibility                  | เพิ่มชั้นแปลง            | API ยังคืน category/status/priority เป็น code และ assigneeId/conversationId/SLA/lifecycle timestamps ตามเดิม; หน้าเว็บเดิมใช้ต่อได้                                   |
| Closed ticket assignee             | แก้ projection           | ปิดช่วงรับผิดชอบเมื่อ CLOSED แต่ยังคืนผู้รับผิดชอบคนสุดท้ายเพื่อรักษาสิทธิ์การอ่านและประวัติของเจ้าหน้าที่                                                            |
| Atomic operations                  | แก้                      | create/assign/status/message + ประวัติ + audit อยู่ใน transaction เดียวกัน; CAS version และ Serializable retry ป้องกันการแก้ชนกัน                                     |
| Chat retry                         | แก้                      | ตรวจ ticket/conversation correlation ก่อนตอบว่า duplicate; chat_message_id และ dedupe_key ป้องกัน message/audit ซ้ำ                                                   |

SLA รอบใหม่ใช้ระยะเวลาจาก policy snapshot เดิมของเคส. First response เป็นเป้าหมายครั้งแรกของเคส,
ไม่สร้างใหม่ทุกครั้งที่ reopen. การเปลี่ยน business hours หรือ pause SLA ระหว่าง PENDING_USER
ยังต้องกำหนดกติกาธุรกิจก่อน ไม่ได้เดาเพิ่มในงานนี้.

## Migration และข้อมูลเก่า

1. `20261005000000_support_baseline` สร้าง schema รุ่นเดิมสำหรับฐานข้อมูลว่าง.
2. `20261006_cs_ticket_overhaul` คง migration ที่มีอยู่ใน workspace.
3. `20261007000000_normalize_customer_service` สร้างตารางใหม่, seed setup,
   backfill และติดตั้ง constraints/triggers ภายใน transaction เดียว.

`prisma/migrate.js` ตรวจการติดตั้งเดิมจาก db push. ถ้ามีครบสี่ตารางเดิมแต่ยังไม่มี baseline,
ใช้ Prisma migrate resolve บันทึก baseline ก่อน deploy. ถ้ามีเพียงบางตารางจะหยุดด้วย error
แทนการเดา schema. Docker startup เปลี่ยนจาก db push เป็น migrate.js -> seed.js -> server.

ไม่มี DROP TABLE/DROP COLUMN ใน normalization migration. ตารางเก่าบางส่วนเป็น rollback projection
ที่ trigger ดูแลให้อยู่ในรูปแบบที่โค้ดเดิมอ่านได้. ห้ามใช้ prisma db push/reset กับฐานข้อมูลเดิม
เพราะจะข้าม backfill, partial indexes, sequence, triggers และ constraints ที่ Prisma schema แสดงไม่ครบ.

Backfill ไม่สร้างประวัติปลอมให้ดูเหมือนครบ:

- status history ดึง audit เดิมที่มีและ timestamp milestone ที่ยังอยู่;
  ข้อมูลที่มาจาก snapshot ระบุ migration:legacy/Migrated ... ไว้
- assignment เดิมรู้ได้เพียงผู้รับผิดชอบล่าสุด ไม่สามารถกู้การส่งต่องานที่ไม่ได้บันทึก
- FAQ เดิมมีเนื้อหาฉบับล่าสุดเพียงชุดเดียว จึงเก็บเป็น revision ที่ทราบ; กู้ revision ที่เคยถูกทับไม่ได้
- ถ้า conversation_id เดิมถูกใช้ซ้ำหลาย ticket migration จะหยุดทั้ง transaction
  พร้อมข้อความให้แก้ ownership ก่อน

## วิธีใช้

Docker Compose:

```sh
docker compose up --build support-service
```

รันในเครื่องโดยตั้ง DATABASE_URL ให้ชี้ฐานข้อมูล Support ที่ต้องการก่อน:

```sh
node backend/services/support-service/prisma/migrate.js
node backend/services/support-service/prisma/seed.js
node backend/services/support-service/src/server.js
```

การสร้าง client:

```sh
npx prisma generate --schema backend/services/support-service/prisma/schema.prisma
```

การทดสอบ: ตั้ง DATABASE_URL_SUPPORT ให้ชี้ฐานข้อมูลทดสอบที่รัน migrations/seed แล้ว
และ REQUIRE_INTEGRATION=1.

```sh
node --test --test-concurrency=1 "backend/services/support-service/src/**/*.test.js" "backend/services/support-service/test/*.test.js" scripts/demo-cs-admin.test.js
```

Cross-service live-chat test ต้องมี CHAT_SERVICE_URL และ AUTH_PUBLIC_URL เพิ่มด้วย.
การรับ event ฝั่ง Support, correlation, idempotency และ privacy มีทั้ง unit/DB integration tests
ที่รันได้โดยไม่เปิด Auth/Chat จริง.

## ผลตรวจสอบ 2026-10-07

- Prisma validate/generate และ ESLint ผ่าน.
- ทดสอบกับ PostgreSQL 16.14 แบบ native ที่แยกไว้ใน tmp และ bind เฉพาะ localhost.
- migrate.js + seed ผ่านทั้งฐานว่างและ schema เดิมที่ยังไม่มี _prisma_migrations;
  รัน migrate.js ซ้ำแล้วไม่มี pending migration.
- ตรวจข้อมูล legacy: ผู้รับผิดชอบ ห้องแชท ข้อความ FAQ revision และ timestamp UTC ยังคงตรง;
  sequence สร้าง #CS-1000000 และ #CS-1000001 ได้โดยไม่ชนกัน.
- ตรวจ diff ระหว่าง SQL ที่ migrate แล้วกับ Prisma schema: ต่างเฉพาะ legacy columns/indexes
  และ ticket_audit_logs ที่ตั้งใจคงไว้เป็น rollback projections.
- ชุดทดสอบ Support และ demo contract ผ่าน 64 tests; skip 1 test ที่ต้องเปิด Auth/Chat จริง.
  มี DB tests สำหรับ claim พร้อมกัน, transaction rollback, SLA reopen cycle,
  chat correlation/idempotency, closed-ticket access, draft/public isolation และ revision พร้อมกัน.
- ยังไม่ได้ apply migration กับฐานข้อมูลใช้งานจริง และยังไม่ได้ทดสอบ Docker startup แบบครบทุก service.
  เมื่อเปิดระบบจริง ให้ใช้ migrate.js/deploy ตามขั้นตอนข้างบน.

## การย้อนกลับ

คง backup ของฐานข้อมูลก่อนรัน migration. หยุด instance ที่ใช้ schema ใหม่ก่อนเปลี่ยนกลับโค้ดเดิม
และใช้ Prisma client รุ่นเดิม. Legacy projections ทำให้ code เดิมอ่านค่าหลักและข้อความ/audit ได้.
เมื่อกลับไปเขียนด้วยโค้ดเดิมแล้ว ห้ามสลับกลับ code ใหม่โดยไม่ reconcile normalized tables:
การ sync ช่วงเปลี่ยนผ่านเป็นทางใหม่ -> เก่า ไม่ใช่ dual-write สองทิศทาง.

ยังไม่ทำ contract migration ลบ legacy columns/table. ตัดออกเป็น migration แยกได้หลังตรวจ
ข้อมูลจริงและพ้นช่วง rollback แล้ว.
