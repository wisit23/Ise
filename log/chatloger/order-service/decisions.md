# Order Service — สิ่งที่ตรวจและตกลง

ต้นทาง: thread `191c4986-dbe8-41ca-93bf-a26fa649b30a`; Mxx อ้าง [บทสนทนาเต็ม](../sources/191c4986-dbe8-41ca-93bf-a26fa649b30a-transcript.md) ดู [กติกาและสถานะรวม](../README.md)

## สิ่งที่ตรวจพบในบทสนทนา

- M04: ไม่มี `evidence` แยกตาม ER ใช้ `evidence_path` ใน `dispute_evidence`; ชื่อต่าง เช่น `ref_id`/`reference_id`, `version`/`dispute_case_version`
- M10: ถอนข้อสังเกตที่เคยเข้าใจว่า `orders.status` เป็นส่วนเกิน เพราะ **มีจริงใน ER**
- M04: validate ผ่าน แต่ DB ไม่รัน ยังไม่พิสูจน์ checkout/payment/dispute/migration จริง
- Backend มีส่วนเพิ่มเติมที่ต้องรักษาข้อมูล: outbox, address snapshot, ยอด checkout, ชื่อสินค้าย้อนหลัง, สถานะก่อน dispute และ workflow คดี

## ข้อตกลงชื่อ คีย์ และความสัมพันธ์

| รายการ | ข้อตกลงล่าสุด | อ้างอิง |
|---|---|---|
| `dispute_case.created_by` | เหลือหนึ่ง attribute/คอลัมน์ ลบวงรีซ้ำ | M12–M15 |
| `dispute_audit_log` | ใช้ `dispute_audit_log_id` เป็น PK เอา attribute `id` อีกตัวออกจาก ER | M12–M15 |
| ชื่อมาตรฐาน | `created_at`, `reference_id`, `order_id`, SQL `snake_case` | M14, M16 |
| ชื่อเฉพาะ | `dispute_case_version`, `reservation_expires_at`, `pre_removal_status` | M16–M18 |
| `dispute_audit_log.dispute_id` | อ้าง **หลักฐาน** ใน `dispute_evidence` ไม่ใช่ `dispute_case` | M16–M18 |
| `safety_dispute_evidence.evidence_id` | อ้าง `dispute_evidence` | M16–M18 |
| `safety_log` | PK คือ `safety_log_id` | M16–M18 |
| `dispute_evidence` | rename `status` → `dispute_status` คงข้อมูล/ความหมายเดิม เหลือคอลัมน์เดียว | M25–M26 |

**สถานะหลักฐาน:** M16/M21 เคยตอบว่า `status` กับ `dispute_status` เป็นคนละเรื่อง แต่ M25 แก้ว่าแค่เปลี่ยนชื่อ จึงใช้ M25–M26 แทน ไม่สร้างสองสถานะ และต้อง migration แบบ rename ไม่ลบแล้วสร้างใหม่จนข้อมูลหาย

**PK audit:** Prisma เดิมใช้ property `id` ที่ `@map("dispute_audit_log_id")` นั่นคือ PK SQL ตัวเดียว ไม่ใช่คอลัมน์ SQL `id` เกินอีกตัว ถ้าเปลี่ยนชื่อ property ต้องเปลี่ยน callers ด้วย

**Evidence — คำยืนยันต่อจาก thread ต้นทาง:** ผู้ใช้ยืนยันว่า `evidence` อ้างอิง/เชื่อมกับ `dispute_evidence` ตาม ref อยู่แล้ว ไม่ต้องถามปลายทางความสัมพันธ์เดิมซ้ำ รายงาน audit มี `evidence.ref_path`, `dispute_evidence _id`, `evidence_id`; schema ที่ตรวจในรอบติดตามยังไม่มี model `Evidence` และเก็บ `evidence_path` ใน `DisputeEvidence` อยู่ ดังนั้นสิ่งที่ต้องจัดทำคือ mapping และการย้ายข้อมูลให้ตรงแบบ ไม่ใช่ขอเลือกความสัมพันธ์ใหม่ ห้ามตีความ `ref_path` ซึ่งอ้างไฟล์เป็น FK ของตารางโดยอัตโนมัติ

## Hold — M16–M18, M32–M34

- `source` อยู่ในตาราง `hold` ไม่ได้มีตาราง `hold_source`
- อนุมัติในบทสนทนาติดตาม: ผู้ใช้ตอบ “ok” ต่อคำถามยืนยันเปลี่ยน `hold.source` → `hold_type` ตาม ER โดยคงข้อมูล ความหมายค่า และพฤติกรรมเดิม เช่น `DISPUTE` / `TRUST_AND_SAFETY` ไม่เพิ่ม `source` อีกคอลัมน์ ต้องปรับ callers และ migration ให้รักษาข้อมูล
- อนุมัติเพิ่ม `hold.payment_id` ใน ER (ข้อ 10.3)
- M34 สรุปแยกความหมาย: `payment_id` = payment ที่เงินถูกระงับ; `reference_id` = รายการที่เป็นเหตุให้ระงับ เช่น case ID; `hold_type` = ประเภท ไม่ใช้ reference ตัวเดียวแทนทั้งสองความสัมพันธ์
- เหตุผลรายละเอียดอยู่ใน `hold_reason` ตามคำอธิบาย schema เดิม

## วิธีทดแทน backend ที่อนุมัติแล้ว

### 1. Outbox → `order_log` — M29/M31 ข้อ 1, อนุมัติ M32

- แทน `attribution_outbox_events` ด้วยเหตุการณ์งานแจ้งแคมเปญใน `order_log.detail`
- สร้างงานพร้อมเปลี่ยน order ใน transaction เดียวกัน
- worker อ่านงานที่ยังไม่มีเหตุการณ์ยืนยันส่งสำเร็จ ส่งไป Product แล้วเพิ่มเหตุการณ์ยืนยันโดยไม่แก้ทับต้นฉบับ
- ใช้ event ID เดิมทุก retry; Product ป้องกันผลซ้ำผ่าน `campaign_attributions.event_id`/`order_id`
- ส่งเครือข่ายซ้ำได้ แต่ห้ามนับยอดซ้ำ ต้องรองรับ restart และเก็บ log ไว้กู้คืนงาน ไม่ลบตามรอบ audit โดยไม่ตรวจงานค้าง

### 2. ที่อยู่ ณ เวลาสั่งซื้อ — M32, คำอธิบาย M34

- ข้อกำหนดผู้ใช้: อิง `address_id` **ที่ลูกค้าเลือกสำหรับคำสั่งซื้อนั้น** ไม่เลือก default/ที่อยู่อื่นเอง
- M34 เสนอขั้นตอน: ตรวจว่าเป็นที่อยู่ของลูกค้าจริง อ่านที่อยู่นั้น แล้วเก็บ snapshot ในเหตุการณ์ `order_log.detail` เพื่อรักษาข้อมูลย้อนหลัง
- ต้องคงกฎเดิมเรื่องจังหวะเปลี่ยนที่อยู่และจำกัดสิทธิ์อ่านข้อมูลส่วนบุคคล
- snapshot เดิมต้องย้ายก่อนตัด `address_snapshot` ใน Checkout/Shipping ไม่เดาย้อนจากสมุดที่อยู่ปัจจุบัน
- **อนุมัติในบทสนทนาติดตาม:** ผู้ใช้ตอบข้อ 2 ว่า “ok เอาตามนั้น” จึงอนุมัติเก็บสำเนาที่อยู่ที่ลูกค้าเลือกใน `order_log.detail` ตามแนวทางที่อธิบายแล้ว ยังไม่ได้ย้ายข้อมูลจริง

### 3. ยอดและข้อมูลย้อนหลัง — M29/M31, อนุมัติ M32/M35

- 3.1: รวมยอด checkout จาก `orders.original_amount` และ `orders.orders_amount` ของ orders ที่อยู่ใน checkout ใช้เลขฐานสิบสำหรับเงินและคงกฎรายการยกเลิก/จ่ายแล้ว
- 3.2: M35 อนุมัติเก็บ **ชื่อสินค้าตอนซื้อ** ใน `order_log.detail` จากข้อมูลที่ backend ตรวจสอบกับ Product ไม่ใช้ชื่อที่ client อ้างหรือชื่อปัจจุบันแทนย้อนหลัง
- ราคาเดิม/ราคาจ่ายจริงยังมีคอลัมน์ใน orders ไม่ย้ายราคาไปไว้เฉพาะ log ไม่ถือว่าต้อง snapshot รูป/รายละเอียดสินค้าทั้งหมด
- 3.3: อ่าน `pre_dispute_status` จากประวัติก่อนเปิดคดีที่บันทึกครบ ไม่เดาว่าปิดคดีแล้วกลับเป็น `completed` ทุกครั้ง
- ตัวอย่าง JSON `schema_version`, `product_id`, `product_title` ใน M34 เป็นตัวอย่างเสนอ ไม่ใช่ format ที่ลงมือใช้แล้ว

### 10. FK เพิ่มใน ER — M29/M31, อนุมัติ M32 และสรุป M34

- `orders.checkout_id` ระบุชุด checkout สำหรับรวมยอดและชำระเงิน
- `orders.basket_id` ระบุรายการตะกร้าที่ใช้สร้าง order
- `hold.payment_id` ระบุ payment ที่ระงับเงิน
- `order_log.order_id` ระบุว่าเหตุการณ์เป็นของ order ไหน

FK ไม่แทนการตรวจ ownership/สิทธิ์หรือความตรงกันของสินค้า ต้องตรวจใน backend ด้วย ไม่จับกลุ่มจากผู้ซื้อ/ผู้ขายหรือเวลาใกล้กันแทน ID

## ข้อ 4: Workflow `dispute_case` — อนุมัติแล้วในบทสนทนาติดตาม

ใน thread ต้นทาง M32/M35 ขอให้อธิบายใหม่ และ M36 ยังไม่ถือว่าอนุมัติ ต่อมาในบทสนทนาที่สั่งบันทึก log ผู้ใช้ยืนยันชัดว่า “ย้ายข้อมูลเสริม 17 ตัวไป `dispute_case_log`” จึงเลือกแนวทาง log ไม่เพิ่ม 17 คอลัมน์เข้า ER และยังไม่ได้ implement

### ข้อมูลหลักตาม ER ที่เสนอคงเป็นคอลัมน์ (9 ตัว)

`dispute_case_id`, `order_id`, `created_by`, `reason`, `decision`, `dispute_case_version`, `dispute_type`, `assigned_to`, `assigned_at`

### ฟิลด์เสริมใน backend ที่อภิปราย (17 ตัว)

- การดำเนินคดี: `status`, `created_at`, `assigned_role`
- การตัดสิน: `decision_reason`, `decided_by`, `decided_at`, `verdict_key`
- การยกระดับ: `escalation_note`, `escalated_by`
- คิว/ความเสี่ยง: `priority`, `priority_score`, `risk_report_count`
- SLA: `sla_expires_at`, `sla_policy_version`, `first_review_due_at`, `first_reviewed_at`, `decision_due_at`

`dispute_case.status` เป็นสถานะคดี ไม่ใช่ `dispute_evidence.dispute_status` ที่อนุมัติ rename

### แนวทางที่อนุมัติในบทสนทนาติดตาม — รายละเอียดจาก M29, M34, M36–M38

- เก็บข้อมูลเสริมที่จำเป็นเป็นเหตุการณ์ใน **`dispute_case_log` ที่มีอยู่** ไม่สร้างตาราง log อีกชุด
- backend ประกอบสถานะ/ข้อมูลปัจจุบันจากตารางคดีและ log ต้องปรับค้นหา/เรียงคิว/SLA/ตัดสินด้วย ไม่ใช่เฉพาะ API รายละเอียด
- เปลี่ยนคดีและเขียน log ใน transaction เดียวกัน ใช้ `dispute_case_version` กันแก้ทับและจัดลำดับ ไม่พึ่งเวลาอย่างเดียว
- ย้ายค่าก่อนตัดคอลัมน์ ระบุข้อมูลเก่าว่าเป็นข้อมูลนำเข้า ไม่แต่งประวัติว่าเหตุการณ์เกิดเมื่อไร
- ทางเลือกอีกแบบ: เพิ่มคอลัมน์สำคัญเข้า ER และใช้ log เป็นประวัติตามปกติ การอ่านง่ายกว่า แต่ต้องอนุมัติเพิ่ม ER ก่อน

เลือกแนวทางแล้ว: ย้ายข้อมูลเสริม 17 ตัวไป `dispute_case_log` ยังต้องกำหนด field/event/read mapping ให้ครบก่อนทำ ไม่ถือว่า log ปัจจุบันแทนทั้ง 17 ฟิลด์ได้แล้ว

### `dispute_case_log` ปัจจุบันตามคำรายงาน M40 (10 คอลัมน์)

| คอลัมน์ | หน้าที่ |
|---|---|
| `dispute_case_log_id` | PK |
| `dispute_case_id` | FK ไปคดี |
| `actor_id` | ผู้ทำรายการ |
| `action` | เช่น `OPEN`, `CLAIM`, `DECIDE` |
| `detail` | ข้อความ บางเหตุการณ์เป็น JSON ในข้อความ |
| `created_at` | เวลาสร้าง log |
| `from_assigned_to` | ผู้รับผิดชอบก่อนเปลี่ยน |
| `to_assigned_to` | ผู้รับผิดชอบหลังเปลี่ยน |
| `from_assigned_role` | บทบาทก่อนเปลี่ยน |
| `to_assigned_role` | บทบาทหลังเปลี่ยน |

สี่ฟิลด์ from/to เว้นว่างได้ สองฟิลด์ role เพิ่มเติมไม่มีใน ER ข้อ 1 ยังต้องกำหนดวิธีเก็บ ขณะนั้น log ยังไม่เก็บข้อมูลเสริมครบทั้งหมด M40 ตรวจจาก schema/code ไม่ใช่อ่านข้อมูล DB จริง

## สถานะและงานค้าง

ยังไม่ได้แก้ ER/schema/migration/backend หรือย้ายข้อมูล ข้อ 4 และ snapshot อนุมัติแล้วในบทสนทนาติดตาม; ผู้ใช้ยืนยัน evidence เชื่อม `dispute_evidence` และอนุมัติ rename `source` → `hold_type` หลังคำอธิบายในบทสนทนาติดตามแล้ว ต้องจัดรายละเอียด mapping/migration และวิธีรักษาสองฟิลด์ role ใน log โดยไม่ขยายขอบเขตเอง จากนั้นตรวจ migration บน DB ชั่วคราว, checkout/payment/hold, FK/ownership, retry/restart, event ซ้ำ, เงินแบบ decimal, ชื่อสินค้า/ที่อยู่ย้อนหลัง, concurrency, คิว/SLA/ตัดสิน และการรักษาข้อมูลเดิม ทั้งหมดนี้ยังเป็นแผน ไม่ใช่ผลผ่าน
