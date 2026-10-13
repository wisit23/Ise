# Support Service (Customer ใน ER) — สิ่งที่ตรวจและตกลง

ต้นทาง: thread `191c4986-dbe8-41ca-93bf-a26fa649b30a`; Mxx อ้าง [บทสนทนาเต็ม](../sources/191c4986-dbe8-41ca-93bf-a26fa649b30a-transcript.md) ดู [กติกาและสถานะรวม](../README.md)

## สิ่งที่ตรวจพบ

- M04: ชื่อคอลัมน์ต่าง เช่น `ticket_id` → `id`, `target_user_id` → `target_id`, `article_id` → `id` เป็นรายการที่พบความต่าง ไม่ใช่คำอนุมัติให้ rename ทุกคู่โดยอัตโนมัติ
- M11: ER ยังไม่ระบุ type/nullability/default ครบ ต้องใช้ schema/backend และรายงานประกอบ ไม่เดาความหมายจากชื่อ
- M04 รายงาน validate ผ่านทั้ง 4 service แต่ยังไม่พิสูจน์ Support/SLA กับ DB จริง
- Backend ใช้ส่วนเพิ่มเติม เช่น `ticket_messages`, `priority_score`, `risk_report_count`, `chat_responder_id`, `ticket_sla_targets.cycle`

## คีย์และชื่อที่อนุมัติ

- M16, M21–M22: `shop_change_request_items` ใช้ PK ผสม **`(requests_id, field_name)`** ไม่ใช่ `(id, requests_id)` เพื่อให้หนึ่งคำขอมีแต่ละ field ได้หนึ่งรายการ
- M16: `help_article_revision` ใช้ PK ผสม **`(article_id, version)`**
- M14, M16: แก้สะกดผิด ใช้ SQL `snake_case` และชื่อมาตรฐาน `created_at`, `reference_id`, `order_id` ตามความหมายที่ตกลง ไม่ถือว่าต้องเพิ่มสามคอลัมน์นี้ทุกตาราง

## ข้อ 5: Chat เป็นเจ้าของข้อความ — M29/M31, อนุมัติ M32

- เลิกเก็บข้อความซ้ำใน `ticket_messages`; Support เก็บการเชื่อม ticket ↔ conversation ใน `ticket_chat_links`
- ข้อความจริงอยู่ Chat Service รวมหมายเหตุภายในผ่าน `visibility = INTERNAL` ที่ schema มีอยู่
- Support หา conversation, ตรวจสิทธิ์ แล้วอ่าน/ส่งข้อความผ่าน Chat
- retry ต้องใช้ idempotency key เดิม ไม่เกิดข้อความซ้ำ
- ต้องย้ายข้อความเก่าครบก่อนเลิกใช้ตาราง ห้ามทิ้งประวัติ
- ผู้ใช้ทั่วไป/ผู้ขายที่ไม่มีสิทธิ์ต้องอ่านหมายเหตุภายในไม่ได้ รวม API รายการข้อความและการแจ้งเตือน
- ถ้า Chat ติดต่อไม่ได้ แสดงข้อผิดพลาด/สถานะยังไม่พร้อม ไม่ส่งรายการว่างให้เข้าใจว่าประวัติถูกลบ

## ข้อ 6: คิวและ SLA — M29/M31, อนุมัติ M32

- ย้ายประวัติคะแนนจัดคิว/ผลความเสี่ยงไป `ticket_audit_events.payload` คงข้อมูล กฎคำนวณ และผลที่ใช้ ณ เวลานั้น ไม่ใช้ความเสี่ยงปัจจุบันแทนย้อนหลัง
- แทน `chat_responder_id` ด้วย assignment ร่วมกับเหตุการณ์รับ/เปลี่ยนหน้าที่ตอบแชต ไม่ถือว่า assignee คือ responder เสมอ
- แทน `ticket_sla_targets.cycle` ด้วยเหตุการณ์เปิด/เปิดใหม่ ระบุเวลาเริ่ม รุ่นนโยบาย และ target IDs ของรอบนั้น
- คง SLA targets ตามแบบและประวัติรอบเก่า ไม่แก้ทับเมื่อเปิด ticket ใหม่ ไม่จับรอบจากเวลาใกล้กัน
- ตัวอย่างตอบภายใน 30 นาที/แก้ในหนึ่งวันใน M31 ใช้อธิบาย SLA เท่านั้น **ไม่ใช่นโยบายที่ตกลง**

## งานค้างและการตรวจ

ยังไม่ได้แก้ ER/schema/migration/callers หรือย้ายข้อความใน thread ต้นทาง ต้องแจกแจง mapping คอลัมน์/constraints และรูปแบบ audit/event ก่อนตัดส่วนเดิม ตรวจ PK ผสมและกรณีข้อมูลซ้ำบน DB ชั่วคราว รวมคิว/SLA reopen, assignee เทียบ responder, Chat unavailable/retry, การย้ายประวัติ และสิทธิ์ INTERNAL ทั้ง API/notification ผลเหล่านี้ยังไม่รันในรอบบันทึกนี้
