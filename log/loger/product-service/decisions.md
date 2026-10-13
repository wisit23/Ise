# Product Service — สิ่งที่ตรวจและตกลง

ต้นทาง: thread `191c4986-dbe8-41ca-93bf-a26fa649b30a`; Mxx อ้าง [บทสนทนาเต็ม](../sources/191c4986-dbe8-41ca-93bf-a26fa649b30a-transcript.md) ดู [กติกาและสถานะรวม](../README.md)

## สิ่งที่ตรวจพบและการแก้ข้อสังเกต

- M04: ขาด `Count Views`; `products.category` และ `condition` เป็นข้อความ ไม่มี FK บังคับความสัมพันธ์กับ setup ตาม ER
- M09 เคยระบุว่า `Products.id` หาย แต่ M10 แก้แล้วว่า **มีจริงในแบบ** รวมถึง `Marketing Audit Logs.id` และฟิลด์แคมเปญหลายตัว ห้ามใช้รายการก่อนแก้
- ER วาด `Auction Rounds.created_at` ซ้ำ; M14 ให้เหลือหนึ่ง attribute/คอลัมน์ ไม่สร้างเวลาใหม่
- Backend มี `campaigns.spent_budget`, ข้อมูลยกเลิกประมูล, `product_moderation_commands`, `review_photos` และ `review_videos` ที่ต้องรักษาพฤติกรรมเมื่อปรับตาม ER
- M04 รายงาน validate ผ่าน แต่ยังไม่พิสูจน์ migration/flow จริงกับ DB

## ข้อตกลงที่ยืนยันแล้ว

### หมวดหมู่และสภาพสินค้า — M16, M18, M21–M22

- สินค้าหนึ่งชิ้นมีหลายหมวดหมู่ได้: ความสัมพันธ์ Product ↔ Category เป็น M:N
- อนุมัติเพิ่ม `product_categories` ใน ER:
  - `product_id` → `products.id`
  - `category_id` → `categories.id`
  - PK ผสม `(product_id, category_id)` ป้องกันความสัมพันธ์ซ้ำ
- สินค้าหนึ่งชิ้นมี **หนึ่ง Condition**; Condition หนึ่งใช้กับสินค้าได้หลายชิ้น
- เป้าหมายคือต้องบังคับ FK ให้ตรงความหมาย แต่ข้อความยังไม่ได้เลือกรายละเอียดว่าจะอ้าง Condition ด้วย ID หรือค่า unique; ห้ามเพิ่มคอลัมน์นอกแบบที่อนุมัติโดยเดาเอง

### ชื่อและคีย์ — M14, M16

- ใช้ `Auction Rounds.created_at` หนึ่งคอลัมน์ ลบวงรีซ้ำใน ER
- แก้สะกดผิดและใช้ชื่อ SQL `snake_case` รวมชื่อมาตรฐานที่ตกลง
- ชื่อที่ดูเหมือนผิด เช่น `companny`/`company`, `campane_id`/`campaign_id` ต้อง map กับความหมายจริง ไม่เปลี่ยนข้อมูลที่ไม่ใช่เรื่องเดียวกัน

### งบแคมเปญ — ข้อ 7 ใน M29/M31, อนุมัติ M32

- แทน `campaigns.spent_budget` ด้วย `SUM(campaign_attributions.discount_amount)`
- รับ attribution, ตรวจงบ และเปลี่ยนสถานะโดยควบคุม transaction/concurrency
- event เดิมส่งซ้ำต้องไม่เกิดผลซ้ำ; คงจังหวะการนับงบเดิม ไม่เปลี่ยนเป็นนับตอนรับ voucher เอง
- การ SUM ไม่ได้รับประกันว่างบไม่เกิน หากเดิมมีการใช้สิทธิ์ก่อนรายงาน; การเพิ่มกติกาจองงบใหม่ไม่อยู่ในข้อตกลงนี้
- หากยอดเดิมไม่ตรง attribution ต้องตรวจเหตุผลก่อน ห้ามเลือกทิ้งยอดด้านใดเอง

### ประมูลและ moderation — ข้อ 8 ใน M29/M31, อนุมัติ M32

- ย้ายเหตุผล/ผู้ยกเลิก/เวลายกเลิก และ metadata รอบประมูลที่นอกแบบไปเหตุการณ์ใน `marketing_audit_logs`
- อนุมัติขยายหน้าที่ `marketing_audit_logs` ให้ครอบคลุม moderation แทน `product_moderation_commands`
- บันทึก `idempotency_key`, `previous_state`, `new_state`, metadata และผลคำสั่ง พร้อมเปลี่ยนสินค้าใน transaction เดียวกัน
- key เดิม + คำสั่งเดิม → คืนผลเดิม; key เดิม + คำสั่งต่าง → ปฏิเสธ
- ไม่ใช้ audit ฝั่ง Auth แทน transaction ฝั่ง Product และต้องไม่ทำให้เจ้าหน้าที่การตลาดเห็น moderation ทั้งหมดโดยอัตโนมัติ

### สื่อรีวิว — ข้อ 9 ใน M29/M31/M34, อนุมัติ M35–M36

อนุมัติเพิ่ม `review_media` ใน ER แทน `review_photos` และ `review_videos`:

| คอลัมน์ | หน้าที่ |
|---|---|
| `media_id` | PK |
| `review_id` | FK → `reviews.id` |
| `media_type` | `IMAGE` / `VIDEO` |
| `url` | อ้างไฟล์จริงใน uploads |
| `position` | ลำดับแสดง |
| `created_at` | เวลาสร้างรายการ |

ไม่เก็บไฟล์ทั้งก้อนใน DB ไม่ยัดรายการสื่อใน `reviews.comment` และไม่เอารูปสินค้ามาแทนความสัมพันธ์รูปรีวิว ต้องย้ายรายการเดิมรักษา review/ไฟล์/ลำดับให้ครบ

## การทำงานข้าม service

- Order ส่ง attribution จากงานใน `order_log`; Product รับด้วย event ID เดิมและป้องกันนับซ้ำผ่าน `campaign_attributions.event_id`/`order_id` ตามข้อเสนอที่ M32 รับ
- ชื่อสินค้าตอนซื้อให้ Order อ่านจาก Product ที่ backend ตรวจสอบแล้วเพื่อเก็บประวัติ ไม่เชื่อชื่อที่ client ส่งเอง

## งานค้างและเกณฑ์ตรวจ

### คำยืนยันเพิ่มเติมวันที่ 2026-10-13

ผู้ใช้เลือก “คงรีวิวและ ID เดิม ปรับ ER เป็น logical reference” สำหรับ `reviews.product_id` หลังอธิบายว่าการบังคับ FK จะเปลี่ยนพฤติกรรมลบสินค้าเดิม จึงแก้ annotation ใน draw.io เป็น logical reference โดยไม่ลบรีวิว/ID หรือเพิ่มข้อห้ามลบสินค้า ชื่อ `Reviews.date` ใช้ `created_at` ตามกติกาชื่อที่อนุมัติไว้แล้ว ดู ER_AMENDMENT.md ของ Product

ยังไม่ได้แก้ ER/schema/migration/callers หรือย้ายข้อมูลใน thread ต้นทาง ต้องแจกแจง `Count Views`, FK Condition, mapping ชื่อ/constraints และการย้ายข้อมูลให้ครบก่อนทำ ทดสอบ DB ชั่วคราว, event ซ้ำ, concurrency งบ, moderation retry/สิทธิ์, ประมูล และสื่อรีวิว ผลเหล่านี้ยังไม่ใช่ผลทดสอบผ่าน
